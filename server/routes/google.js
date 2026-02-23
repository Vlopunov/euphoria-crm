const express = require('express');
const { google } = require('googleapis');
const { pool, query, queryOne, queryAll } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ==========================================
// Google OAuth2 client setup
// ==========================================
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'
  );
}

// Restore tokens from DB and set them on the client
async function getAuthenticatedClient(userId) {
  const tokenRow = await queryOne(`SELECT * FROM google_tokens WHERE user_id = $1`, [userId]);
  if (!tokenRow) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date ? Number(tokenRow.expiry_date) : undefined,
  });

  // Listen for token refresh events and update DB
  oauth2.on('tokens', (tokens) => {
    const updates = [];
    const params = [];
    let paramIndex = 1;
    if (tokens.access_token) {
      updates.push(`access_token = $${paramIndex++}`);
      params.push(tokens.access_token);
    }
    if (tokens.refresh_token) {
      updates.push(`refresh_token = $${paramIndex++}`);
      params.push(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      updates.push(`expiry_date = $${paramIndex++}`);
      params.push(String(tokens.expiry_date));
    }
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(userId);
      pool.query(`UPDATE google_tokens SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`, params)
        .catch(err => console.error('Error updating Google tokens:', err.message));
    }
  });

  return { oauth2, tokenRow };
}

// ==========================================
// GET /api/google/auth — Start OAuth flow
// ==========================================
router.get('/auth', authenticate, (req, res) => {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: String(req.user.id), // pass user ID through state param
  });
  res.json({ url });
});

// ==========================================
// GET /api/google/callback — OAuth callback
// ==========================================
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = Number(state);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code || !userId) {
    return res.status(400).send('Ошибка: отсутствует код авторизации');
  }

  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Get user email from Google
    const oauth2Service = google.oauth2({ version: 'v2', auth: oauth2 });
    const userInfo = await oauth2Service.userinfo.get();
    const googleEmail = userInfo.data.email;

    // Save or update tokens in DB
    const existing = await queryOne(`SELECT id FROM google_tokens WHERE user_id = $1`, [userId]);
    if (existing) {
      await query(`
        UPDATE google_tokens
        SET access_token = $1, refresh_token = $2, expiry_date = $3, google_email = $4, updated_at = NOW()
        WHERE user_id = $5
      `, [
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? String(tokens.expiry_date) : null,
        googleEmail,
        userId
      ]);
    } else {
      await query(`
        INSERT INTO google_tokens (user_id, access_token, refresh_token, expiry_date, google_email)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        userId,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? String(tokens.expiry_date) : null,
        googleEmail
      ]);
    }

    // Redirect back to frontend settings page
    res.redirect(`${frontendUrl}/settings/google?connected=true`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${frontendUrl}/settings/google?error=auth_failed`);
  }
});

// ==========================================
// GET /api/google/status — Check connection status
// ==========================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const tokenRow = await queryOne(`SELECT google_email, calendar_id, updated_at FROM google_tokens WHERE user_id = $1`, [req.user.id]);
    if (!tokenRow) {
      return res.json({ connected: false });
    }
    res.json({
      connected: true,
      email: tokenRow.google_email,
      calendar_id: tokenRow.calendar_id,
      last_updated: tokenRow.updated_at,
    });
  } catch (err) {
    console.error('Google status error:', err.message);
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ==========================================
// GET /api/google/calendars — List available calendars
// ==========================================
router.get('/calendars', authenticate, async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.user.id);
    if (!auth) return res.status(400).json({ error: 'Google не подключён' });

    const calendar = google.calendar({ version: 'v3', auth: auth.oauth2 });
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
    }));
    res.json(calendars);
  } catch (err) {
    console.error('Error fetching calendars:', err.message);
    res.status(500).json({ error: 'Не удалось получить список календарей' });
  }
});

// ==========================================
// PUT /api/google/calendar — Select calendar
// ==========================================
router.put('/calendar', authenticate, async (req, res) => {
  try {
    const { calendar_id } = req.body;
    if (!calendar_id) return res.status(400).json({ error: 'calendar_id обязателен' });

    await query(`UPDATE google_tokens SET calendar_id = $1, updated_at = NOW() WHERE user_id = $2`, [calendar_id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Google calendar update error:', err.message);
    res.status(500).json({ error: 'Ошибка обновления календаря' });
  }
});

// ==========================================
// Core sync logic (reusable for API + cron)
// ==========================================
async function syncGoogleEvents(userId) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google не подключён');

  const calendarId = auth.tokenRow.calendar_id || 'primary';
  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2 });

  // Sync events from 30 days ago to 90 days in the future
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 90);

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: 500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  let added = 0;
  let updated = 0;
  let deleted = 0;

  const existingEvents = await queryAll(`SELECT google_event_id FROM google_calendar_events WHERE calendar_id = $1`, [calendarId]);
  const existingIds = new Set(existingEvents.map(e => e.google_event_id));
  const fetchedIds = new Set();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const event of events) {
      if (!event.start || (!event.start.dateTime && !event.start.date)) continue;

      const googleEventId = event.id;
      fetchedIds.add(googleEventId);

      const startDt = event.start.dateTime || `${event.start.date}T00:00:00`;
      const endDt = event.end?.dateTime || `${event.end?.date}T23:59:59`;

      const existingRow = await client.query(`SELECT id FROM google_calendar_events WHERE google_event_id = $1`, [googleEventId]);

      if (existingRow.rows.length > 0) {
        await client.query(`
          UPDATE google_calendar_events
          SET summary = $1, description = $2, start_datetime = $3, end_datetime = $4, location = $5,
              calendar_id = $6, is_deleted = 0, last_synced_at = NOW()
          WHERE google_event_id = $7
        `, [
          event.summary || '(без названия)',
          event.description || null,
          startDt,
          endDt,
          event.location || null,
          calendarId,
          googleEventId
        ]);
        updated++;
      } else {
        await client.query(`
          INSERT INTO google_calendar_events (google_event_id, summary, description, start_datetime, end_datetime, location, calendar_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          googleEventId,
          event.summary || '(без названия)',
          event.description || null,
          startDt,
          endDt,
          event.location || null,
          calendarId
        ]);
        added++;
      }
    }

    for (const existingId of existingIds) {
      if (!fetchedIds.has(existingId)) {
        await client.query(`UPDATE google_calendar_events SET is_deleted = 1, last_synced_at = NOW() WHERE google_event_id = $1`, [existingId]);
        deleted++;
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { added, updated, deleted, total: events.length };
}

// ==========================================
// Auto-sync all connected accounts (for cron)
// ==========================================
async function syncAllAccounts() {
  const tokens = await queryAll(`SELECT user_id, google_email FROM google_tokens`, []);
  if (tokens.length === 0) return;

  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' });
  console.log(`[CRON ${now}] Авто-синхронизация Google Calendar для ${tokens.length} аккаунт(ов)...`);

  for (const token of tokens) {
    try {
      const stats = await syncGoogleEvents(token.user_id);
      console.log(`  ✓ ${token.google_email}: +${stats.added} новых, ${stats.updated} обновлено, ${stats.deleted} удалено (всего: ${stats.total})`);
    } catch (err) {
      console.error(`  ✗ ${token.google_email}: ${err.message}`);
      if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
        await query(`DELETE FROM google_tokens WHERE user_id = $1`, [token.user_id]);
        console.error(`    → Токен удалён, нужна повторная авторизация`);
      }
    }
  }
}

// Export for cron scheduler
router.syncAllAccounts = syncAllAccounts;

// ==========================================
// POST /api/google/sync — Import events from Google Calendar
// ==========================================
router.post('/sync', authenticate, async (req, res) => {
  try {
    const stats = await syncGoogleEvents(req.user.id);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Google sync error:', err.message);
    if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
      await query(`DELETE FROM google_tokens WHERE user_id = $1`, [req.user.id]);
      return res.status(401).json({ error: 'Токен Google истёк. Подключите заново.' });
    }
    res.status(500).json({ error: 'Ошибка синхронизации: ' + err.message });
  }
});

// ==========================================
// DELETE /api/google/disconnect — Remove Google connection
// ==========================================
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM google_tokens WHERE user_id = $1`, [req.user.id]);
    // Optionally: don't delete events, keep them for history
    res.json({ success: true });
  } catch (err) {
    console.error('Google disconnect error:', err.message);
    res.status(500).json({ error: 'Ошибка отключения' });
  }
});

// ==========================================
// GET /api/google/events — Get synced Google events (for calendar display)
// ==========================================
router.get('/events', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let sql = `SELECT * FROM google_calendar_events WHERE is_deleted = 0`;
    const params = [];
    let paramIndex = 1;
    if (start) {
      sql += ` AND end_datetime >= $${paramIndex++}`;
      params.push(start);
    }
    if (end) {
      sql += ` AND start_datetime <= $${paramIndex++}`;
      params.push(end);
    }
    sql += ` ORDER BY start_datetime`;
    const events = await queryAll(sql, params);

    // Format for FullCalendar
    const formatted = events.map(e => ({
      id: `google_${e.id}`,
      title: e.summary || '(без названия)',
      start: e.start_datetime,
      end: e.end_datetime,
      backgroundColor: '#8b5cf6',
      borderColor: '#7c3aed',
      textColor: '#ffffff',
      extendedProps: {
        source: 'google',
        description: e.description,
        location: e.location,
        google_event_id: e.google_event_id,
      },
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Google events error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки событий' });
  }
});

module.exports = router;

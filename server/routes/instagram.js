const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool, query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const META_API = 'https://graph.facebook.com/v21.0';

// ==========================================
// Helper: call Meta Graph API
// ==========================================
async function metaApi(path, options = {}) {
  const url = path.startsWith('http') ? path : `${META_API}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Meta API error');
  return data;
}

// Helper: get stored Instagram connection
async function getConnection() {
  return await queryOne(`SELECT * FROM instagram_tokens LIMIT 1`, []);
}

// ==========================================
// WEBHOOK VERIFICATION (Meta вызывает — без аутентификации)
// ==========================================
router.get('/webhook', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
      const connection = await getConnection();
      if (connection && token === connection.webhook_verify_token) {
        console.log('[Instagram Webhook] Верификация пройдена ✓');
        return res.status(200).send(challenge);
      }
    }
    console.log('[Instagram Webhook] Верификация отклонена ✗');
    res.status(403).send('Forbidden');
  } catch (err) {
    console.error('[Instagram Webhook] Verification error:', err.message);
    res.status(500).send('Error');
  }
});

// ==========================================
// WEBHOOK HANDLER (приём входящих DM — без аутентификации)
// ==========================================
router.post('/webhook', async (req, res) => {
  // Meta требует быстрый ответ
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    const connection = await getConnection();
    if (!connection) return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || !event.message.text) continue;
        // Skip echo messages (our own outgoing messages)
        if (event.message.is_echo) continue;

        const senderId = event.sender.id;
        const messageId = event.message.mid;
        const messageText = event.message.text;
        const timestamp = event.timestamp;

        await processIncomingMessage(connection, senderId, messageId, messageText, timestamp);
      }
    }
  } catch (err) {
    console.error('[Instagram Webhook] Ошибка обработки:', err.message);
  }
});

// ==========================================
// Process a single incoming DM
// ==========================================
async function processIncomingMessage(connection, senderId, messageId, messageText, timestamp) {
  // Idempotency: skip if already processed
  const existing = await queryOne(`SELECT id FROM instagram_messages WHERE ig_message_id = $1`, [messageId]);
  if (existing) return;

  // Look up or create conversation
  let conversation = await queryOne(`SELECT * FROM instagram_conversations WHERE ig_sender_id = $1`, [senderId]);

  if (!conversation) {
    // New sender — fetch profile, create client + lead
    let igUsername = null;
    let igName = null;

    try {
      const profile = await metaApi(`/${senderId}?fields=username,name&access_token=${connection.page_access_token}`);
      igUsername = profile.username || null;
      igName = profile.name || null;
    } catch (err) {
      console.error('[Instagram] Не удалось получить профиль:', err.message);
      igName = `Instagram User ${senderId.slice(-6)}`;
    }

    // Check if client with this instagram handle already exists
    let clientId = null;
    if (igUsername) {
      const existingClient = await queryOne(`SELECT id FROM clients WHERE instagram LIKE $1`, [`%${igUsername}%`]);
      if (existingClient) clientId = existingClient.id;
    }

    const client = await pool.connect();
    let conversationId;
    try {
      await client.query('BEGIN');

      // Create client if not found
      if (!clientId) {
        const clientResult = await client.query(`
          INSERT INTO clients (name, instagram, source, comment)
          VALUES ($1, $2, 'instagram', $3)
          RETURNING id
        `, [
          igName || igUsername || 'IG User',
          igUsername ? `@${igUsername}` : null,
          'Автоматически создан из Instagram DM'
        ]);
        clientId = clientResult.rows[0].id;
      }

      // Create lead
      const leadResult = await client.query(`
        INSERT INTO leads (client_id, source, status, comment)
        VALUES ($1, 'instagram', 'new', $2)
        RETURNING id
      `, [clientId, `Входящее сообщение из Instagram: ${messageText.substring(0, 200)}`]);
      const leadId = leadResult.rows[0].id;

      // Create conversation
      const convResult = await client.query(`
        INSERT INTO instagram_conversations (ig_sender_id, ig_username, ig_name, client_id, lead_id, last_message_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `, [senderId, igUsername, igName, clientId, leadId]);
      conversationId = convResult.rows[0].id;

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    conversation = await queryOne(`SELECT * FROM instagram_conversations WHERE id = $1`, [conversationId]);
    console.log(`[Instagram] Новая переписка: @${igUsername || senderId} → клиент #${clientId}, лид #${conversation.lead_id}`);
  }

  // Save message
  await query(`
    INSERT INTO instagram_messages (conversation_id, ig_message_id, direction, message_text, ig_timestamp)
    VALUES ($1, $2, 'incoming', $3, $4)
  `, [conversation.id, messageId, messageText, timestamp ? new Date(Number(timestamp)).toISOString() : null]);

  // Update conversation
  await query(`
    UPDATE instagram_conversations
    SET unread_count = unread_count + 1, last_message_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [conversation.id]);
}

// ==========================================
// GET /api/instagram/auth — Start Facebook OAuth
// ==========================================
router.get('/auth', authenticate, (req, res) => {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI || (process.env.RENDER ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/api/instagram/callback` : 'http://localhost:3001/api/instagram/callback');
  console.log('[Instagram Auth] Using redirect_uri:', redirectUri);

  const url = `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=instagram_manage_messages,pages_messaging,pages_show_list,instagram_basic` +
    `&state=${req.user.id}`;

  res.json({ url });
});

// ==========================================
// GET /api/instagram/callback — OAuth callback
// ==========================================
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = Number(state);
  const frontendUrl = process.env.FRONTEND_URL || (process.env.RENDER ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : 'http://localhost:5173');

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/settings/instagram?error=no_code`);
  }

  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI || (process.env.RENDER ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/api/instagram/callback` : 'http://localhost:3001/api/instagram/callback');

    // 1. Exchange code for short-lived token
    const tokenData = await metaApi(
      `/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const shortToken = tokenData.access_token;

    // 2. Exchange for long-lived user token
    const longTokenData = await metaApi(
      `/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    const longUserToken = longTokenData.access_token;

    // 3. Get user info
    const fbUser = await metaApi(`/me?fields=id,name&access_token=${longUserToken}`);

    // 4. Get user's Pages
    const pagesData = await metaApi(`/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longUserToken}`);
    const pages = pagesData.data || [];

    // Find page with Instagram Business Account
    let selectedPage = null;
    let igAccountId = null;
    for (const page of pages) {
      if (page.instagram_business_account) {
        selectedPage = page;
        igAccountId = page.instagram_business_account.id;
        break;
      }
    }

    if (!selectedPage || !igAccountId) {
      return res.redirect(`${frontendUrl}/settings/instagram?error=no_ig_account`);
    }

    // 5. Get IG username
    const igProfile = await metaApi(`/${igAccountId}?fields=username,name&access_token=${selectedPage.access_token}`);

    // 6. Generate webhook verify token
    const webhookVerifyToken = uuidv4();

    // 7. Save to DB (upsert — single row)
    const existingToken = await queryOne(`SELECT id FROM instagram_tokens LIMIT 1`, []);
    if (existingToken) {
      await query(`
        UPDATE instagram_tokens
        SET connected_by=$1, fb_user_id=$2, fb_user_name=$3, page_id=$4, page_name=$5,
            page_access_token=$6, ig_user_id=$7, ig_username=$8, webhook_verify_token=$9, updated_at=NOW()
        WHERE id=$10
      `, [userId, fbUser.id, fbUser.name, selectedPage.id, selectedPage.name,
        selectedPage.access_token, igAccountId, igProfile.username || igProfile.name,
        webhookVerifyToken, existingToken.id]);
    } else {
      await query(`
        INSERT INTO instagram_tokens (connected_by, fb_user_id, fb_user_name, page_id, page_name, page_access_token, ig_user_id, ig_username, webhook_verify_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, fbUser.id, fbUser.name, selectedPage.id, selectedPage.name,
        selectedPage.access_token, igAccountId, igProfile.username || igProfile.name,
        webhookVerifyToken]);
    }

    // 8. Subscribe page to webhooks
    try {
      await metaApi(`/${selectedPage.id}/subscribed_apps`, {
        method: 'POST',
        body: JSON.stringify({
          subscribed_fields: ['messages'],
          access_token: selectedPage.access_token,
        }),
      });
    } catch (e) {
      console.warn('[Instagram] Подписка на вебхуки:', e.message);
    }

    res.redirect(`${frontendUrl}/settings/instagram?connected=true`);
  } catch (err) {
    console.error('[Instagram OAuth] Ошибка:', err.message);
    res.redirect(`${frontendUrl}/settings/instagram?error=${encodeURIComponent(err.message)}`);
  }
});

// ==========================================
// GET /api/instagram/status — Connection status
// ==========================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const conn = await getConnection();
    if (!conn) return res.json({ connected: false });
    res.json({
      connected: true,
      ig_username: conn.ig_username,
      page_name: conn.page_name,
      webhook_verify_token: conn.webhook_verify_token,
      updated_at: conn.updated_at,
    });
  } catch (err) {
    console.error('[Instagram] Status error:', err.message);
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ==========================================
// DELETE /api/instagram/disconnect
// ==========================================
router.delete('/disconnect', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    await query(`DELETE FROM instagram_tokens`, []);
    res.json({ success: true });
  } catch (err) {
    console.error('[Instagram] Disconnect error:', err.message);
    res.status(500).json({ error: 'Ошибка отключения' });
  }
});

// ==========================================
// GET /api/instagram/conversations — All conversations
// ==========================================
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await queryAll(`
      SELECT ic.*,
        c.name as client_name, c.phone as client_phone,
        l.status as lead_status,
        (SELECT message_text FROM instagram_messages
         WHERE conversation_id = ic.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM instagram_conversations ic
      LEFT JOIN clients c ON ic.client_id = c.id
      LEFT JOIN leads l ON ic.lead_id = l.id
      WHERE ic.is_archived = 0
      ORDER BY ic.last_message_at DESC
    `, []);
    res.json(conversations);
  } catch (err) {
    console.error('[Instagram] Conversations error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки переписок' });
  }
});

// ==========================================
// GET /api/instagram/conversations/:id — Single conversation + messages
// ==========================================
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const conversation = await queryOne(`
      SELECT ic.*,
        c.name as client_name, c.phone as client_phone, c.instagram as client_instagram,
        l.status as lead_status, l.id as lead_id
      FROM instagram_conversations ic
      LEFT JOIN clients c ON ic.client_id = c.id
      LEFT JOIN leads l ON ic.lead_id = l.id
      WHERE ic.id = $1
    `, [req.params.id]);

    if (!conversation) return res.status(404).json({ error: 'Переписка не найдена' });

    const messages = await queryAll(`
      SELECT im.*, u.name as sender_name
      FROM instagram_messages im
      LEFT JOIN users u ON im.sent_by = u.id
      WHERE im.conversation_id = $1
      ORDER BY im.created_at ASC
    `, [req.params.id]);

    // Reset unread count
    await query(`UPDATE instagram_conversations SET unread_count = 0 WHERE id = $1`, [req.params.id]);

    res.json({ ...conversation, messages });
  } catch (err) {
    console.error('[Instagram] Conversation detail error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки переписки' });
  }
});

// ==========================================
// POST /api/instagram/conversations/:id/reply — Send reply
// ==========================================
router.post('/conversations/:id/reply', authenticate, authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Текст сообщения обязателен' });

    const conversation = await queryOne(`SELECT * FROM instagram_conversations WHERE id = $1`, [req.params.id]);
    if (!conversation) return res.status(404).json({ error: 'Переписка не найдена' });

    const connection = await getConnection();
    if (!connection) return res.status(400).json({ error: 'Instagram не подключён' });

    // Send message via Meta API
    await metaApi(`/${connection.ig_user_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: conversation.ig_sender_id },
        message: { text: text.trim() },
        access_token: connection.page_access_token,
      }),
    });

    // Save outgoing message
    const result = await query(`
      INSERT INTO instagram_messages (conversation_id, direction, message_text, sent_by)
      VALUES ($1, 'outgoing', $2, $3)
      RETURNING id
    `, [req.params.id, text.trim(), req.user.id]);
    const messageId = result.rows[0].id;

    // Update conversation timestamp
    await query(`UPDATE instagram_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id]);

    const message = await queryOne(`
      SELECT im.*, u.name as sender_name
      FROM instagram_messages im
      LEFT JOIN users u ON im.sent_by = u.id
      WHERE im.id = $1
    `, [messageId]);

    res.json(message);
  } catch (err) {
    console.error('[Instagram Reply] Ошибка:', err.message);
    res.status(500).json({ error: 'Не удалось отправить: ' + err.message });
  }
});

// ==========================================
// GET /api/instagram/unread-count — Total unread badge
// ==========================================
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const row = await queryOne(`SELECT COALESCE(SUM(unread_count), 0) as total FROM instagram_conversations WHERE is_archived = 0`, []);
    res.json({ total: row.total });
  } catch (err) {
    console.error('[Instagram] Unread count error:', err.message);
    res.status(500).json({ error: 'Ошибка подсчёта непрочитанных' });
  }
});

module.exports = router;

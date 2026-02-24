/**
 * Tilda.cc Website Integration
 *
 * POST /webhook?key=xxx  — Tilda sends form data here (no auth)
 * GET  /status           — Integration status
 * POST /setup            — Generate API key and activate
 * PUT  /mapping          — Update field mapping
 * POST /regenerate-key   — Generate new API key
 * DELETE /disconnect     — Deactivate integration
 * GET  /submissions      — Recent submissions log
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool, query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Parse urlencoded for webhook only (Tilda sends both JSON and form-urlencoded)
router.use('/webhook', express.urlencoded({ extended: true }));

// Default Tilda field names
const DEFAULT_FIELDS = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  comment: 'comment',
  event_type: '',
  desired_date: '',
  guest_count: '',
};

// Normalize phone: keep only digits and leading +
function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned || null;
}

// Get config helper
async function getConfig() {
  return await queryOne('SELECT * FROM tilda_config WHERE is_active = 1 LIMIT 1');
}

// Extract field value from body using mapping
function extractField(body, mapping, field) {
  const tildaName = mapping[field] || DEFAULT_FIELDS[field];
  if (!tildaName) return null;
  // Try exact case, then lowercase (Tilda field names can vary)
  return body[tildaName] || body[tildaName.toLowerCase()] || body[tildaName.toUpperCase()] || null;
}

// ==========================================
// POST /webhook — Tilda form submission (no auth!)
// ==========================================
router.post('/webhook', async (req, res) => {
  // Always return 200 to prevent Tilda retries
  res.status(200).json({ success: true });

  try {
    const apiKey = req.query.key;
    const config = await getConfig();

    // Validate API key
    if (!config || config.api_key !== apiKey) {
      console.warn('[Tilda] Invalid API key attempt');
      return;
    }

    const body = req.body || {};
    const tranid = body.tranid || body.Tranid || null;
    const formid = body.formid || body.Formid || null;
    const formname = body.formname || body.Formname || null;

    // Idempotency: check tranid
    if (tranid) {
      const existing = await queryOne('SELECT id FROM tilda_submissions WHERE tranid = $1', [tranid]);
      if (existing) {
        console.log(`[Tilda] Duplicate tranid ${tranid}, skipping`);
        return;
      }
    }

    // Extract fields using mapping
    const mapping = config.field_mapping || DEFAULT_FIELDS;
    const name = extractField(body, mapping, 'name') || body.Name || body.name || 'Заявка с сайта';
    const rawPhone = extractField(body, mapping, 'phone') || body.Phone || body.phone || null;
    const phone = normalizePhone(rawPhone);
    const email = extractField(body, mapping, 'email') || body.Email || body.email || null;
    const comment = extractField(body, mapping, 'comment') || body.comment || null;
    const eventType = extractField(body, mapping, 'event_type') || null;
    const desiredDate = extractField(body, mapping, 'desired_date') || null;
    const guestCountRaw = extractField(body, mapping, 'guest_count') || null;
    const guestCount = guestCountRaw ? parseInt(String(guestCountRaw).replace(/\D/g, '')) || null : null;

    // Create client + lead in transaction
    const client = await pool.connect();
    let clientId, leadId;

    try {
      await client.query('BEGIN');

      // Find or create client by phone
      let existingClient = null;
      if (phone) {
        const { rows } = await client.query('SELECT id FROM clients WHERE phone = $1 AND is_archived = 0', [phone]);
        if (rows.length > 0) existingClient = rows[0];
      }

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { rows } = await client.query(`
          INSERT INTO clients (name, phone, source, comment)
          VALUES ($1, $2, 'website', $3)
          RETURNING id
        `, [name, phone, email ? `Email: ${email}` : 'Заявка с сайта (Tilda)']);
        clientId = rows[0].id;
      }

      // Build lead comment
      const leadParts = [];
      if (formname) leadParts.push(`Форма: ${formname}`);
      if (email) leadParts.push(`Email: ${email}`);
      if (comment) leadParts.push(comment);
      // Add any extra unknown fields
      const knownKeys = new Set(['tranid', 'Tranid', 'formid', 'Formid', 'formname', 'Formname',
        mapping.name, mapping.phone, mapping.email, mapping.comment,
        mapping.event_type, mapping.desired_date, mapping.guest_count,
        'Name', 'Phone', 'Email', 'name', 'phone', 'email', 'comment']);
      for (const [key, val] of Object.entries(body)) {
        if (!knownKeys.has(key) && val && typeof val === 'string' && val.trim()) {
          leadParts.push(`${key}: ${val}`);
        }
      }
      const leadComment = leadParts.join('\n') || 'Заявка с сайта Tilda';

      // Create lead
      const { rows: leadRows } = await client.query(`
        INSERT INTO leads (client_id, desired_date, guest_count, event_type, source, status, comment)
        VALUES ($1, $2, $3, $4, 'website', 'new', $5)
        RETURNING id
      `, [clientId, desiredDate, guestCount, eventType || 'Мероприятие', leadComment]);
      leadId = leadRows[0].id;

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Log submission
    await query(`
      INSERT INTO tilda_submissions (tranid, formid, formname, raw_data, client_id, lead_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'processed')
    `, [tranid, formid, formname, JSON.stringify(body), clientId, leadId]);

    console.log(`[Tilda] New lead #${leadId} from ${name} (${phone || 'no phone'})`);

    // Telegram notification (fire-and-forget)
    try {
      const { notifyNewTildaLead } = require('../telegram/notifications');
      notifyNewTildaLead({ id: leadId, clientName: name, phone, email, formName: formname, comment });
    } catch (e) {
      // Never break the flow
    }

  } catch (err) {
    console.error('[Tilda Webhook] Error:', err.message);
    // Try to log the failed submission
    try {
      await query(`
        INSERT INTO tilda_submissions (tranid, raw_data, status, error_message)
        VALUES ($1, $2, 'error', $3)
      `, [req.body?.tranid || null, JSON.stringify(req.body || {}), err.message]);
    } catch (logErr) {
      // Can't even log — just console
    }
  }
});

// ==========================================
// GET /status — Integration status
// ==========================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const config = await getConfig();
    if (!config) return res.json({ connected: false });

    const countRow = await queryOne('SELECT COUNT(*) as cnt FROM tilda_submissions');
    const lastRow = await queryOne('SELECT created_at FROM tilda_submissions ORDER BY created_at DESC LIMIT 1');

    // Build webhook URL
    const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const webhookUrl = `${baseUrl}/api/tilda/webhook?key=${config.api_key}`;

    res.json({
      connected: true,
      api_key: config.api_key,
      webhook_url: webhookUrl,
      field_mapping: config.field_mapping || DEFAULT_FIELDS,
      submission_count: Number(countRow.cnt),
      last_submission_at: lastRow?.created_at || null,
      updated_at: config.updated_at,
    });
  } catch (err) {
    console.error('[Tilda] Status error:', err.message);
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ==========================================
// POST /setup — Generate API key
// ==========================================
router.post('/setup', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const apiKey = uuidv4();

    const existing = await queryOne('SELECT id FROM tilda_config LIMIT 1');
    if (existing) {
      await query(`
        UPDATE tilda_config
        SET api_key = $1, is_active = 1, created_by = $2, updated_at = NOW()
        WHERE id = $3
      `, [apiKey, req.user.id, existing.id]);
    } else {
      await query(`
        INSERT INTO tilda_config (api_key, created_by)
        VALUES ($1, $2)
      `, [apiKey, req.user.id]);
    }

    const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const webhookUrl = `${baseUrl}/api/tilda/webhook?key=${apiKey}`;

    console.log('[Tilda] Integration activated');
    res.json({ success: true, api_key: apiKey, webhook_url: webhookUrl });
  } catch (err) {
    console.error('[Tilda] Setup error:', err.message);
    res.status(500).json({ error: 'Ошибка настройки' });
  }
});

// ==========================================
// PUT /mapping — Update field mapping
// ==========================================
router.put('/mapping', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { field_mapping } = req.body;
    if (!field_mapping || typeof field_mapping !== 'object') {
      return res.status(400).json({ error: 'field_mapping должен быть объектом' });
    }
    await query('UPDATE tilda_config SET field_mapping = $1, updated_at = NOW()', [JSON.stringify(field_mapping)]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Tilda] Mapping update error:', err.message);
    res.status(500).json({ error: 'Ошибка обновления маппинга' });
  }
});

// ==========================================
// POST /regenerate-key — New API key
// ==========================================
router.post('/regenerate-key', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const newKey = uuidv4();
    await query('UPDATE tilda_config SET api_key = $1, updated_at = NOW()', [newKey]);

    const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const webhookUrl = `${baseUrl}/api/tilda/webhook?key=${newKey}`;

    console.log('[Tilda] API key regenerated');
    res.json({ success: true, api_key: newKey, webhook_url: webhookUrl });
  } catch (err) {
    console.error('[Tilda] Regenerate key error:', err.message);
    res.status(500).json({ error: 'Ошибка генерации ключа' });
  }
});

// ==========================================
// DELETE /disconnect — Deactivate
// ==========================================
router.delete('/disconnect', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    await query('UPDATE tilda_config SET is_active = 0, updated_at = NOW()');
    console.log('[Tilda] Integration disconnected');
    res.json({ success: true });
  } catch (err) {
    console.error('[Tilda] Disconnect error:', err.message);
    res.status(500).json({ error: 'Ошибка отключения' });
  }
});

// ==========================================
// GET /submissions — Recent submissions
// ==========================================
router.get('/submissions', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const submissions = await queryAll(`
      SELECT ts.*,
        c.name as client_name, c.phone as client_phone,
        l.status as lead_status
      FROM tilda_submissions ts
      LEFT JOIN clients c ON ts.client_id = c.id
      LEFT JOIN leads l ON ts.lead_id = l.id
      ORDER BY ts.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(submissions);
  } catch (err) {
    console.error('[Tilda] Submissions error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки заявок' });
  }
});

module.exports = router;

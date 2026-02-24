/**
 * Telegram Bot API routes
 *
 * POST /webhook        — Telegram webhook (no auth)
 * GET  /status         — Bot connection status
 * POST /setup          — Connect bot with token
 * PUT  /welcome        — Update welcome message
 * DELETE /disconnect   — Disconnect bot
 * GET  /conversations  — Client conversations list
 */
const express = require('express');
const { Telegraf } = require('telegraf');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { createBot, getBot, getConfig } = require('../telegram/bot');

const router = express.Router();

// ==========================================
// POST /webhook — Telegram sends updates here (no auth!)
// ==========================================
router.post('/webhook', async (req, res) => {
  // Respond 200 immediately (Telegram expects fast response)
  res.status(200).send('OK');

  try {
    const bot = getBot();
    if (!bot) {
      console.warn('[TG Webhook] No bot instance — reinitializing...');
      try {
        await createBot();
        const newBot = getBot();
        if (newBot) await newBot.handleUpdate(req.body);
      } catch (initErr) {
        console.error('[TG Webhook] Reinit failed:', initErr.message);
      }
      return;
    }
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('[TG Webhook] Error:', err.message, err.stack);
  }
});

// ==========================================
// GET /status — Bot status for settings UI
// ==========================================
router.get('/status', authenticate, async (req, res) => {
  try {
    const config = await getConfig();
    if (!config) return res.json({ connected: false });

    // Count linked staff
    const staffRow = await queryOne('SELECT COUNT(*) as cnt FROM users WHERE telegram_chat_id IS NOT NULL AND is_active = 1');
    // Count conversations
    const convRow = await queryOne('SELECT COUNT(*) as cnt FROM telegram_conversations');

    res.json({
      connected: true,
      bot_username: config.bot_username,
      webhook_url: config.webhook_url,
      welcome_message: config.welcome_message,
      linked_staff: Number(staffRow.cnt),
      conversations: Number(convRow.cnt),
      updated_at: config.updated_at,
    });
  } catch (err) {
    console.error('[TG] Status error:', err.message);
    res.status(500).json({ error: 'Ошибка проверки статуса' });
  }
});

// ==========================================
// POST /setup — Connect bot with token
// ==========================================
router.post('/setup', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { token } = req.body;
    if (!token?.trim()) return res.status(400).json({ error: 'Токен обязателен' });

    // 1. Validate token via getMe()
    let botInfo;
    try {
      const tempBot = new Telegraf(token.trim());
      botInfo = await tempBot.telegram.getMe();
    } catch (err) {
      return res.status(400).json({ error: 'Неверный токен. Проверьте токен от @BotFather.' });
    }

    // 2. Set webhook URL
    const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    try {
      const tempBot = new Telegraf(token.trim());
      await tempBot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
    } catch (err) {
      console.error('[TG Setup] Webhook error:', err.message);
      // Don't fail — webhook can be set later
    }

    // 3. Save to DB (upsert — single row)
    const existing = await queryOne('SELECT id FROM telegram_bot_config LIMIT 1');
    if (existing) {
      await query(`
        UPDATE telegram_bot_config
        SET bot_token = $1, bot_username = $2, webhook_url = $3, is_active = 1, updated_at = NOW()
        WHERE id = $4
      `, [token.trim(), botInfo.username, webhookUrl, existing.id]);
    } else {
      await query(`
        INSERT INTO telegram_bot_config (bot_token, bot_username, webhook_url)
        VALUES ($1, $2, $3)
      `, [token.trim(), botInfo.username, webhookUrl]);
    }

    // 4. Create/recreate the bot instance
    await createBot();

    console.log(`[TG] Bot connected: @${botInfo.username}`);
    res.json({
      success: true,
      bot_username: botInfo.username,
      webhook_url: webhookUrl,
    });
  } catch (err) {
    console.error('[TG Setup] Error:', err.message);
    res.status(500).json({ error: 'Ошибка подключения бота: ' + err.message });
  }
});

// ==========================================
// PUT /welcome — Update welcome message
// ==========================================
router.put('/welcome', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { welcome_message } = req.body;
    await query('UPDATE telegram_bot_config SET welcome_message = $1, updated_at = NOW()', [welcome_message || null]);
    res.json({ success: true });
  } catch (err) {
    console.error('[TG] Welcome update error:', err.message);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// ==========================================
// DELETE /disconnect — Remove bot
// ==========================================
router.delete('/disconnect', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const config = await getConfig();
    if (config) {
      // Delete webhook
      try {
        const tempBot = new Telegraf(config.bot_token);
        await tempBot.telegram.deleteWebhook({ drop_pending_updates: true });
      } catch (err) {
        console.warn('[TG] Webhook delete warning:', err.message);
      }
    }

    await query('DELETE FROM telegram_bot_config');
    // Clear staff links
    await query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id IS NOT NULL');

    console.log('[TG] Bot disconnected');
    res.json({ success: true });
  } catch (err) {
    console.error('[TG] Disconnect error:', err.message);
    res.status(500).json({ error: 'Ошибка отключения' });
  }
});

// ==========================================
// GET /conversations — Client conversations
// ==========================================
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await queryAll(`
      SELECT tc.*,
        c.name as client_name, c.phone as client_phone,
        l.status as lead_status,
        (SELECT message_text FROM telegram_messages
         WHERE conversation_id = tc.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM telegram_conversations tc
      LEFT JOIN clients c ON tc.client_id = c.id
      LEFT JOIN leads l ON tc.lead_id = l.id
      ORDER BY tc.last_message_at DESC
    `);
    res.json(conversations);
  } catch (err) {
    console.error('[TG] Conversations error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки переписок' });
  }
});

// Initialize bot on module load (if config exists)
async function initBot() {
  try {
    const config = await getConfig();
    if (config) {
      await createBot();
      console.log(`🤖 Telegram бот инициализирован: @${config.bot_username}`);

      // Verify/re-set webhook on startup (handles Render cold starts)
      try {
        const baseUrl = process.env.RENDER_EXTERNAL_HOSTNAME
          ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
          : process.env.BASE_URL || null;
        if (baseUrl) {
          const expectedWebhook = `${baseUrl}/api/telegram/webhook`;
          if (config.webhook_url !== expectedWebhook) {
            const tempBot = new Telegraf(config.bot_token);
            await tempBot.telegram.setWebhook(expectedWebhook, { drop_pending_updates: false });
            await query('UPDATE telegram_bot_config SET webhook_url = $1 WHERE id = $2', [expectedWebhook, config.id]);
            console.log(`[TG] Webhook updated: ${expectedWebhook}`);
          }
        }
      } catch (whErr) {
        console.warn('[TG] Webhook verify warning:', whErr.message);
      }
    }
  } catch (err) {
    console.error('[TG] Init error:', err.message);
  }
}

router.initBot = initBot;

module.exports = router;

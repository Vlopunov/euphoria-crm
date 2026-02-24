/**
 * Telegram Bot для Эйфория CRM
 *
 * Один бот для двух аудиторий:
 * - Команда: /link, /today, /tomorrow, /week, /stats, /search
 * - Клиенты: Свободные даты, Цены, Оставить заявку, Связаться
 */
const { Telegraf, Markup } = require('telegraf');
const bcrypt = require('bcryptjs');
const { queryOne, queryAll, query, pool } = require('../db/database');
const { calculatePrice, getDayType, getDayTypeLabel } = require('../utils/pricing');
const {
  BOOKING_STATUS_LABELS, BOOKING_STATUS_EMOJI,
  formatDateTg, formatDateFullTg, formatMoney, escapeHtml,
  todayMinsk, daysFromNow,
} = require('./utils');

let bot = null;

// ==========================================
// BOT LIFECYCLE
// ==========================================

async function getConfig() {
  return await queryOne('SELECT * FROM telegram_bot_config WHERE is_active = 1 LIMIT 1');
}

async function createBot() {
  const config = await getConfig();
  if (!config) return null;

  bot = new Telegraf(config.bot_token);

  // ---- Staff middleware check ----
  async function isStaff(chatId) {
    const user = await queryOne('SELECT id, name, role FROM users WHERE telegram_chat_id = $1 AND is_active = 1', [chatId]);
    return user;
  }

  // ---- Get or create conversation ----
  async function getOrCreateConversation(ctx) {
    const chatId = ctx.chat.id;
    let conv = await queryOne('SELECT * FROM telegram_conversations WHERE chat_id = $1', [chatId]);
    if (!conv) {
      const result = await query(`
        INSERT INTO telegram_conversations (chat_id, username, first_name, last_name, last_message_at)
        VALUES ($1, $2, $3, $4, NOW()) RETURNING *
      `, [chatId, ctx.from.username || null, ctx.from.first_name || null, ctx.from.last_name || null]);
      conv = result.rows[0];
    }
    return conv;
  }

  // ---- Update FSM state ----
  async function setState(chatId, state, data = {}) {
    await query(`
      UPDATE telegram_conversations
      SET conversation_state = $1, state_data = $2, updated_at = NOW()
      WHERE chat_id = $3
    `, [state, JSON.stringify(data), chatId]);
  }

  // ---- Save message ----
  async function saveMessage(conversationId, direction, text) {
    await query(`
      INSERT INTO telegram_messages (conversation_id, direction, message_text)
      VALUES ($1, $2, $3)
    `, [conversationId, direction, text || '']);
  }

  // ---- Client main menu ----
  function clientMenu(welcomeMsg) {
    const text = welcomeMsg || 'Добро пожаловать в Эйфория Room! \u{1F389}\n\nМы — уютное пространство для ваших мероприятий в Минске.\n\nВыберите, что вас интересует:';
    return {
      text,
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Свободные даты', 'check_availability')],
        [Markup.button.callback('💰 Цены и тарифы', 'pricing_info')],
        [Markup.button.callback('📝 Оставить заявку', 'submit_request')],
        [Markup.button.callback('📞 Связаться с менеджером', 'contact_manager')],
      ]),
    };
  }

  // ==========================================
  // COMMAND: /start
  // ==========================================
  bot.start(async (ctx) => {
    try {
      const conv = await getOrCreateConversation(ctx);
      const staff = await isStaff(ctx.chat.id);

      if (staff) {
        await ctx.reply(
          `Привет, ${staff.name}! 👋\n\n` +
          `Ты подключён как ${staff.role === 'owner' ? 'владелец' : staff.role === 'admin' ? 'администратор' : 'менеджер'}.\n\n` +
          `📋 Команды:\n` +
          `/today — Брони на сегодня\n` +
          `/tomorrow — Брони на завтра\n` +
          `/week — Расписание на неделю\n` +
          `/stats — Мини-дашборд\n` +
          `/search <запрос> — Поиск клиента\n` +
          `/menu — Клиентское меню`
        );
      } else {
        const config = await getConfig();
        const menu = clientMenu(config?.welcome_message);
        await ctx.reply(menu.text, menu.reply_markup ? { reply_markup: menu.reply_markup.reply_markup } : {});
      }

      await saveMessage(conv.id, 'incoming', '/start');
      await setState(ctx.chat.id, 'idle');
    } catch (err) {
      console.error('[TG Bot] /start error:', err.message);
    }
  });

  // ==========================================
  // COMMAND: /link email password — привязка CRM аккаунта
  // ==========================================
  bot.command('link', async (ctx) => {
    try {
      const parts = ctx.message.text.split(' ');
      if (parts.length < 3) {
        return ctx.reply('Использование: /link email пароль\n\nПример: /link anna@euphoria.by admin123');
      }

      const email = parts[1];
      const password = parts.slice(2).join(' ');

      // Try to delete the message with password
      try { await ctx.deleteMessage(); } catch (e) { /* might not have permissions */ }

      const user = await queryOne('SELECT * FROM users WHERE email = $1 AND is_active = 1', [email]);
      if (!user) {
        return ctx.reply('❌ Пользователь не найден. Проверьте email.');
      }

      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        return ctx.reply('❌ Неверный пароль.');
      }

      // Check if already linked to another account
      const existingLink = await queryOne('SELECT id, name FROM users WHERE telegram_chat_id = $1 AND id != $2', [ctx.chat.id, user.id]);
      if (existingLink) {
        await query('UPDATE users SET telegram_chat_id = NULL WHERE id = $1', [existingLink.id]);
      }

      await query('UPDATE users SET telegram_chat_id = $1 WHERE id = $2', [ctx.chat.id, user.id]);

      await ctx.reply(
        `✅ Аккаунт привязан!\n\n` +
        `Имя: ${user.name}\n` +
        `Роль: ${user.role}\n\n` +
        `Теперь вы будете получать уведомления и можете использовать команды:\n` +
        `/today /tomorrow /week /stats /search`
      );
    } catch (err) {
      console.error('[TG Bot] /link error:', err.message);
      ctx.reply('❌ Ошибка привязки. Попробуйте позже.');
    }
  });

  // ==========================================
  // STAFF COMMANDS
  // ==========================================

  // /today — брони на сегодня
  bot.command('today', async (ctx) => {
    try {
      const staff = await isStaff(ctx.chat.id);
      if (!staff) return ctx.reply('⛔ Эта команда доступна только сотрудникам. Используйте /link для привязки.');

      const today = todayMinsk();
      const bookings = await queryAll(`
        SELECT b.*, c.name as client_name, c.phone as client_phone
        FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
        WHERE b.booking_date = $1 AND b.is_archived = 0 AND b.status != 'cancelled'
        ORDER BY b.start_time
      `, [today]);

      if (bookings.length === 0) {
        return ctx.reply(`📅 Сегодня (${formatDateFullTg(today)}) нет бронирований.`);
      }

      let text = `📅 <b>Сегодня, ${formatDateFullTg(today)}</b>\n\n`;
      for (const b of bookings) {
        const emoji = BOOKING_STATUS_EMOJI[b.status] || '📋';
        text += `${emoji} <b>${b.start_time}–${b.end_time}</b>\n`;
        text += `   ${escapeHtml(b.client_name)}`;
        if (b.client_phone) text += ` • ${escapeHtml(b.client_phone)}`;
        text += `\n   ${escapeHtml(b.event_type || 'Мероприятие')} • ${b.guest_count || '?'} чел.\n`;
        text += `   ${BOOKING_STATUS_LABELS[b.status] || b.status}\n\n`;
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[TG Bot] /today error:', err.message);
      ctx.reply('❌ Ошибка загрузки данных.');
    }
  });

  // /tomorrow — брони на завтра
  bot.command('tomorrow', async (ctx) => {
    try {
      const staff = await isStaff(ctx.chat.id);
      if (!staff) return ctx.reply('⛔ Эта команда доступна только сотрудникам.');

      const tmrw = daysFromNow(1);
      const bookings = await queryAll(`
        SELECT b.*, c.name as client_name, c.phone as client_phone
        FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
        WHERE b.booking_date = $1 AND b.is_archived = 0 AND b.status != 'cancelled'
        ORDER BY b.start_time
      `, [tmrw]);

      if (bookings.length === 0) {
        return ctx.reply(`📅 Завтра (${formatDateFullTg(tmrw)}) нет бронирований.`);
      }

      let text = `📅 <b>Завтра, ${formatDateFullTg(tmrw)}</b>\n\n`;
      for (const b of bookings) {
        const emoji = BOOKING_STATUS_EMOJI[b.status] || '📋';
        text += `${emoji} <b>${b.start_time}–${b.end_time}</b>\n`;
        text += `   ${escapeHtml(b.client_name)}`;
        if (b.client_phone) text += ` • ${escapeHtml(b.client_phone)}`;
        text += `\n   ${escapeHtml(b.event_type || 'Мероприятие')} • ${b.guest_count || '?'} чел.\n`;
        text += `   ${BOOKING_STATUS_LABELS[b.status] || b.status}\n\n`;
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[TG Bot] /tomorrow error:', err.message);
      ctx.reply('❌ Ошибка загрузки данных.');
    }
  });

  // /week — расписание на неделю
  bot.command('week', async (ctx) => {
    try {
      const staff = await isStaff(ctx.chat.id);
      if (!staff) return ctx.reply('⛔ Эта команда доступна только сотрудникам.');

      const from = todayMinsk();
      const to = daysFromNow(7);
      const bookings = await queryAll(`
        SELECT b.*, c.name as client_name
        FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
        WHERE b.booking_date >= $1 AND b.booking_date <= $2 AND b.is_archived = 0 AND b.status != 'cancelled'
        ORDER BY b.booking_date, b.start_time
      `, [from, to]);

      if (bookings.length === 0) {
        return ctx.reply(`📅 На ближайшие 7 дней нет бронирований.`);
      }

      // Group by date
      const byDate = {};
      for (const b of bookings) {
        const dateStr = typeof b.booking_date === 'string' ? b.booking_date.split('T')[0] : b.booking_date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Minsk' });
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(b);
      }

      let text = `📅 <b>Расписание на неделю</b>\n\n`;
      for (const [date, items] of Object.entries(byDate)) {
        text += `<b>${formatDateFullTg(date)}</b> (${items.length} бр.)\n`;
        for (const b of items) {
          text += `  ${BOOKING_STATUS_EMOJI[b.status] || '📋'} ${b.start_time}–${b.end_time} ${escapeHtml(b.client_name)}\n`;
        }
        text += '\n';
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[TG Bot] /week error:', err.message);
      ctx.reply('❌ Ошибка загрузки данных.');
    }
  });

  // /stats — мини-дашборд
  bot.command('stats', async (ctx) => {
    try {
      const staff = await isStaff(ctx.chat.id);
      if (!staff) return ctx.reply('⛔ Эта команда доступна только сотрудникам.');

      const today = todayMinsk();
      const weekEnd = daysFromNow(7);
      const monthStart = today.substring(0, 8) + '01';

      // Bookings this week
      const weekRow = await queryOne(`
        SELECT COUNT(*) as cnt FROM bookings
        WHERE booking_date >= $1 AND booking_date <= $2 AND is_archived = 0 AND status != 'cancelled'
      `, [today, weekEnd]);

      // Revenue this month
      const revenueRow = await queryOne(`
        SELECT COALESCE(SUM(p.amount), 0) as total
        FROM payments p JOIN bookings b ON p.booking_id = b.id
        WHERE p.payment_date >= $1 AND b.is_archived = 0
      `, [monthStart]);

      // Pending deposits
      const depositsRow = await queryOne(`
        SELECT COUNT(*) as cnt, COALESCE(SUM(b.deposit_amount), 0) as total
        FROM bookings b
        WHERE b.status IN ('preliminary', 'no_deposit') AND b.is_archived = 0
          AND b.booking_date >= $1
      `, [today]);

      // Active tasks
      const tasksRow = await queryOne(`
        SELECT COUNT(*) as cnt FROM tasks WHERE is_completed = 0
      `);

      // Today bookings count
      const todayRow = await queryOne(`
        SELECT COUNT(*) as cnt FROM bookings
        WHERE booking_date = $1 AND is_archived = 0 AND status != 'cancelled'
      `, [today]);

      const text =
        `📊 <b>Мини-дашборд</b>\n\n` +
        `📅 Сегодня: <b>${todayRow.cnt}</b> бронирований\n` +
        `📅 На неделю: <b>${weekRow.cnt}</b> бронирований\n` +
        `💰 Выручка за месяц: <b>${formatMoney(revenueRow.total)} BYN</b>\n` +
        `⚠️ Предоплаты к получению: <b>${depositsRow.cnt} шт.</b> (${formatMoney(depositsRow.total)} BYN)\n` +
        `📝 Активных задач: <b>${tasksRow.cnt}</b>`;

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[TG Bot] /stats error:', err.message);
      ctx.reply('❌ Ошибка загрузки данных.');
    }
  });

  // /search <query> — поиск клиента
  bot.command('search', async (ctx) => {
    try {
      const staff = await isStaff(ctx.chat.id);
      if (!staff) return ctx.reply('⛔ Эта команда доступна только сотрудникам.');

      const searchQuery = ctx.message.text.replace(/^\/search\s*/i, '').trim();
      if (!searchQuery) {
        return ctx.reply('Использование: /search имя или телефон\n\nПример: /search Иван');
      }

      const clients = await queryAll(`
        SELECT c.*,
          (SELECT COUNT(*) FROM bookings WHERE client_id = c.id AND is_archived = 0) as bookings_count,
          (SELECT MAX(booking_date) FROM bookings WHERE client_id = c.id AND is_archived = 0) as last_booking
        FROM clients c
        WHERE c.is_archived = 0 AND (
          c.name ILIKE $1 OR c.phone ILIKE $1 OR c.telegram ILIKE $1 OR c.instagram ILIKE $1
        )
        ORDER BY c.name LIMIT 10
      `, [`%${searchQuery}%`]);

      if (clients.length === 0) {
        return ctx.reply(`🔍 По запросу «${escapeHtml(searchQuery)}» ничего не найдено.`, { parse_mode: 'HTML' });
      }

      let text = `🔍 <b>Результаты поиска: «${escapeHtml(searchQuery)}»</b>\n\n`;
      for (const c of clients) {
        text += `👤 <b>${escapeHtml(c.name)}</b>\n`;
        if (c.phone) text += `   📱 ${escapeHtml(c.phone)}\n`;
        if (c.telegram) text += `   💬 ${escapeHtml(c.telegram)}\n`;
        if (c.instagram) text += `   📷 ${escapeHtml(c.instagram)}\n`;
        text += `   Броней: ${c.bookings_count}`;
        if (c.last_booking) {
          const lastDate = typeof c.last_booking === 'string' ? c.last_booking.split('T')[0] : c.last_booking.toLocaleDateString('sv-SE');
          text += ` • Последняя: ${formatDateTg(lastDate)}`;
        }
        text += '\n\n';
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[TG Bot] /search error:', err.message);
      ctx.reply('❌ Ошибка поиска.');
    }
  });

  // /menu — показать клиентское меню (для сотрудников тоже)
  bot.command('menu', async (ctx) => {
    try {
      const config = await getConfig();
      const menu = clientMenu(config?.welcome_message);
      await ctx.reply(menu.text, menu.reply_markup ? { reply_markup: menu.reply_markup.reply_markup } : {});
    } catch (err) {
      console.error('[TG Bot] /menu error:', err.message);
    }
  });

  // ==========================================
  // CLIENT INLINE BUTTONS
  // ==========================================

  // Свободные даты — показать 14 дней
  bot.action('check_availability', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const buttons = [];
      for (let i = 0; i < 14; i++) {
        const dateStr = daysFromNow(i);
        const label = i === 0 ? `Сегодня (${formatDateTg(dateStr)})`
                    : i === 1 ? `Завтра (${formatDateTg(dateStr)})`
                    : formatDateFullTg(dateStr);
        buttons.push([Markup.button.callback(label, `avail_${dateStr}`)]);
      }
      buttons.push([Markup.button.callback('⬅️ Назад в меню', 'back_to_menu')]);
      await ctx.editMessageText('📅 Выберите дату, чтобы узнать свободное время:', Markup.inlineKeyboard(buttons));
    } catch (err) {
      console.error('[TG Bot] check_availability error:', err.message);
    }
  });

  // Показать расписание на конкретную дату
  bot.action(/^avail_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const dateStr = ctx.match[1];
      const dayType = getDayType(dateStr);
      const dayLabel = getDayTypeLabel(dayType);

      const bookings = await queryAll(`
        SELECT start_time, end_time FROM bookings
        WHERE booking_date = $1 AND is_archived = 0 AND status != 'cancelled'
        ORDER BY start_time
      `, [dateStr]);

      let text = `📅 <b>${formatDateFullTg(dateStr)}</b> (${dayLabel})\n\n`;

      if (bookings.length === 0) {
        text += `✅ Весь день свободен!\n\n`;
      } else {
        text += `⏰ Занятые слоты:\n`;
        for (const b of bookings) {
          text += `  🔴 ${b.start_time} – ${b.end_time}\n`;
        }
        text += `\nОстальное время свободно.\n\n`;
      }

      // Pricing info
      if (dayType === 'weekday') {
        text += `💰 Тарифы (будний день):\n`;
        text += `  09:00–16:00 — 35 руб/час\n`;
        text += `  16:00–23:00 — 45 руб/час\n`;
        text += `  23:00–09:00 — 60 руб/час\n`;
      } else {
        text += `💰 Тарифы (выходной):\n`;
        text += `  09:00–23:00 — 60 руб/час\n`;
        text += `  23:00–09:00 — 75 руб/час\n`;
      }
      text += `\nМинимум бронирования: 3 часа`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📝 Оставить заявку на эту дату', `request_date_${dateStr}`)],
          [Markup.button.callback('⬅️ К датам', 'check_availability')],
          [Markup.button.callback('🏠 В меню', 'back_to_menu')],
        ]),
      });
    } catch (err) {
      console.error('[TG Bot] avail_ error:', err.message);
    }
  });

  // Цены и тарифы
  bot.action('pricing_info', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const text =
        `💰 <b>Тарифы Эйфория Room</b>\n\n` +
        `<b>Будние дни (Пн–Чт):</b>\n` +
        `  🌤 09:00–16:00 — <b>35 руб/час</b>\n` +
        `  🌆 16:00–23:00 — <b>45 руб/час</b>\n` +
        `  🌙 23:00–09:00 — <b>60 руб/час</b>\n\n` +
        `<b>Выходные (Пт–Вс):</b>\n` +
        `  🌤 09:00–23:00 — <b>60 руб/час</b>\n` +
        `  🌙 23:00–09:00 — <b>75 руб/час</b>\n\n` +
        `⏰ Минимум бронирования: <b>3 часа</b>\n` +
        `🎁 30 минут до и после мероприятия в подарок\n\n` +
        `Допуслуги: декор, кейтеринг, техника, ведущий, фотограф и др.`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📅 Свободные даты', 'check_availability')],
          [Markup.button.callback('📝 Оставить заявку', 'submit_request')],
          [Markup.button.callback('🏠 В меню', 'back_to_menu')],
        ]),
      });
    } catch (err) {
      console.error('[TG Bot] pricing_info error:', err.message);
    }
  });

  // Связаться с менеджером
  bot.action('contact_manager', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const text =
        `📞 <b>Свяжитесь с нами</b>\n\n` +
        `Вы можете написать прямо сюда — менеджер ответит в ближайшее время.\n\n` +
        `Или позвоните:\n📱 +375 (XX) XXX-XX-XX\n\n` +
        `📍 Минск, ул. [адрес]`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 В меню', 'back_to_menu')],
        ]),
      });
    } catch (err) {
      console.error('[TG Bot] contact_manager error:', err.message);
    }
  });

  // Назад в меню
  bot.action('back_to_menu', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const config = await getConfig();
      const menu = clientMenu(config?.welcome_message);
      await ctx.editMessageText(menu.text, menu.reply_markup ? { reply_markup: menu.reply_markup.reply_markup } : {});
    } catch (err) {
      console.error('[TG Bot] back_to_menu error:', err.message);
    }
  });

  // ==========================================
  // FSM: Заявка (submit_request)
  // ==========================================

  // Start request flow
  bot.action('submit_request', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await startRequestFlow(ctx, null);
    } catch (err) {
      console.error('[TG Bot] submit_request error:', err.message);
    }
  });

  // Start request with pre-selected date
  bot.action(/^request_date_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await startRequestFlow(ctx, ctx.match[1]);
    } catch (err) {
      console.error('[TG Bot] request_date error:', err.message);
    }
  });

  async function startRequestFlow(ctx, preselectedDate) {
    const conv = await getOrCreateConversation(ctx);
    if (preselectedDate) {
      // Skip date step
      await setState(ctx.chat.id, 'awaiting_time', { date: preselectedDate });
      const dayType = getDayType(preselectedDate);
      const dayLabel = getDayTypeLabel(dayType);
      await ctx.editMessageText(
        `📝 <b>Заявка на ${formatDateFullTg(preselectedDate)}</b> (${dayLabel})\n\n` +
        `⏰ Напишите желаемое время начала (например: <b>18:00</b>):`,
        { parse_mode: 'HTML' }
      );
    } else {
      // Ask for date
      const buttons = [];
      for (let i = 0; i < 14; i++) {
        const dateStr = daysFromNow(i);
        const label = i === 0 ? `Сегодня` : i === 1 ? `Завтра` : formatDateTg(dateStr);
        buttons.push(Markup.button.callback(label, `req_pick_date_${dateStr}`));
      }
      // 2 buttons per row
      const rows = [];
      for (let i = 0; i < buttons.length; i += 3) {
        rows.push(buttons.slice(i, i + 3));
      }
      rows.push([Markup.button.callback('🏠 В меню', 'back_to_menu')]);
      await ctx.editMessageText('📝 <b>Новая заявка</b>\n\n📅 Выберите дату:', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(rows),
      });
      await setState(ctx.chat.id, 'awaiting_date', {});
    }
  }

  // Pick date from request flow
  bot.action(/^req_pick_date_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const dateStr = ctx.match[1];
      const dayType = getDayType(dateStr);
      const dayLabel = getDayTypeLabel(dayType);
      await setState(ctx.chat.id, 'awaiting_time', { date: dateStr });
      await ctx.editMessageText(
        `📝 <b>Заявка на ${formatDateFullTg(dateStr)}</b> (${dayLabel})\n\n` +
        `⏰ Напишите желаемое время начала (например: <b>18:00</b>):`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[TG Bot] req_pick_date error:', err.message);
    }
  });

  // Confirm request
  bot.action('confirm_request', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const conv = await getOrCreateConversation(ctx);
      const data = conv.state_data || {};

      // Create client + lead in DB
      const client = await pool.connect();
      let clientId, leadId;
      try {
        await client.query('BEGIN');

        // Check if client exists by phone
        let existingClient = null;
        if (data.phone) {
          const { rows } = await client.query('SELECT id FROM clients WHERE phone = $1', [data.phone]);
          if (rows.length > 0) existingClient = rows[0];
        }

        if (existingClient) {
          clientId = existingClient.id;
        } else {
          const { rows } = await client.query(`
            INSERT INTO clients (name, phone, telegram, source, comment)
            VALUES ($1, $2, $3, 'telegram', 'Заявка через Telegram бот')
            RETURNING id
          `, [data.name, data.phone || null, ctx.from.username ? `@${ctx.from.username}` : null]);
          clientId = rows[0].id;
        }

        // Create lead
        const { rows: leadRows } = await client.query(`
          INSERT INTO leads (client_id, desired_date, guest_count, event_type, source, status, comment)
          VALUES ($1, $2, $3, $4, 'telegram', 'new', $5)
          RETURNING id
        `, [
          clientId,
          data.date || null,
          data.guests ? Number(data.guests) : null,
          'Мероприятие',
          `Telegram заявка: ${data.date || '?'} в ${data.time || '?'}, ${data.guests || '?'} чел.`,
        ]);
        leadId = leadRows[0].id;

        // Update conversation
        await client.query(`
          UPDATE telegram_conversations SET client_id = $1, lead_id = $2, updated_at = NOW()
          WHERE chat_id = $3
        `, [clientId, leadId, ctx.chat.id]);

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      await setState(ctx.chat.id, 'idle', {});

      await ctx.editMessageText(
        `✅ <b>Заявка отправлена!</b>\n\n` +
        `📅 Дата: ${formatDateFullTg(data.date)}\n` +
        `⏰ Время: ${data.time || '—'}\n` +
        `👥 Гостей: ${data.guests || '—'}\n` +
        `👤 Имя: ${escapeHtml(data.name)}\n` +
        `📱 Телефон: ${escapeHtml(data.phone || '—')}\n\n` +
        `Менеджер свяжется с вами в ближайшее время! 🙏`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏠 В меню', 'back_to_menu')]]),
        }
      );

      // Notify staff
      try {
        const { notifyNewTelegramLead } = require('./notifications');
        await notifyNewTelegramLead({ id: leadId, clientName: data.name, phone: data.phone, date: data.date, time: data.time, guests: data.guests });
      } catch (e) {
        console.error('[TG Bot] Notify error:', e.message);
      }
    } catch (err) {
      console.error('[TG Bot] confirm_request error:', err.message);
      try { await ctx.reply('❌ Произошла ошибка. Попробуйте /start'); } catch (e) {}
    }
  });

  // Cancel request
  bot.action('cancel_request', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await setState(ctx.chat.id, 'idle', {});
      const config = await getConfig();
      const menu = clientMenu(config?.welcome_message);
      await ctx.editMessageText(menu.text, menu.reply_markup ? { reply_markup: menu.reply_markup.reply_markup } : {});
    } catch (err) {
      console.error('[TG Bot] cancel_request error:', err.message);
    }
  });

  // ==========================================
  // TEXT MESSAGE HANDLER (FSM states)
  // ==========================================
  bot.on('text', async (ctx) => {
    try {
      const conv = await getOrCreateConversation(ctx);
      const text = ctx.message.text.trim();

      // Save incoming message
      await saveMessage(conv.id, 'incoming', text);
      await query('UPDATE telegram_conversations SET last_message_at = NOW() WHERE id = $1', [conv.id]);

      const state = conv.conversation_state || 'idle';
      const data = conv.state_data || {};

      switch (state) {
        case 'awaiting_time': {
          // Validate time format
          const timeMatch = text.match(/^(\d{1,2})[:\.](\d{2})$/);
          if (!timeMatch) {
            return ctx.reply('⏰ Укажите время в формате ЧЧ:ММ (например: 18:00)');
          }
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return ctx.reply('⏰ Некорректное время. Укажите от 00:00 до 23:59');
          }
          const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          await setState(ctx.chat.id, 'awaiting_guests', { ...data, time });
          await ctx.reply('👥 Сколько гостей планируется? (примерное количество)');
          break;
        }

        case 'awaiting_guests': {
          const guests = text.replace(/[^\d]/g, '');
          if (!guests || Number(guests) <= 0) {
            return ctx.reply('👥 Укажите примерное количество гостей (число)');
          }
          await setState(ctx.chat.id, 'awaiting_name', { ...data, guests });
          await ctx.reply('👤 Как вас зовут?');
          break;
        }

        case 'awaiting_name': {
          if (text.length < 2) {
            return ctx.reply('👤 Пожалуйста, укажите ваше имя (минимум 2 символа)');
          }
          await setState(ctx.chat.id, 'awaiting_phone', { ...data, name: text });
          await ctx.reply('📱 Ваш номер телефона для связи:\n(или напишите «пропустить»)');
          break;
        }

        case 'awaiting_phone': {
          const phone = text.toLowerCase() === 'пропустить' ? null : text;
          const finalData = { ...data, phone };
          await setState(ctx.chat.id, 'confirming', finalData);

          const confirmText =
            `📝 <b>Проверьте вашу заявку:</b>\n\n` +
            `📅 Дата: ${formatDateFullTg(finalData.date)}\n` +
            `⏰ Время: ${finalData.time}\n` +
            `👥 Гостей: ${finalData.guests}\n` +
            `👤 Имя: ${escapeHtml(finalData.name)}\n` +
            `📱 Телефон: ${escapeHtml(phone || 'не указан')}\n\n` +
            `Всё верно?`;

          await ctx.reply(confirmText, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Отправить заявку', 'confirm_request')],
              [Markup.button.callback('❌ Отменить', 'cancel_request')],
            ]),
          });
          break;
        }

        default: {
          // idle state — if not a command, show menu
          const staff = await isStaff(ctx.chat.id);
          if (!staff) {
            // Save as a message to manager
            const config = await getConfig();
            const menu = clientMenu(config?.welcome_message);
            await ctx.reply(
              '💬 Ваше сообщение получено! Менеджер свяжется с вами.\n\n' +
              'А пока выберите, что вас интересует:',
              menu.reply_markup ? { reply_markup: menu.reply_markup.reply_markup } : {}
            );
          }
          break;
        }
      }
    } catch (err) {
      console.error('[TG Bot] text handler error:', err.message);
    }
  });

  return bot;
}

function getBot() {
  return bot;
}

module.exports = { createBot, getBot, getConfig };

/**
 * Telegram notifications for Эйфория CRM
 *
 * Fire-and-forget: никогда не ломают основную операцию
 */
const { queryAll, queryOne, query } = require('../db/database');
const { getBot, getConfig } = require('./bot');
const {
  BOOKING_STATUS_LABELS, BOOKING_STATUS_EMOJI,
  formatDateFullTg, formatMoney, escapeHtml,
  todayMinsk, daysFromNow,
} = require('./utils');

// ==========================================
// Safe send — handles blocked bots, errors
// ==========================================
async function safeSend(chatId, text, options = {}) {
  try {
    const bot = getBot();
    if (!bot) return false;
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
    return true;
  } catch (err) {
    // If bot is blocked by user, clean up the chat_id
    if (err.code === 403 || err.description?.includes('blocked')) {
      console.warn(`[TG Notify] Bot blocked by user ${chatId}, clearing link`);
      await query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1', [chatId]).catch(() => {});
    } else {
      console.error(`[TG Notify] Send error to ${chatId}:`, err.message);
    }
    return false;
  }
}

// ==========================================
// Broadcast to all linked staff
// ==========================================
async function broadcastToStaff(text, options = {}) {
  try {
    const config = await getConfig();
    if (!config) return;

    const staffUsers = await queryAll('SELECT telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL AND is_active = 1');
    for (const user of staffUsers) {
      await safeSend(user.telegram_chat_id, text, options);
    }
  } catch (err) {
    console.error('[TG Notify] Broadcast error:', err.message);
  }
}

// ==========================================
// Notification: New Booking
// ==========================================
async function notifyNewBooking(booking) {
  try {
    const client = await queryOne('SELECT name, phone FROM clients WHERE id = $1', [booking.client_id]);
    const dateStr = typeof booking.booking_date === 'string' ? booking.booking_date.split('T')[0] : booking.booking_date?.toLocaleDateString('sv-SE');

    const text =
      `🆕 <b>Новая бронь #${booking.id}</b>\n\n` +
      `📅 ${formatDateFullTg(dateStr)}\n` +
      `⏰ ${booking.start_time} – ${booking.end_time}\n` +
      `👤 ${escapeHtml(client?.name || '—')}` +
      (client?.phone ? ` • ${escapeHtml(client.phone)}` : '') + '\n' +
      `💰 ${formatMoney(booking.rental_cost)} BYN`;

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] notifyNewBooking error:', err.message);
  }
}

// ==========================================
// Notification: New Lead
// ==========================================
async function notifyNewLead(lead) {
  try {
    const client = await queryOne('SELECT name, phone FROM clients WHERE id = $1', [lead.client_id]);

    const text =
      `📥 <b>Новая заявка #${lead.id}</b>\n\n` +
      `👤 ${escapeHtml(client?.name || '—')}` +
      (client?.phone ? ` • ${escapeHtml(client.phone)}` : '') + '\n' +
      (lead.desired_date ? `📅 Желаемая дата: ${formatDateFullTg(lead.desired_date)}\n` : '') +
      (lead.guest_count ? `👥 Гостей: ${lead.guest_count}\n` : '') +
      (lead.source ? `📱 Источник: ${lead.source}` : '');

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] notifyNewLead error:', err.message);
  }
}

// ==========================================
// Notification: New Telegram Lead (from bot FSM)
// ==========================================
async function notifyNewTelegramLead(data) {
  try {
    const text =
      `📥 <b>Заявка из Telegram #${data.id}</b>\n\n` +
      `👤 ${escapeHtml(data.clientName || '—')}` +
      (data.phone ? ` • ${escapeHtml(data.phone)}` : '') + '\n' +
      (data.date ? `📅 ${formatDateFullTg(data.date)}` : '') +
      (data.time ? ` в ${data.time}` : '') + '\n' +
      (data.guests ? `👥 Гостей: ${data.guests}` : '');

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] notifyNewTelegramLead error:', err.message);
  }
}

// ==========================================
// Notification: Payment Received
// ==========================================
async function notifyPaymentReceived(payment, booking) {
  try {
    const client = await queryOne('SELECT name FROM clients WHERE id = $1', [booking.client_id]);
    const dateStr = typeof booking.booking_date === 'string' ? booking.booking_date.split('T')[0] : booking.booking_date?.toLocaleDateString('sv-SE');

    const text =
      `💳 <b>Получена оплата</b>\n\n` +
      `Бронь #${booking.id} • ${escapeHtml(client?.name || '—')}\n` +
      `📅 ${formatDateFullTg(dateStr)}\n` +
      `💰 +${formatMoney(payment.amount)} BYN (${payment.payment_type === 'deposit' ? 'предоплата' : 'оплата'})`;

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] notifyPaymentReceived error:', err.message);
  }
}

// ==========================================
// Morning Briefing (cron: 09:00 Minsk)
// ==========================================
async function notifyMorningBriefing() {
  try {
    const config = await getConfig();
    if (!config) return;

    const today = todayMinsk();

    // Today's bookings
    const bookings = await queryAll(`
      SELECT b.*, c.name as client_name, c.phone as client_phone
      FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
      WHERE b.booking_date = $1 AND b.is_archived = 0 AND b.status != 'cancelled'
      ORDER BY b.start_time
    `, [today]);

    // Deposits to collect
    const deposits = await queryAll(`
      SELECT b.id, b.deposit_amount, b.booking_date, c.name as client_name
      FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
      WHERE b.status IN ('preliminary', 'no_deposit') AND b.is_archived = 0
        AND b.booking_date >= $1
      ORDER BY b.booking_date LIMIT 5
    `, [today]);

    // Active tasks due today
    const tasks = await queryAll(`
      SELECT t.*, c.name as client_name
      FROM tasks t LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.is_completed = 0 AND t.due_date <= $1
      ORDER BY t.due_date LIMIT 5
    `, [today]);

    let text = `☀️ <b>Доброе утро! ${formatDateFullTg(today)}</b>\n\n`;

    // Today bookings
    if (bookings.length > 0) {
      text += `📅 <b>Мероприятия сегодня (${bookings.length}):</b>\n`;
      for (const b of bookings) {
        text += `  ${BOOKING_STATUS_EMOJI[b.status] || '📋'} ${b.start_time}–${b.end_time} ${escapeHtml(b.client_name)}`;
        if (b.client_phone) text += ` (${escapeHtml(b.client_phone)})`;
        text += '\n';
      }
      text += '\n';
    } else {
      text += `📅 Сегодня мероприятий нет.\n\n`;
    }

    // Deposits
    if (deposits.length > 0) {
      text += `⚠️ <b>Предоплаты к получению:</b>\n`;
      for (const d of deposits) {
        const dDate = typeof d.booking_date === 'string' ? d.booking_date.split('T')[0] : d.booking_date?.toLocaleDateString('sv-SE');
        text += `  💰 #${d.id} ${escapeHtml(d.client_name)} — ${formatMoney(d.deposit_amount)} BYN (${formatDateFullTg(dDate)})\n`;
      }
      text += '\n';
    }

    // Tasks
    if (tasks.length > 0) {
      text += `📝 <b>Задачи на сегодня:</b>\n`;
      for (const t of tasks) {
        text += `  • ${escapeHtml(t.title)}`;
        if (t.client_name) text += ` (${escapeHtml(t.client_name)})`;
        text += '\n';
      }
    }

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] Morning briefing error:', err.message);
  }
}

// ==========================================
// Upcoming Events (cron: 20:00 Minsk)
// ==========================================
async function notifyUpcomingEvents() {
  try {
    const config = await getConfig();
    if (!config) return;

    const tomorrow = daysFromNow(1);

    const bookings = await queryAll(`
      SELECT b.*, c.name as client_name, c.phone as client_phone
      FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
      WHERE b.booking_date = $1 AND b.is_archived = 0 AND b.status != 'cancelled'
      ORDER BY b.start_time
    `, [tomorrow]);

    if (bookings.length === 0) return; // No notification if nothing tomorrow

    let text = `⏰ <b>Завтра, ${formatDateFullTg(tomorrow)}</b>\n\n`;
    text += `Запланировано мероприятий: <b>${bookings.length}</b>\n\n`;

    for (const b of bookings) {
      text += `${BOOKING_STATUS_EMOJI[b.status] || '📋'} <b>${b.start_time}–${b.end_time}</b>\n`;
      text += `   ${escapeHtml(b.client_name)}`;
      if (b.client_phone) text += ` • ${escapeHtml(b.client_phone)}`;
      text += `\n   ${BOOKING_STATUS_LABELS[b.status] || b.status}\n\n`;
    }

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] Upcoming events error:', err.message);
  }
}

// ==========================================
// Notification: New Tilda Lead (from website)
// ==========================================
async function notifyNewTildaLead(data) {
  try {
    const text =
      `🌐 <b>Заявка с сайта #${data.id}</b>\n\n` +
      `👤 ${escapeHtml(data.clientName || '—')}` +
      (data.phone ? ` • ${escapeHtml(data.phone)}` : '') + '\n' +
      (data.email ? `📧 ${escapeHtml(data.email)}\n` : '') +
      (data.formName ? `📋 Форма: ${escapeHtml(data.formName)}\n` : '') +
      (data.comment ? `💬 ${escapeHtml(data.comment.substring(0, 200))}\n` : '') +
      `📱 Источник: Tilda (сайт)`;

    await broadcastToStaff(text);
  } catch (err) {
    console.error('[TG Notify] notifyNewTildaLead error:', err.message);
  }
}

module.exports = {
  safeSend,
  broadcastToStaff,
  notifyNewBooking,
  notifyNewLead,
  notifyNewTelegramLead,
  notifyNewTildaLead,
  notifyPaymentReceived,
  notifyMorningBriefing,
  notifyUpcomingEvents,
};

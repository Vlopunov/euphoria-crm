const express = require('express');
const { queryOne, queryAll } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);
    const monthStart = today.slice(0, 7) + '-01';
    const monthEnd = getMonthEnd(today);
    const tomorrow = addDays(today, 1);

    // Брони на эту неделю
    const weekBookingsRow = await queryOne(`
      SELECT COUNT(*) as count FROM bookings
      WHERE booking_date BETWEEN $1 AND $2 AND is_archived = 0 AND status != 'cancelled'
    `, [weekStart, weekEnd]);
    const weekBookings = weekBookingsRow.count;

    // Выручка за месяц (факт — из платежей по завершённым бронам)
    const monthRevenueRow = await queryOne(`
      SELECT COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.payment_date BETWEEN $1 AND $2 AND b.is_archived = 0
    `, [monthStart, monthEnd]);
    const monthRevenue = monthRevenueRow.total;

    // Ожидаемая выручка (по подтвержденным бронями на будущее)
    const expectedRevenueRow = await queryOne(`
      SELECT COALESCE(SUM(b.rental_cost), 0) as total
      FROM bookings b
      WHERE b.booking_date >= $1 AND b.status IN ('deposit_paid','fully_paid','no_deposit','preliminary') AND b.is_archived = 0
    `, [today]);
    const expectedRevenue = expectedRevenueRow.total;

    // Предоплаты к получению
    const depositsToCollect = await queryOne(`
      SELECT COUNT(*) as count, COALESCE(SUM(b.deposit_amount), 0) as total
      FROM bookings b
      WHERE b.status IN ('preliminary','no_deposit') AND b.booking_date >= $1 AND b.is_archived = 0
    `, [today]);

    // Загрузка по часам (этот месяц) — бронированных часов / доступных часов
    const bookedHoursRow = await queryOne(`
      SELECT COALESCE(SUM(hours), 0) as total FROM bookings
      WHERE booking_date BETWEEN $1 AND $2 AND status != 'cancelled' AND is_archived = 0
    `, [monthStart, monthEnd]);
    const bookedHours = bookedHoursRow.total;
    const daysInMonth = new Date(Number(today.slice(0,4)), Number(today.slice(5,7)), 0).getDate();
    const availableHours = daysInMonth * 16; // 16 рабочих часов в день
    const utilization = availableHours > 0 ? Math.round((bookedHours / availableHours) * 100) : 0;

    // Средний чек
    const avgCheckRow = await queryOne(`
      SELECT COALESCE(AVG(sub.total), 0) as avg_check FROM (
        SELECT b.id, b.rental_cost + COALESCE((SELECT SUM(sale_price * quantity) FROM booking_add_ons WHERE booking_id = b.id), 0) as total
        FROM bookings b
        WHERE b.booking_date BETWEEN $1 AND $2 AND b.status IN ('completed','fully_paid') AND b.is_archived = 0
      ) sub
    `, [monthStart, monthEnd]);
    const avgCheck = avgCheckRow.avg_check;

    // Выручка по источникам
    const revenueBySource = await queryAll(`
      SELECT c.source, COALESCE(SUM(p.amount), 0) as total, COUNT(DISTINCT b.id) as booking_count
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN clients c ON b.client_id = c.id
      WHERE p.payment_date BETWEEN $1 AND $2 AND b.is_archived = 0
      GROUP BY c.source
    `, [monthStart, monthEnd]);

    // Выручка по допам
    const addonRevenueRow = await queryOne(`
      SELECT COALESCE(SUM(ba.sale_price * ba.quantity), 0) as total
      FROM booking_add_ons ba
      JOIN bookings b ON ba.booking_id = b.id
      WHERE b.booking_date BETWEEN $1 AND $2 AND b.is_archived = 0
    `, [monthStart, monthEnd]);
    const addonRevenue = addonRevenueRow.total;

    // Повторные клиенты
    const repeatClientsRow = await queryOne(`
      SELECT COUNT(*) as count FROM (
        SELECT client_id FROM bookings WHERE is_archived = 0 GROUP BY client_id HAVING COUNT(*) > 1
      ) AS sub
    `, []);
    const repeatClients = repeatClientsRow.count;

    // Отмены / переносы за месяц
    const cancellations = await queryOne(`
      SELECT
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'rescheduled' THEN 1 ELSE 0 END) as rescheduled
      FROM bookings
      WHERE booking_date BETWEEN $1 AND $2 AND is_archived = 0
    `, [monthStart, monthEnd]);

    // Ближайшие мероприятия (сегодня + завтра)
    const upcomingEvents = await queryAll(`
      SELECT b.*, c.name as client_name, c.phone as client_phone
      FROM bookings b JOIN clients c ON b.client_id = c.id
      WHERE b.booking_date IN ($1, $2) AND b.is_archived = 0 AND b.status != 'cancelled'
      ORDER BY b.booking_date, b.start_time
    `, [today, tomorrow]);

    // Задачи / напоминания (незавершённые)
    const pendingTasks = await queryAll(`
      SELECT t.*, c.name as client_name, b.booking_date
      FROM tasks t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN bookings b ON t.booking_id = b.id
      WHERE t.is_completed = 0
      ORDER BY t.due_date
      LIMIT 10
    `, []);

    // Заявки по источникам (за месяц)
    const leadsBySource = await queryAll(`
      SELECT source, COUNT(*) as count FROM leads
      WHERE contact_date BETWEEN $1 AND $2 AND is_archived = 0
      GROUP BY source
    `, [monthStart, monthEnd]);

    res.json({
      weekBookings,
      monthRevenue,
      expectedRevenue,
      depositsToCollect: { count: depositsToCollect.count, total: depositsToCollect.total },
      utilization,
      bookedHours,
      avgCheck: Math.round(avgCheck * 100) / 100,
      revenueBySource,
      addonRevenue,
      repeatClients,
      cancellations: { cancelled: cancellations?.cancelled || 0, rescheduled: cancellations?.rescheduled || 0 },
      upcomingEvents,
      pendingTasks,
      leadsBySource,
      monthStart,
      monthEnd,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки дашборда' });
  }
});

// Reports endpoint
router.get('/reports', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const from = date_from || new Date().toISOString().slice(0, 7) + '-01';
    const to = date_to || new Date().toISOString().split('T')[0];

    // Revenue by period (daily)
    const dailyRevenue = await queryAll(`
      SELECT p.payment_date as date, SUM(p.amount) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.payment_date BETWEEN $1 AND $2 AND b.is_archived = 0
      GROUP BY p.payment_date ORDER BY p.payment_date
    `, [from, to]);

    // Revenue from rentals
    const rentalRevenueRow = await queryOne(`
      SELECT COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.payment_date BETWEEN $1 AND $2 AND p.payment_type IN ('deposit','additional') AND b.is_archived = 0
    `, [from, to]);
    const rentalRevenue = rentalRevenueRow.total;

    // Revenue from addons
    const addonsRevenueRow = await queryOne(`
      SELECT COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.payment_date BETWEEN $1 AND $2 AND p.payment_type = 'addons' AND b.is_archived = 0
    `, [from, to]);
    const addonsRevenue = addonsRevenueRow.total;

    // Expenses by category
    const expensesByCategory = await queryAll(`
      SELECT ec.name as category, SUM(e.amount) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.expense_date BETWEEN $1 AND $2 AND e.is_archived = 0
      GROUP BY e.category_id ORDER BY total DESC
    `, [from, to]);

    const totalExpensesRow = await queryOne(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE expense_date BETWEEN $1 AND $2 AND is_archived = 0
    `, [from, to]);
    const totalExpenses = totalExpensesRow.total;

    const totalIncome = rentalRevenue + addonsRevenue;
    const profit = totalIncome - totalExpenses;

    // Sources analytics
    const sourceAnalytics = await queryAll(`
      SELECT c.source,
        COUNT(DISTINCT b.id) as bookings,
        COALESCE(SUM(p.amount), 0) as revenue
      FROM bookings b
      JOIN clients c ON b.client_id = c.id
      LEFT JOIN payments p ON p.booking_id = b.id AND p.payment_date BETWEEN $1 AND $2
      WHERE b.booking_date BETWEEN $3 AND $4 AND b.is_archived = 0
      GROUP BY c.source
    `, [from, to, from, to]);

    res.json({
      dailyRevenue,
      rentalRevenue,
      addonsRevenue,
      totalIncome,
      expensesByCategory,
      totalExpenses,
      profit,
      sourceAnalytics,
      period: { from, to },
    });
  } catch (err) {
    console.error('Reports error:', err.message);
    res.status(500).json({ error: 'Ошибка загрузки отчётов' });
  }
});

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function getWeekEnd(dateStr) {
  const start = new Date(getWeekStart(dateStr));
  start.setDate(start.getDate() + 6);
  return start.toISOString().split('T')[0];
}

function getMonthEnd(dateStr) {
  const [y, m] = dateStr.split('-');
  return new Date(Number(y), Number(m), 0).toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

module.exports = router;

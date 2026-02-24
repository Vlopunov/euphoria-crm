const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { toMinskDate } = require('../utils/dates');

const router = express.Router();
router.use(authenticate);

// GET payments for a booking
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const payments = await queryAll(`SELECT * FROM payments WHERE booking_id = $1 ORDER BY payment_date`, [req.params.bookingId]);
    res.json(payments);
  } catch (err) {
    console.error('GET /payments/booking/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET all payments (with filters)
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to, payment_type, booking_id } = req.query;
    let sql = `
      SELECT p.*, b.booking_date, b.event_type, c.name as client_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN clients c ON b.client_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    if (date_from) { sql += ` AND p.payment_date >= $${paramIndex++}`; params.push(date_from); }
    if (date_to) { sql += ` AND p.payment_date <= $${paramIndex++}`; params.push(date_to); }
    if (payment_type) { sql += ` AND p.payment_type = $${paramIndex++}`; params.push(payment_type); }
    if (booking_id) { sql += ` AND p.booking_id = $${paramIndex++}`; params.push(booking_id); }
    sql += ` ORDER BY p.payment_date DESC`;
    const payments = await queryAll(sql, params);
    res.json(payments);
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create payment (частичный платеж)
router.post('/', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { booking_id, payment_date, amount, payment_type, payment_method, comment } = req.body;
    if (!booking_id || !amount || !payment_type) {
      return res.status(400).json({ error: 'Бронь, сумма и тип платежа обязательны' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'Сумма должна быть положительной' });
    }

    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [booking_id]);
    if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });

    const result = await query(`
      INSERT INTO payments (booking_id, payment_date, amount, payment_type, payment_method, comment, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [booking_id, payment_date || toMinskDate(), amount, payment_type, payment_method || null, comment || null, req.user.id]);

    const paymentId = result.rows[0].id;

    // Auto-update booking status based on total paid
    await recalcBookingStatus(booking_id);

    // Mark deposit tasks as completed
    if (payment_type === 'deposit') {
      await query(`UPDATE tasks SET is_completed = 1 WHERE booking_id = $1 AND task_type = 'deposit_reminder'`, [booking_id]);
    }

    const payment = await queryOne(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    res.status(201).json(payment);

    // Telegram notification (fire-and-forget)
    try { require('../telegram/notifications').notifyPaymentReceived(payment, booking); } catch (e) {}
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE payment (owner only) — recalculate booking status after
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    const payment = await queryOne(`SELECT * FROM payments WHERE id = $1`, [req.params.id]);
    if (!payment) return res.status(404).json({ error: 'Платёж не найден' });

    await query(`DELETE FROM payments WHERE id = $1`, [req.params.id]);

    // Recalculate booking status after deletion
    if (payment.booking_id) {
      await recalcBookingStatus(payment.booking_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /payments/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Recalculate booking payment status
async function recalcBookingStatus(bookingId) {
  const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
  if (!booking || booking.status === 'completed' || booking.status === 'cancelled') return;

  const addonsRow = await queryOne(`SELECT COALESCE(SUM(sale_price * quantity),0) as s FROM booking_add_ons WHERE booking_id = $1`, [bookingId]);
  const grand_total = booking.rental_cost + addonsRow.s;
  const paidRow = await queryOne(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE booking_id = $1`, [bookingId]);
  const total_paid = paidRow.s;

  let newStatus = booking.status;
  if (total_paid >= grand_total) {
    newStatus = 'fully_paid';
  } else if (total_paid > 0) {
    newStatus = 'deposit_paid';
  } else if (total_paid === 0 && (booking.status === 'fully_paid' || booking.status === 'deposit_paid')) {
    newStatus = 'no_deposit';
  }

  if (newStatus !== booking.status) {
    await query(`UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, bookingId]);
  }
}

module.exports = router;

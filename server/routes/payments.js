const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

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

    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [booking_id]);
    if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });

    const result = await query(`
      INSERT INTO payments (booking_id, payment_date, amount, payment_type, payment_method, comment, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [booking_id, payment_date || new Date().toISOString().split('T')[0], amount, payment_type, payment_method || null, comment || null, req.user.id]);

    const paymentId = result.rows[0].id;

    // Auto-update booking status based on total paid
    const addonsRow = await queryOne(`SELECT COALESCE(SUM(sale_price * quantity),0) as s FROM booking_add_ons WHERE booking_id = $1`, [booking_id]);
    const addons_total = addonsRow.s;
    const grand_total = booking.rental_cost + addons_total;
    const paidRow = await queryOne(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE booking_id = $1`, [booking_id]);
    const total_paid = paidRow.s;

    if (total_paid >= grand_total && booking.status !== 'completed') {
      await query(`UPDATE bookings SET status = 'fully_paid', updated_at = NOW() WHERE id = $1`, [booking_id]);
    } else if (payment_type === 'deposit' && booking.status === 'no_deposit') {
      await query(`UPDATE bookings SET status = 'deposit_paid', updated_at = NOW() WHERE id = $1`, [booking_id]);
    } else if (payment_type === 'deposit' && booking.status === 'preliminary') {
      await query(`UPDATE bookings SET status = 'deposit_paid', updated_at = NOW() WHERE id = $1`, [booking_id]);
    }

    // Mark deposit tasks as completed
    if (payment_type === 'deposit') {
      await query(`UPDATE tasks SET is_completed = 1 WHERE booking_id = $1 AND task_type = 'deposit_reminder'`, [booking_id]);
    }

    const payment = await queryOne(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    res.status(201).json(payment);
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE payment (owner only)
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    await query(`DELETE FROM payments WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /payments/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

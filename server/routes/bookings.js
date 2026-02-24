const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Helper: check time overlap (ЗАЩИТА ОТ ДВОЙНОГО БРОНИРОВАНИЯ)
async function checkOverlap(bookingDate, startTime, endTime, excludeId = null) {
  let paramIndex = 1;
  let sql = `
    SELECT id, start_time, end_time, status FROM bookings
    WHERE booking_date = $${paramIndex++} AND is_archived = 0 AND status != 'cancelled'
      AND start_time < $${paramIndex++} AND end_time > $${paramIndex++}
  `;
  const params = [bookingDate, endTime, startTime];
  if (excludeId) {
    sql += ` AND id != $${paramIndex++}`;
    params.push(excludeId);
  }
  return await queryAll(sql, params);
}

// Helper: enrich booking with financials
async function enrichBooking(booking) {
  if (!booking) return null;
  // Get payments
  const payments = await queryAll(`SELECT * FROM payments WHERE booking_id = $1 ORDER BY payment_date`, [booking.id]);
  const total_paid = payments.reduce((s, p) => s + p.amount, 0);
  // Get add-ons
  const addons = await queryAll(`
    SELECT ba.*, s.name as service_name, c.name as category_name
    FROM booking_add_ons ba
    JOIN add_on_services s ON ba.service_id = s.id
    JOIN add_on_categories c ON s.category_id = c.id
    WHERE ba.booking_id = $1
  `, [booking.id]);
  const addons_total = addons.reduce((s, a) => s + a.sale_price * a.quantity, 0);
  const addons_cost = addons.reduce((s, a) => s + (a.cost_price || 0) * a.quantity, 0);
  // Client info
  const client = await queryOne(`SELECT name, phone, telegram, instagram FROM clients WHERE id = $1`, [booking.client_id]);
  // Tasks
  const tasks = await queryAll(`SELECT * FROM tasks WHERE booking_id = $1 ORDER BY due_date`, [booking.id]);

  return {
    ...booking,
    client,
    payments,
    addons,
    tasks,
    addons_total,
    addons_cost,
    addons_margin: addons_total - addons_cost,
    grand_total: booking.rental_cost + addons_total, // общая сумма = аренда + допы
    total_paid,
    remaining: booking.rental_cost + addons_total - total_paid, // остаток к оплате
  };
}

// GET all bookings
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to, status, client_id } = req.query;
    let sql = `SELECT * FROM bookings WHERE is_archived = 0`;
    const params = [];
    let paramIndex = 1;
    if (date_from) { sql += ` AND booking_date >= $${paramIndex++}`; params.push(date_from); }
    if (date_to) { sql += ` AND booking_date <= $${paramIndex++}`; params.push(date_to); }
    if (status) { sql += ` AND status = $${paramIndex++}`; params.push(status); }
    if (client_id) { sql += ` AND client_id = $${paramIndex++}`; params.push(client_id); }
    sql += ` ORDER BY booking_date, start_time`;
    const bookings = await queryAll(sql, params);
    // Light enrichment for list view
    const result = await Promise.all(bookings.map(async (b) => {
      const client = await queryOne(`SELECT name, phone FROM clients WHERE id = $1`, [b.client_id]);
      const paidRow = await queryOne(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE booking_id = $1`, [b.id]);
      const total_paid = paidRow.s;
      const addonsRow = await queryOne(`SELECT COALESCE(SUM(sale_price * quantity),0) as s FROM booking_add_ons WHERE booking_id = $1`, [b.id]);
      const addons_total = addonsRow.s;
      return {
        ...b,
        client_name: client?.name,
        client_phone: client?.phone,
        addons_total,
        grand_total: b.rental_cost + addons_total,
        total_paid,
        remaining: b.rental_cost + addons_total - total_paid,
      };
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /bookings error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET calendar events (light format for FullCalendar)
router.get('/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    let sql = `
      SELECT b.*, c.name as client_name
      FROM bookings b LEFT JOIN clients c ON b.client_id = c.id
      WHERE b.is_archived = 0 AND b.status != 'cancelled'
    `;
    const params = [];
    let paramIndex = 1;
    if (start) { sql += ` AND b.booking_date >= $${paramIndex++}`; params.push(start); }
    if (end) { sql += ` AND b.booking_date <= $${paramIndex++}`; params.push(end); }
    sql += ` ORDER BY b.booking_date, b.start_time`;
    const bookings = await queryAll(sql, params);
    const events = bookings.map(b => {
      const dateStr = typeof b.booking_date === 'string' ? b.booking_date : b.booking_date.toISOString().split('T')[0];
      return {
        id: b.id,
        title: `${b.client_name} — ${b.event_type || 'Мероприятие'}`,
        start: `${dateStr}T${b.start_time}`,
        end: `${dateStr}T${b.end_time}`,
        extendedProps: { status: b.status, guest_count: b.guest_count, hours: b.hours },
        backgroundColor: getStatusColor(b.status),
        borderColor: getStatusColor(b.status),
      };
    });
    res.json(events);
  } catch (err) {
    console.error('GET /bookings/calendar error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

function getStatusColor(status) {
  const colors = {
    preliminary: '#94a3b8',
    no_deposit: '#f59e0b',
    deposit_paid: '#3b82f6',
    fully_paid: '#22c55e',
    completed: '#6b7280',
    cancelled: '#ef4444',
    rescheduled: '#a855f7',
  };
  return colors[status] || '#6b7280';
}

// GET single booking (full details)
router.get('/:id', async (req, res) => {
  try {
    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });
    res.json(await enrichBooking(booking));
  } catch (err) {
    console.error('GET /bookings/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create booking
router.post('/', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { client_id, lead_id, booking_date, start_time, end_time, guest_count, event_type, hourly_rate, comment } = req.body;
    if (!client_id || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Клиент, дата и время обязательны' });
    }
    // Calculate hours (поддержка ночных мероприятий через полночь)
    const [sh, sm] = start_time.split(':').map(Number);
    const [eh, em] = end_time.split(':').map(Number);
    let hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (hours <= 0) hours += 24; // ночное мероприятие (через полночь)

    // ЗАЩИТА ОТ ДВОЙНОГО БРОНИРОВАНИЯ
    const overlaps = await checkOverlap(booking_date, start_time, end_time);
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: 'Время занято! Пересечение с существующими бронями.',
        conflicts: overlaps,
      });
    }

    const rate = hourly_rate || 35;
    const rental_cost = rate * hours;
    const deposit_amount = rate; // задаток = стоимость 1 часа аренды

    const result = await query(`
      INSERT INTO bookings (client_id, lead_id, booking_date, start_time, end_time, hours, guest_count, event_type, hourly_rate, rental_cost, deposit_amount, total_amount, status, comment, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'preliminary', $13, $14)
      RETURNING id
    `, [client_id, lead_id || null, booking_date, start_time, end_time, hours, guest_count || null, event_type || null, rate, rental_cost, deposit_amount, rental_cost, comment || null, req.user.id]);

    const bookingId = result.rows[0].id;

    // If lead_id, update lead
    if (lead_id) {
      await query(`UPDATE leads SET booking_id = $1, status = 'confirmed', updated_at = NOW() WHERE id = $2`, [bookingId, lead_id]);
    }

    // Auto-create tasks
    await query(`INSERT INTO tasks (booking_id, client_id, title, due_date, task_type, assigned_to, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      bookingId, client_id, 'Взять предоплату', booking_date, 'deposit_reminder', req.user.id, req.user.id
    ]);

    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    res.status(201).json(await enrichBooking(booking));
  } catch (err) {
    console.error('POST /bookings error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update booking
router.put('/:id', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Бронь не найдена' });

    const { client_id, booking_date, start_time, end_time, guest_count, event_type, hourly_rate, status, comment } = req.body;

    const bDate = booking_date || existing.booking_date;
    const sTime = start_time || existing.start_time;
    const eTime = end_time || existing.end_time;

    // Recalculate hours (поддержка ночных мероприятий через полночь)
    const [sh, sm] = sTime.split(':').map(Number);
    const [eh, em] = eTime.split(':').map(Number);
    let hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (hours <= 0) hours += 24;

    // Check overlap excluding self
    if (booking_date || start_time || end_time) {
      const overlaps = await checkOverlap(bDate, sTime, eTime, existing.id);
      if (overlaps.length > 0) {
        return res.status(409).json({ error: 'Время занято!', conflicts: overlaps });
      }
    }

    const rate = hourly_rate || existing.hourly_rate;
    const rental_cost = rate * hours;
    const deposit_amount = rate;

    await query(`
      UPDATE bookings SET client_id=$1, booking_date=$2, start_time=$3, end_time=$4, hours=$5, guest_count=$6, event_type=$7, hourly_rate=$8, rental_cost=$9, deposit_amount=$10, total_amount=$11, status=$12, comment=$13, updated_at=NOW()
      WHERE id = $14
    `, [
      client_id || existing.client_id, bDate, sTime, eTime, hours,
      guest_count ?? existing.guest_count, event_type ?? existing.event_type,
      rate, rental_cost, deposit_amount, rental_cost,
      status || existing.status, comment ?? existing.comment, req.params.id
    ]);

    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
    res.json(await enrichBooking(booking));
  } catch (err) {
    console.error('PUT /bookings/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE (soft)
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    await query(`UPDATE bookings SET is_archived = 1, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /bookings/:id error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ========== CATEGORIES ==========
router.get('/categories', async (req, res) => {
  try {
    const categories = await queryAll(`SELECT * FROM add_on_categories ORDER BY sort_order`);
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== SERVICES (каталог) ==========
router.get('/services', async (req, res) => {
  try {
    const services = await queryAll(`
      SELECT s.*, c.name as category_name
      FROM add_on_services s
      JOIN add_on_categories c ON s.category_id = c.id
      WHERE s.is_active = 1
      ORDER BY c.sort_order, s.name
    `);
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/services', authorize('owner', 'admin'), async (req, res) => {
  try {
    const { category_id, name, price, cost_price, executor_type, comment } = req.body;
    if (!category_id || !name) return res.status(400).json({ error: 'Категория и название обязательны' });
    const result = await query(`
      INSERT INTO add_on_services (category_id, name, price, cost_price, executor_type, comment)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [category_id, name, price || 0, cost_price || 0, executor_type || null, comment || null]);
    const service = await queryOne(`SELECT * FROM add_on_services WHERE id = $1`, [result.rows[0].id]);
    res.status(201).json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/services/:id', authorize('owner', 'admin'), async (req, res) => {
  try {
    const { category_id, name, price, cost_price, executor_type, is_active, comment } = req.body;
    await query(`
      UPDATE add_on_services SET category_id=$1, name=$2, price=$3, cost_price=$4, executor_type=$5, is_active=$6, comment=$7
      WHERE id = $8
    `, [category_id, name, price, cost_price || 0, executor_type || null, is_active ?? 1, comment || null, req.params.id]);
    const service = await queryOne(`SELECT * FROM add_on_services WHERE id = $1`, [req.params.id]);
    res.json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ========== BOOKING ADD-ONS (допы к брони) ==========
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const addons = await queryAll(`
      SELECT ba.*, s.name as service_name, c.name as category_name
      FROM booking_add_ons ba
      JOIN add_on_services s ON ba.service_id = s.id
      JOIN add_on_categories c ON s.category_id = c.id
      WHERE ba.booking_id = $1
    `, [req.params.bookingId]);
    res.json(addons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/booking/:bookingId', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { service_id, quantity, sale_price, cost_price } = req.body;
    if (!service_id) return res.status(400).json({ error: 'Услуга обязательна' });
    const service = await queryOne(`SELECT * FROM add_on_services WHERE id = $1`, [service_id]);
    if (!service) return res.status(404).json({ error: 'Услуга не найдена' });

    const result = await query(`
      INSERT INTO booking_add_ons (booking_id, service_id, quantity, sale_price, cost_price)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [req.params.bookingId, service_id, quantity || 1, sale_price ?? service.price, cost_price ?? service.cost_price]);

    // Update booking total_amount
    await updateBookingTotal(req.params.bookingId);

    const addon = await queryOne(`
      SELECT ba.*, s.name as service_name, c.name as category_name
      FROM booking_add_ons ba
      JOIN add_on_services s ON ba.service_id = s.id
      JOIN add_on_categories c ON s.category_id = c.id
      WHERE ba.id = $1
    `, [result.rows[0].id]);
    res.status(201).json(addon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/booking-addon/:id', authorize('owner', 'admin'), async (req, res) => {
  try {
    const addon = await queryOne(`SELECT booking_id FROM booking_add_ons WHERE id = $1`, [req.params.id]);
    await query(`DELETE FROM booking_add_ons WHERE id = $1`, [req.params.id]);
    if (addon) await updateBookingTotal(addon.booking_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

async function updateBookingTotal(bookingId) {
  const booking = await queryOne(`SELECT rental_cost FROM bookings WHERE id = $1`, [bookingId]);
  if (!booking) return;
  const row = await queryOne(`SELECT COALESCE(SUM(sale_price * quantity),0) as s FROM booking_add_ons WHERE booking_id = $1`, [bookingId]);
  await query(`UPDATE bookings SET total_amount = $1, updated_at = NOW() WHERE id = $2`, [booking.rental_cost + row.s, bookingId]);
}

module.exports = router;

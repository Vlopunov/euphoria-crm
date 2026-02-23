const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET all clients
router.get('/', async (req, res) => {
  try {
    const { search, source } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM bookings WHERE client_id = c.id AND is_archived = 0) as booking_count,
        (SELECT COUNT(*) FROM bookings WHERE client_id = c.id AND is_archived = 0) > 1 as is_repeat
      FROM clients c WHERE c.is_archived = 0
    `;
    const params = [];
    let paramIdx = 1;
    if (search) {
      sql += ` AND (c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx + 1} OR c.telegram ILIKE $${paramIdx + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIdx += 3;
    }
    if (source) {
      sql += ` AND c.source = $${paramIdx}`;
      params.push(source);
      paramIdx += 1;
    }
    sql += ` ORDER BY c.created_at DESC`;
    const clients = await queryAll(sql, params);
    res.json(clients);
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET single client
router.get('/:id', async (req, res) => {
  try {
    const client = await queryOne(`
      SELECT c.*,
        (SELECT COUNT(*) FROM bookings WHERE client_id = c.id AND is_archived = 0) as booking_count,
        (SELECT COUNT(*) FROM bookings WHERE client_id = c.id AND is_archived = 0) > 1 as is_repeat
      FROM clients c WHERE c.id = $1
    `, [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    const bookings = await queryAll(
      'SELECT * FROM bookings WHERE client_id = $1 AND is_archived = 0 ORDER BY booking_date DESC',
      [req.params.id]
    );
    const leads = await queryAll(
      'SELECT * FROM leads WHERE client_id = $1 AND is_archived = 0 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ ...client, bookings, leads });
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create client
router.post('/', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, phone, telegram, instagram, source, comment } = req.body;
    if (!name) return res.status(400).json({ error: 'Имя обязательно' });
    const result = await query(`
      INSERT INTO clients (name, phone, telegram, instagram, source, comment)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [name, phone || null, telegram || null, instagram || null, source || null, comment || null]);
    const client = await queryOne('SELECT * FROM clients WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(client);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update client
router.put('/:id', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, phone, telegram, instagram, source, comment } = req.body;
    await query(`
      UPDATE clients SET name=$1, phone=$2, telegram=$3, instagram=$4, source=$5, comment=$6, updated_at=NOW()
      WHERE id = $7
    `, [name, phone || null, telegram || null, instagram || null, source || null, comment || null, req.params.id]);
    const client = await queryOne('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    res.json(client);
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE (soft) client
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    await query('UPDATE clients SET is_archived = 1, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

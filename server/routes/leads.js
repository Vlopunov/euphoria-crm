const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET all leads
router.get('/', async (req, res) => {
  try {
    const { status, source } = req.query;
    let sql = `
      SELECT l.*, c.name as client_name, c.phone as client_phone,
        u.name as assigned_name
      FROM leads l
      LEFT JOIN clients c ON l.client_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.is_archived = 0
    `;
    const params = [];
    let paramIdx = 1;
    if (status) {
      sql += ` AND l.status = $${paramIdx}`;
      params.push(status);
      paramIdx += 1;
    }
    if (source) {
      sql += ` AND l.source = $${paramIdx}`;
      params.push(source);
      paramIdx += 1;
    }
    sql += ` ORDER BY l.created_at DESC`;
    const leads = await queryAll(sql, params);
    res.json(leads);
  } catch (err) {
    console.error('Get leads error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET single lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await queryOne(`
      SELECT l.*, c.name as client_name, c.phone as client_phone
      FROM leads l LEFT JOIN clients c ON l.client_id = c.id WHERE l.id = $1
    `, [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(lead);
  } catch (err) {
    console.error('Get lead error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create lead
router.post('/', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { client_id, desired_date, guest_count, event_type, comment, source, status, assigned_to } = req.body;
    if (!client_id) return res.status(400).json({ error: 'Клиент обязателен' });
    const result = await query(`
      INSERT INTO leads (client_id, desired_date, guest_count, event_type, comment, source, status, assigned_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [client_id, desired_date || null, guest_count || null, event_type || null, comment || null, source || null, status || 'new', assigned_to || null]);
    const lead = await queryOne(`
      SELECT l.*, c.name as client_name FROM leads l LEFT JOIN clients c ON l.client_id = c.id WHERE l.id = $1
    `, [result.rows[0].id]);
    res.status(201).json(lead);
  } catch (err) {
    console.error('Create lead error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update lead (merge with existing to prevent null overwrites)
router.put('/:id', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Заявка не найдена' });

    const { client_id, desired_date, guest_count, event_type, comment, source, status, assigned_to, booking_id } = req.body;
    await query(`
      UPDATE leads SET client_id=$1, desired_date=$2, guest_count=$3, event_type=$4, comment=$5, source=$6, status=$7, assigned_to=$8, booking_id=$9, updated_at=NOW()
      WHERE id = $10
    `, [
      client_id ?? existing.client_id,
      desired_date !== undefined ? (desired_date || null) : existing.desired_date,
      guest_count ?? existing.guest_count,
      event_type !== undefined ? (event_type || null) : existing.event_type,
      comment !== undefined ? (comment || null) : existing.comment,
      source !== undefined ? (source || null) : existing.source,
      status ?? existing.status,
      assigned_to !== undefined ? (assigned_to || null) : existing.assigned_to,
      booking_id !== undefined ? (booking_id || null) : existing.booking_id,
      req.params.id
    ]);
    const lead = await queryOne(`
      SELECT l.*, c.name as client_name FROM leads l LEFT JOIN clients c ON l.client_id = c.id WHERE l.id = $1
    `, [req.params.id]);
    res.json(lead);
  } catch (err) {
    console.error('Update lead error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE (soft)
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    await query('UPDATE leads SET is_archived = 1, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete lead error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

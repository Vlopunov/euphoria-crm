const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET all tasks
router.get('/', async (req, res) => {
  try {
    const { completed, booking_id } = req.query;
    let sql = `
      SELECT t.*, c.name as client_name, b.booking_date, b.event_type,
        u.name as assigned_name
      FROM tasks t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN bookings b ON t.booking_id = b.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    if (completed !== undefined) { sql += ` AND t.is_completed = $${paramIndex++}`; params.push(completed === 'true' ? 1 : 0); }
    if (booking_id) { sql += ` AND t.booking_id = $${paramIndex++}`; params.push(booking_id); }
    sql += ` ORDER BY t.is_completed, t.due_date`;
    const tasks = await queryAll(sql, params);
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create task
router.post('/', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { booking_id, client_id, title, description, due_date, task_type, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Заголовок обязателен' });
    const result = await query(`
      INSERT INTO tasks (booking_id, client_id, title, description, due_date, task_type, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [booking_id || null, client_id || null, title, description || null, due_date || null, task_type || 'other', assigned_to || null, req.user.id]);
    const task = await queryOne(`SELECT * FROM tasks WHERE id = $1`, [result.rows[0].id]);
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update task (toggle complete)
router.put('/:id', authorize('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { title, description, due_date, task_type, is_completed, assigned_to } = req.body;
    const existing = await queryOne(`SELECT * FROM tasks WHERE id = $1`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Задача не найдена' });
    await query(`
      UPDATE tasks SET title=$1, description=$2, due_date=$3, task_type=$4, is_completed=$5, assigned_to=$6
      WHERE id = $7
    `, [
      title ?? existing.title, description ?? existing.description,
      due_date ?? existing.due_date, task_type ?? existing.task_type,
      is_completed ?? existing.is_completed, assigned_to ?? existing.assigned_to, req.params.id
    ]);
    const task = await queryOne(`SELECT * FROM tasks WHERE id = $1`, [req.params.id]);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', authorize('owner', 'admin'), async (req, res) => {
  try {
    await query(`DELETE FROM tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET expense categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await queryAll(`SELECT * FROM expense_categories ORDER BY sort_order`);
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET all expenses
router.get('/', authorize('owner', 'admin'), async (req, res) => {
  try {
    const { date_from, date_to, category_id } = req.query;
    let sql = `
      SELECT e.*, ec.name as category_name, u.name as created_by_name
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.is_archived = 0
    `;
    const params = [];
    let paramIndex = 1;
    if (date_from) { sql += ` AND e.expense_date >= $${paramIndex++}`; params.push(date_from); }
    if (date_to) { sql += ` AND e.expense_date <= $${paramIndex++}`; params.push(date_to); }
    if (category_id) { sql += ` AND e.category_id = $${paramIndex++}`; params.push(category_id); }
    sql += ` ORDER BY e.expense_date DESC`;
    const expenses = await queryAll(sql, params);
    res.json(expenses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST create expense
router.post('/', authorize('owner', 'admin'), async (req, res) => {
  try {
    const { expense_date, category_id, amount, payment_method, booking_id, comment } = req.body;
    if (!category_id || !amount) return res.status(400).json({ error: 'Категория и сумма обязательны' });
    const result = await query(`
      INSERT INTO expenses (expense_date, category_id, amount, payment_method, booking_id, comment, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [expense_date || new Date().toISOString().split('T')[0], category_id, amount, payment_method || null, booking_id || null, comment || null, req.user.id]);
    const expense = await queryOne(`
      SELECT e.*, ec.name as category_name FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id WHERE e.id = $1
    `, [result.rows[0].id]);
    res.status(201).json(expense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update expense
router.put('/:id', authorize('owner', 'admin'), async (req, res) => {
  try {
    const { expense_date, category_id, amount, payment_method, booking_id, comment } = req.body;
    await query(`
      UPDATE expenses SET expense_date=$1, category_id=$2, amount=$3, payment_method=$4, booking_id=$5, comment=$6
      WHERE id = $7
    `, [expense_date, category_id, amount, payment_method || null, booking_id || null, comment || null, req.params.id]);
    const expense = await queryOne(`
      SELECT e.*, ec.name as category_name FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id WHERE e.id = $1
    `, [req.params.id]);
    res.json(expense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE (soft)
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    await query(`UPDATE expenses SET is_archived = 1 WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

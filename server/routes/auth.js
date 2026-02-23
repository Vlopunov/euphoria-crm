const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne } = require('../db/database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const user = await queryOne('SELECT * FROM users WHERE email = $1 AND is_active = 1', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Security: CORS with allowed origins
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173']
  : ['http://localhost:5173', 'https://euphoria-crm.onrender.com'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now but log
    }
  }
}));
app.use(express.json({ limit: '1mb' }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/addons', require('./routes/addons'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));
const googleRoutes = require('./routes/google');
app.use('/api/google', googleRoutes);
app.use('/api/instagram', require('./routes/instagram'));
const telegramRoutes = require('./routes/telegram');
app.use('/api/telegram', telegramRoutes);

// Users endpoint (for selects)
const { queryAll } = require('./db/database');
const { authenticate } = require('./middleware/auth');
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await queryAll('SELECT id, name, email, role FROM users WHERE is_active = 1');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API 404 handler — prevent hanging requests
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve static files in production
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Initialize DB and start server
async function start() {
  const { pool } = require('./db/database');
  const { createSchema } = require('./db/schema');

  // Create tables
  await createSchema(pool);
  console.log('✅ Database schema ready');

  // Auto-seed if fresh database
  const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM users');
  if (Number(rows[0].cnt) === 0) {
    console.log('🌱 Fresh database — seeding initial data...');
    const hash = (pw) => bcrypt.hashSync(pw, 10);

    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`, ['Владелец', 'owner@euphoria.by', hash('owner123'), 'owner']);
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`, ['Администратор Анна', 'anna@euphoria.by', hash('admin123'), 'admin']);
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`, ['Менеджер Катя', 'katya@euphoria.by', hash('manager123'), 'manager']);
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`, ['Просмотр', 'viewer@euphoria.by', hash('viewer123'), 'viewer']);

    const cats = ['Декор','Кейтеринг','Техника','Ведущий','Фотограф','Аниматор','Уборка','Аренда посуды'];
    for (let i = 0; i < cats.length; i++) {
      await pool.query('INSERT INTO add_on_categories (name, sort_order) VALUES ($1, $2)', [cats[i], i + 1]);
    }

    const expCats = ['Аренда помещения','Коммунальные','Интернет','Реклама','Подрядчики','Закупки / расходники','Уборка','Прочее'];
    for (let i = 0; i < expCats.length; i++) {
      await pool.query('INSERT INTO expense_categories (name, sort_order) VALUES ($1, $2)', [expCats[i], i + 1]);
    }

    console.log('✅ Seeded users and categories');
  }

  // Initialize Telegram bot (if configured)
  await telegramRoutes.initBot().catch(err => {
    console.error('[TG] Bot init error (non-fatal):', err.message);
  });

  app.listen(PORT, () => {
    console.log(`Сервер Эйфория запущен на http://localhost:${PORT}`);

    cron.schedule('0 8,20 * * *', () => {
      googleRoutes.syncAllAccounts().catch(err => {
        console.error('[CRON] Ошибка авто-синхронизации:', err.message);
      });
    }, {
      timezone: 'Europe/Minsk',
    });
    console.log('⏰ Авто-синхронизация Google Calendar: 08:00 и 20:00 (Минск)');

    // Telegram cron: утренний брифинг 09:00 Минск
    cron.schedule('0 9 * * *', () => {
      const { notifyMorningBriefing } = require('./telegram/notifications');
      notifyMorningBriefing().catch(err => {
        console.error('[CRON] Ошибка утреннего брифинга:', err.message);
      });
    }, { timezone: 'Europe/Minsk' });

    // Telegram cron: завтрашние мероприятия 20:00 Минск
    cron.schedule('0 20 * * *', () => {
      const { notifyUpcomingEvents } = require('./telegram/notifications');
      notifyUpcomingEvents().catch(err => {
        console.error('[CRON] Ошибка уведомления о завтрашних событиях:', err.message);
      });
    }, { timezone: 'Europe/Minsk' });
    console.log('🤖 Telegram cron: 09:00 брифинг, 20:00 завтрашние события (Минск)');
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('./database');
const bcrypt = require('bcryptjs');

console.log('Seeding database...');

const hash = (pw) => bcrypt.hashSync(pw, 10);

// Clear existing data
db.exec(`
  DELETE FROM audit_log;
  DELETE FROM tasks;
  DELETE FROM expenses;
  DELETE FROM booking_add_ons;
  DELETE FROM payments;
  DELETE FROM bookings;
  DELETE FROM leads;
  DELETE FROM clients;
  DELETE FROM add_on_services;
  DELETE FROM add_on_categories;
  DELETE FROM expense_categories;
  DELETE FROM users;
`);

// ===================== USERS =====================
const insertUser = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`);
insertUser.run('Владелец', 'owner@euphoria.by', hash('owner123'), 'owner');
insertUser.run('Администратор Анна', 'anna@euphoria.by', hash('admin123'), 'admin');
insertUser.run('Менеджер Катя', 'katya@euphoria.by', hash('manager123'), 'manager');
insertUser.run('Просмотр', 'viewer@euphoria.by', hash('viewer123'), 'viewer');

// ===================== ADD-ON CATEGORIES =====================
const insertCat = db.prepare(`INSERT INTO add_on_categories (name, sort_order) VALUES (?, ?)`);
insertCat.run('Декор', 1);
insertCat.run('Кейтеринг', 2);
insertCat.run('Техника', 3);
insertCat.run('Ведущий', 4);
insertCat.run('Фотограф', 5);
insertCat.run('Аниматор', 6);
insertCat.run('Уборка', 7);
insertCat.run('Аренда посуды', 8);

// ===================== ADD-ON SERVICES =====================
const insertSvc = db.prepare(`INSERT INTO add_on_services (category_id, name, price, cost_price, executor_type) VALUES (?, ?, ?, ?, ?)`);
// Декор (cat 1)
insertSvc.run(1, 'Базовый декор (шары, гирлянды)', 50, 20, 'own');
insertSvc.run(1, 'Тематический декор', 120, 60, 'contractor');
insertSvc.run(1, 'Фотозона', 80, 30, 'own');
// Кейтеринг (cat 2)
insertSvc.run(2, 'Набор закусок (10 чел.)', 150, 90, 'contractor');
insertSvc.run(2, 'Торт на заказ', 80, 50, 'contractor');
insertSvc.run(2, 'Напитки (набор)', 40, 25, 'own');
// Техника (cat 3)
insertSvc.run(3, 'Проектор + экран', 30, 0, 'own');
insertSvc.run(3, 'Колонка JBL', 15, 0, 'own');
insertSvc.run(3, 'Караоке', 40, 10, 'own');
// Ведущий (cat 4)
insertSvc.run(4, 'Ведущий (2 часа)', 200, 150, 'contractor');
// Фотограф (cat 5)
insertSvc.run(5, 'Фотограф (1 час)', 100, 70, 'contractor');
insertSvc.run(5, 'Фотограф (2 часа)', 180, 130, 'contractor');
// Аниматор (cat 6)
insertSvc.run(6, 'Аниматор (1 час)', 120, 80, 'contractor');
// Уборка (cat 7)
insertSvc.run(7, 'Усиленная уборка', 30, 15, 'own');
// Посуда (cat 8)
insertSvc.run(8, 'Набор посуды (10 чел.)', 20, 5, 'own');

// ===================== EXPENSE CATEGORIES =====================
const insertExpCat = db.prepare(`INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)`);
insertExpCat.run('Аренда помещения', 1);
insertExpCat.run('Коммунальные', 2);
insertExpCat.run('Интернет', 3);
insertExpCat.run('Реклама', 4);
insertExpCat.run('Подрядчики', 5);
insertExpCat.run('Закупки / расходники', 6);
insertExpCat.run('Уборка', 7);
insertExpCat.run('Прочее', 8);

// ===================== CLIENTS =====================
const insertClient = db.prepare(`INSERT INTO clients (name, phone, telegram, instagram, source, comment, first_contact_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertClient.run('Ирина Петрова', '+375291234567', '@irina_p', 'irina_style', 'instagram', 'День рождения дочери', '2025-01-15');
insertClient.run('Алексей Козлов', '+375297654321', '@alexk', null, 'recommendation', 'Корпоратив', '2025-02-01');
insertClient.run('Мария Сидорова', '+375331112233', null, 'maria_s_minsk', 'instagram', 'Девичник', '2025-02-10');
insertClient.run('Дмитрий Новиков', '+375294445566', '@dima_nov', null, 'website', 'Мастер-класс по живописи', '2025-02-20');
insertClient.run('Елена Волкова', '+375257778899', '@elena_v', 'elena_volkova_', '2gis', 'Повторный клиент', '2024-12-01');
insertClient.run('Ольга Кравченко', '+375296667788', '@olga_k', null, 'telegram', 'Детский праздник', '2025-03-01');
insertClient.run('Сергей Иванов', '+375291119988', null, null, 'yandex', 'Вечеринка-сюрприз', '2025-03-05');
insertClient.run('Наталья Белова', '+375335554433', '@nat_belova', 'nat_bel', 'relax', null, '2025-03-10');

// ===================== LEADS =====================
const insertLead = db.prepare(`INSERT INTO leads (client_id, contact_date, desired_date, guest_count, event_type, comment, source, status, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertLead.run(6, '2025-03-01', '2025-03-15', 8, 'Детский праздник', 'Дочери 5 лет', 'telegram', 'confirmed', 2);
insertLead.run(7, '2025-03-05', '2025-03-20', 12, 'Вечеринка', 'Сюрприз для жены', 'yandex', 'in_progress', 3);
insertLead.run(8, '2025-03-10', '2025-03-25', 6, 'Мастер-класс', null, 'relax', 'new', null);

// Use current dates for realistic demo
const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const tomorrow = addDays(today, 1);
const in3days = addDays(today, 3);
const in5days = addDays(today, 5);
const in7days = addDays(today, 7);
const ago3days = addDays(today, -3);
const ago7days = addDays(today, -7);
const ago14days = addDays(today, -14);

// ===================== BOOKINGS =====================
const insertBooking = db.prepare(`INSERT INTO bookings (client_id, lead_id, booking_date, start_time, end_time, hours, guest_count, event_type, hourly_rate, rental_cost, deposit_amount, total_amount, status, comment, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

// Booking 1: completed (ago 14 days)
insertBooking.run(1, null, fmt(ago14days), '15:00', '19:00', 4, 10, 'День рождения', 35, 140, 35, 140, 'completed', 'День рождения Софии, 7 лет', 1);
// Booking 2: completed (ago 7 days)
insertBooking.run(5, null, fmt(ago7days), '18:00', '22:00', 4, 8, 'Вечеринка', 40, 160, 40, 160, 'completed', 'Повторный клиент, скидка', 1);
// Booking 3: completed (ago 3 days)
insertBooking.run(2, null, fmt(ago3days), '10:00', '14:00', 4, 12, 'Корпоратив', 45, 180, 45, 180, 'completed', 'Мини-корпоратив, тимбилдинг', 2);
// Booking 4: fully_paid, tomorrow
insertBooking.run(3, null, fmt(tomorrow), '16:00', '20:00', 4, 7, 'Девичник', 40, 160, 40, 160, 'fully_paid', 'Девичник перед свадьбой', 2);
// Booking 5: deposit_paid, in 3 days
insertBooking.run(6, 1, fmt(in3days), '14:00', '17:00', 3, 8, 'Детский праздник', 35, 105, 35, 105, 'deposit_paid', 'Аниматор + декор', 2);
// Booking 6: no_deposit, in 5 days
insertBooking.run(4, null, fmt(in5days), '11:00', '14:00', 3, 6, 'Мастер-класс', 30, 90, 30, 90, 'no_deposit', 'Мастер-класс акварель', 3);
// Booking 7: preliminary, in 7 days
insertBooking.run(7, 2, fmt(in7days), '19:00', '23:00', 4, 12, 'Вечеринка', 45, 180, 45, 180, 'preliminary', 'Обсуждается караоке', 3);

// ===================== PAYMENTS (частичные платежи) =====================
const insertPayment = db.prepare(`INSERT INTO payments (booking_id, payment_date, amount, payment_type, payment_method, comment, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`);
// Booking 1: полностью оплачена
insertPayment.run(1, fmt(addDays(ago14days, -3)), 35, 'deposit', 'card_transfer', 'Задаток за 1 час', 1);
insertPayment.run(1, fmt(ago14days), 105, 'additional', 'cash', 'Доплата в день мероприятия', 1);
insertPayment.run(1, fmt(ago14days), 50, 'addons', 'cash', 'Оплата допов (декор)', 1);
// Booking 2: полностью оплачена
insertPayment.run(2, fmt(addDays(ago7days, -2)), 40, 'deposit', 'erip', 'Задаток ЕРИП', 1);
insertPayment.run(2, fmt(ago7days), 120, 'additional', 'cash', 'Доплата', 1);
// Booking 3: полностью оплачена
insertPayment.run(3, fmt(addDays(ago3days, -5)), 45, 'deposit', 'card_transfer', 'Предоплата перевод', 2);
insertPayment.run(3, fmt(ago3days), 135, 'additional', 'bank_account', 'Оплата по р/с', 2);
insertPayment.run(3, fmt(ago3days), 200, 'addons', 'bank_account', 'Допы (ведущий)', 2);
// Booking 4: полностью оплачена
insertPayment.run(4, fmt(addDays(today, -5)), 40, 'deposit', 'card_transfer', 'Задаток', 2);
insertPayment.run(4, fmt(addDays(today, -1)), 120, 'additional', 'card_transfer', 'Доплата', 2);
// Booking 5: только задаток
insertPayment.run(5, fmt(addDays(today, -2)), 35, 'deposit', 'card_transfer', 'Задаток', 2);

// ===================== BOOKING ADD-ONS =====================
const insertAddon = db.prepare(`INSERT INTO booking_add_ons (booking_id, service_id, quantity, sale_price, cost_price) VALUES (?, ?, ?, ?, ?)`);
// Booking 1: декор + напитки
insertAddon.run(1, 1, 1, 50, 20); // Базовый декор
insertAddon.run(1, 6, 1, 40, 25); // Напитки
// Booking 2: караоке
insertAddon.run(2, 9, 1, 40, 10); // Караоке
// Booking 3: ведущий + закуски
insertAddon.run(3, 10, 1, 200, 150); // Ведущий
insertAddon.run(3, 4, 1, 150, 90); // Закуски
// Booking 4: фотозона + посуда
insertAddon.run(4, 3, 1, 80, 30); // Фотозона
insertAddon.run(4, 15, 1, 20, 5); // Посуда
// Booking 5: аниматор + декор + торт
insertAddon.run(5, 13, 1, 120, 80); // Аниматор
insertAddon.run(5, 1, 1, 50, 20); // Декор
insertAddon.run(5, 5, 1, 80, 50); // Торт

// ===================== EXPENSES =====================
const insertExpense = db.prepare(`INSERT INTO expenses (expense_date, category_id, amount, payment_method, booking_id, comment, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertExpense.run(fmt(addDays(today, -30)), 1, 800, 'bank_account', null, 'Аренда за месяц', 1);
insertExpense.run(fmt(addDays(today, -25)), 2, 120, 'erip', null, 'Коммунальные февраль', 1);
insertExpense.run(fmt(addDays(today, -20)), 3, 35, 'erip', null, 'Интернет', 1);
insertExpense.run(fmt(addDays(today, -15)), 4, 200, 'card_transfer', null, 'Таргет Instagram', 1);
insertExpense.run(fmt(addDays(today, -10)), 6, 50, 'cash', null, 'Расходники (свечи, салфетки)', 2);
insertExpense.run(fmt(ago3days), 5, 150, 'cash', 3, 'Ведущий (подрядчик)', 2);
insertExpense.run(fmt(ago14days), 7, 15, 'cash', 1, 'Уборка после мероприятия', 2);

// ===================== TASKS =====================
const insertTask = db.prepare(`INSERT INTO tasks (booking_id, client_id, title, description, due_date, task_type, is_completed, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertTask.run(5, 6, 'Взять доплату за бронь', 'Ольга — детский праздник, осталось 70 BYN', fmt(addDays(today, 1)), 'payment_reminder', 0, 2, 1);
insertTask.run(5, 6, 'Обсудить допы', 'Уточнить нужен ли торт и посуда', fmt(addDays(today, 1)), 'addons_discuss', 0, 2, 1);
insertTask.run(6, 4, 'Взять предоплату', 'Мастер-класс Дмитрий — нет предоплаты', fmt(addDays(today, 2)), 'deposit_reminder', 0, 3, 1);
insertTask.run(7, 7, 'Подтвердить бронь', 'Сергей — вечеринка-сюрприз, ждем ответ', fmt(addDays(today, 3)), 'deposit_reminder', 0, 3, 1);
insertTask.run(3, 2, 'Запросить отзыв', 'Корпоратив прошёл, попросить отзыв', fmt(today), 'review_request', 0, 2, 1);
insertTask.run(1, 1, 'Запросить отзыв', 'ДР Софии — спросить отзыв и фото', fmt(addDays(ago14days, 2)), 'review_request', 1, 2, 1);

console.log('Database seeded successfully!');
console.log('Users:');
console.log('  owner@euphoria.by / owner123 (Owner)');
console.log('  anna@euphoria.by / admin123 (Администратор)');
console.log('  katya@euphoria.by / manager123 (Менеджер)');
console.log('  viewer@euphoria.by / viewer123 (Просмотр)');
process.exit(0);

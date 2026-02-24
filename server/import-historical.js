/**
 * Импорт исторических данных из Telegram-чата (октябрь 2025 - февраль 2026)
 * Запуск: node import-historical.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_rQM3b8gPziwu@ep-lively-tooth-alp6f2m0-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

// ─── Helpers ──────────────────────────────────────────────
function endTime(startTime, hours) {
  const [h, m] = startTime.split(':').map(Number);
  let totalMin = h * 60 + m + hours * 60;
  if (totalMin >= 1440) totalMin -= 1440;
  const eh = Math.floor(totalMin / 60);
  const em = totalMin % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function startForHours(hours) {
  if (hours >= 9) return '15:00';
  if (hours >= 7) return '16:00';
  if (hours >= 5) return '17:00';
  return '18:00';
}

async function insertBooking(client, data) {
  const {
    client_id, booking_date, start_time, end_time: eTime, hours,
    hourly_rate, rental_cost, deposit_amount = 0,
    total_amount, status = 'completed', comment = '', event_type = 'Мероприятие'
  } = data;
  const et = eTime || endTime(start_time, hours);
  const rate = hourly_rate || (hours > 0 ? Math.round(rental_cost / hours * 100) / 100 : 0);
  const total = total_amount ?? rental_cost;

  const res = await client.query(`
    INSERT INTO bookings (client_id, booking_date, start_time, end_time, hours, guest_count, event_type,
      hourly_rate, rental_cost, deposit_amount, total_amount, status, comment, created_by, is_archived)
    VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,1,0)
    RETURNING id
  `, [client_id, booking_date, start_time, et, hours, event_type, rate, rental_cost, deposit_amount, total, status, comment]);
  return res.rows[0].id;
}

async function insertPayment(client, bookingId, amount, method, type = 'additional', paymentDate = null, comment = '') {
  if (!amount || amount <= 0) return;
  await client.query(`
    INSERT INTO payments (booking_id, payment_date, amount, payment_type, payment_method, comment, created_by)
    VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, 1)
  `, [bookingId, paymentDate, amount, type, method, comment || null]);
}

async function insertAddon(client, bookingId, serviceId, salePrice, qty = 1) {
  if (!salePrice || salePrice <= 0) return;
  await client.query(`
    INSERT INTO booking_add_ons (booking_id, service_id, quantity, sale_price, cost_price)
    VALUES ($1, $2, $3, $4, 0)
  `, [bookingId, serviceId, qty, salePrice]);
}

// ═══════════════════════════════════════════════════════════
async function main() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    console.log('=== Импорт исторических данных ===\n');

    // ─── 1. Создаём клиента «Гость» ──────────────────────
    const guestRes = await db.query(`
      INSERT INTO clients (name, comment, source, first_contact_date)
      VALUES ('Гость', 'Анонимные исторические мероприятия (импорт из Telegram)', 'other', '2025-10-03')
      RETURNING id
    `);
    const GUEST = guestRes.rows[0].id;
    const KATARINA = 1; // уже существует
    console.log(`Клиент «Гость» создан: ID ${GUEST}`);

    // ─── 2. Услуги допов (используем существующие категории) ─
    // Существующие категории: 1=Декор, 2=Кейтеринг, 8=Аренда посуды
    // Добавим "Развлечения" как новую категорию
    const catFunRes = await db.query(`INSERT INTO add_on_categories (name, sort_order) VALUES ('Развлечения', 9) RETURNING id`);
    const catFun = catFunRes.rows[0].id;

    const svcDishes    = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (8, 'Посуда', 20) RETURNING id`)).rows[0].id;
    const svcDecor     = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (1, 'Декор', 15) RETURNING id`)).rows[0].id;
    const svcGlasses   = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (8, 'Бокалы', 4) RETURNING id`)).rows[0].id;
    const svcPlates    = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (8, 'Тарелки', 5) RETURNING id`)).rows[0].id;
    const svcDishDecor = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (1, 'Посуда и декор', 30) RETURNING id`)).rows[0].id;
    const svcHookah    = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES ($1, 'Кальян', 80) RETURNING id`, [catFun])).rows[0].id;
    const svcMafia     = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES ($1, 'Мафия', 100) RETURNING id`, [catFun])).rows[0].id;
    const svcCatering  = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES (2, 'Кейтеринг', 140) RETURNING id`)).rows[0].id;
    const svcPhotozone = (await db.query(`INSERT INTO add_on_services (category_id, name, price) VALUES ($1, 'Фотозона', 50) RETURNING id`, [catFun])).rows[0].id;
    console.log('Услуги допов созданы');

    // ─── 3. Используем существующие категории расходов ─────
    // 1=Аренда помещения, 2=Коммунальные, 3=Интернет, 4=Реклама,
    // 5=Подрядчики, 6=Закупки/расходники, 7=Уборка, 8=Прочее
    const expCatRent   = 1; // Аренда помещения (аренда + коммуналка)
    const expCatInet   = 3; // Интернет
    const expCatHouse  = 6; // Закупки / расходники (хозтовары)
    const expCatAcct   = 8; // Прочее (бухгалтер)
    const expCatTax    = 8; // Прочее (налоги)
    const expCatSupply = 6; // Закупки / расходники
    const expCatDeliv  = 8; // Прочее (доставка)
    const expCatEquip  = 6; // Закупки / расходники (оборудование)
    console.log('Категории расходов: используем существующие\n');

    let totalBookings = 0;
    let totalPayments = 0;

    // ═══════════════════════════════════════════════════════
    // ОКТЯБРЬ 2025
    // ═══════════════════════════════════════════════════════
    console.log('--- Октябрь 2025 ---');

    // 3 октября (пт) | Аренда 216+67=283 | 4+1=5ч | Итого 283
    let bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-03', start_time: '17:00', hours: 5,
      rental_cost: 283, deposit_amount: 0, comment: 'Аренда 216 руб + Продление 67 руб (1ч). Основное 4 часа. Наличные'
    });
    await insertPayment(db, bid, 283, 'cash', 'additional', '2025-10-03');
    totalBookings++; totalPayments++;

    // 4 октября (сб) | Аренда 360+120=480 | Бокалы 12 | 6+2=8ч | Итого 492
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-04', start_time: '16:00', hours: 8,
      rental_cost: 480, deposit_amount: 0, comment: 'Аренда 360 руб + Продление 120 руб (2ч). Бокалы 12 руб. Итого 492 руб. Наличные'
    });
    await insertAddon(db, bid, svcGlasses, 12);
    await insertPayment(db, bid, 492, 'cash', 'additional', '2025-10-04');
    totalBookings++; totalPayments++;

    // 5 октября (вс) | Аренда 240 | 4ч
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-05', start_time: '18:00', hours: 4,
      rental_cost: 240, deposit_amount: 0, comment: 'Основное время 4 часа. Наличные'
    });
    await insertPayment(db, bid, 240, 'cash', 'additional', '2025-10-05');
    totalBookings++; totalPayments++;

    // 7 октября (вт) | Аренда 330 | Декор 15 + Тарелки 5 | 7ч | Итого 350
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-07', start_time: '16:00', hours: 7,
      rental_cost: 330, deposit_amount: 0, comment: 'Декор 15 руб, тарелки 5 руб. Итого 350 руб. Наличные'
    });
    await insertAddon(db, bid, svcDecor, 15);
    await insertAddon(db, bid, svcPlates, 5);
    await insertPayment(db, bid, 350, 'cash', 'additional', '2025-10-07');
    totalBookings++; totalPayments++;

    // 11 октября (сб) | Аренда 240+75=315 | Декор 15 | 4+1=5ч | Итого 330
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-11', start_time: '18:00', hours: 5,
      rental_cost: 315, deposit_amount: 0, comment: 'Аренда 240 руб + Продление 75 руб (1ч). Декор 15 руб. Итого 330 руб. Наличные'
    });
    await insertAddon(db, bid, svcDecor, 15);
    await insertPayment(db, bid, 330, 'cash', 'additional', '2025-10-11');
    totalBookings++; totalPayments++;

    // 12 октября (вс) | Аренда 180 | 3ч | Итого 180
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-12', start_time: '18:00', hours: 3,
      rental_cost: 180, deposit_amount: 0, comment: 'Без продлений и без допов. Наличные'
    });
    await insertPayment(db, bid, 180, 'cash', 'additional', '2025-10-12');
    totalBookings++; totalPayments++;

    // Катарина октябрь: 14(вт) 2ч 80р, 18(сб) 3ч 135р, 21(вт) 2ч 80р, 28(вт) 2ч 80р = 375р
    for (const [d, h, cost] of [['2025-10-14',2,80],['2025-10-18',3,135],['2025-10-21',2,80],['2025-10-28',2,80]]) {
      const st = d === '2025-10-18' ? '10:00' : '16:00';
      bid = await insertBooking(db, {
        client_id: KATARINA, booking_date: d, start_time: st, hours: h,
        rental_cost: cost, deposit_amount: 0, event_type: 'Занятие',
        comment: `Катарина — регулярное занятие`
      });
      await insertPayment(db, bid, cost, 'cash', 'additional', d);
      totalBookings++; totalPayments++;
    }
    console.log('  Катарина октябрь: 4 занятия, 375 руб');

    // 17 октября (пт) | Аренда 465+150=615 | 7+2=9ч | По карте
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-17', start_time: '15:00', hours: 9,
      rental_cost: 615, deposit_amount: 0, comment: 'Аренда 465 руб + Продление 150 руб (2ч). Без допов. Вся сумма по карте'
    });
    await insertPayment(db, bid, 615, 'card_transfer', 'additional', '2025-10-17');
    totalBookings++; totalPayments++;

    // 18 октября (сб) | Аренда 315+75=390 | Посуда/декор 60 | 5+1=6ч | 160 карта 290 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-18', start_time: '17:00', hours: 6,
      rental_cost: 390, deposit_amount: 0, comment: 'Аренда 315 руб + Продление 75 руб (1ч). Посуда/декор 60 руб. Итого 450 руб. Карта 160, нал 290'
    });
    await insertAddon(db, bid, svcDishDecor, 60);
    await insertPayment(db, bid, 160, 'card_transfer', 'deposit', '2025-10-18');
    await insertPayment(db, bid, 290, 'cash', 'additional', '2025-10-18');
    totalBookings++; totalPayments += 2;

    // 19 октября (вс) | Аренда 300 | Посуда 28 | 5ч | Итого 328 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-19', start_time: '17:00', hours: 5,
      rental_cost: 300, deposit_amount: 0, comment: 'Посуда 28 руб. Итого 328 руб. Наличные'
    });
    await insertAddon(db, bid, svcDishes, 28);
    await insertPayment(db, bid, 328, 'cash', 'additional', '2025-10-19');
    totalBookings++; totalPayments++;

    // 25 октября (сб) | Аренда 375 | Кальян 80 | 6ч | Итого 455 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-25', start_time: '17:00', hours: 6,
      rental_cost: 375, deposit_amount: 0, comment: 'Кальян 80 руб. Итого 455 руб. Наличные'
    });
    await insertAddon(db, bid, svcHookah, 80);
    await insertPayment(db, bid, 455, 'cash', 'additional', '2025-10-25');
    totalBookings++; totalPayments++;

    // 31 октября (пт) | Аренда 180 | Бокалы 4 | 3ч | Итого 184 по карте
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-31', start_time: '18:00', hours: 3,
      rental_cost: 180, deposit_amount: 0, comment: 'Бокалы 4 руб. Итого 184 руб. Всё по карте'
    });
    await insertAddon(db, bid, svcGlasses, 4);
    await insertPayment(db, bid, 184, 'card_transfer', 'additional', '2025-10-31');
    totalBookings++; totalPayments++;

    // Октябрь: отмены (16 и 30 октября)
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-16', start_time: '18:00', hours: 3,
      rental_cost: 0, deposit_amount: 45, status: 'cancelled',
      comment: 'Отмена мероприятия. Задаток 45 руб (из общих 90 за 2 отмены 16 и 30 октября)'
    });
    await insertPayment(db, bid, 45, 'cash', 'deposit', '2025-10-16');
    totalBookings++; totalPayments++;

    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-10-30', start_time: '18:00', hours: 3,
      rental_cost: 0, deposit_amount: 45, status: 'cancelled',
      comment: 'Отмена мероприятия. Задаток 45 руб (из общих 90 за 2 отмены 16 и 30 октября)'
    });
    await insertPayment(db, bid, 45, 'cash', 'deposit', '2025-10-30');
    totalBookings++; totalPayments++;

    console.log(`  Октябрь: ${15} мероприятий + 2 отмены`);

    // Расходы октября
    await db.query(`INSERT INTO expenses (expense_date, category_id, amount, payment_method, comment, created_by) VALUES
      ('2025-10-27', $1, 900, 'cash', 'Коммуналка и аренда', 1),
      ('2025-10-27', $2, 60, 'cash', 'Интернет', 1),
      ('2025-10-27', $3, 20, 'cash', 'Хознужды', 1),
      ('2025-10-27', $4, 100, 'cash', 'Бухгалтер', 1),
      ('2025-10-27', $5, 100, 'cash', 'Налоги', 1)
    `, [expCatRent, expCatInet, expCatHouse, expCatAcct, expCatTax]);
    console.log('  Расходы октября: 1180 руб');

    // ═══════════════════════════════════════════════════════
    // НОЯБРЬ 2025
    // ═══════════════════════════════════════════════════════
    console.log('\n--- Ноябрь 2025 ---');

    // 1 ноября (сб) | Аренда 180 | Бокалы/декор 20 | 3ч | 60 карта 140 нал | Итого 200
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-01', start_time: '18:00', hours: 3,
      rental_cost: 180, deposit_amount: 60, comment: 'Бокалы и декор 20 руб. Итого 200 руб. Предоплата 60 по карте, 140 наличными'
    });
    await insertAddon(db, bid, svcDishDecor, 20);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-01');
    await insertPayment(db, bid, 140, 'cash', 'additional', '2025-11-01');
    totalBookings++; totalPayments += 2;

    // 3 ноября (пн) | Аренда 135 | Посуда 15 | 3ч | 45 карта 105 нал | Итого 150
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-03', start_time: '18:00', hours: 3,
      rental_cost: 135, deposit_amount: 0, comment: 'Посуда 15 руб. Итого 150 руб. Карта 45, нал 105'
    });
    await insertAddon(db, bid, svcDishes, 15);
    await insertPayment(db, bid, 45, 'card_transfer', 'deposit', '2025-11-03');
    await insertPayment(db, bid, 105, 'cash', 'additional', '2025-11-03');
    totalBookings++; totalPayments += 2;

    // 4 ноября (вт) | Аренда 225 | Посуда/декор/фотозона/кальян 109 | 5ч | 45 карта 290 нал | Итого 335
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-04', start_time: '17:00', hours: 5,
      rental_cost: 225, deposit_amount: 0, comment: 'Посуда, декор, фотозона и кальян 109 руб. Итого 334 руб. Карта 45, нал 290'
    });
    await insertAddon(db, bid, svcDishDecor, 109);
    await insertPayment(db, bid, 45, 'card_transfer', 'deposit', '2025-11-04');
    await insertPayment(db, bid, 290, 'cash', 'additional', '2025-11-04');
    totalBookings++; totalPayments += 2;

    // 8 ноября (сб) | Аренда 240 | 4ч | 60 карта 180 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-08', start_time: '18:00', hours: 4,
      rental_cost: 240, deposit_amount: 60, comment: 'Без продлений и без доп.услуг. Карта 60, нал 180'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-08');
    await insertPayment(db, bid, 180, 'cash', 'additional', '2025-11-08');
    totalBookings++; totalPayments += 2;

    // 15 ноября (сб) | Аренда 360 | Посуда 40 | 6ч | 60 карта 340 нал | Итого 400
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-15', start_time: '17:00', hours: 6,
      rental_cost: 360, deposit_amount: 60, comment: 'Посуда 40 руб. Итого 400 руб. Карта 60, нал 340. Без продлений'
    });
    await insertAddon(db, bid, svcDishes, 40);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-15');
    await insertPayment(db, bid, 340, 'cash', 'additional', '2025-11-15');
    totalBookings++; totalPayments += 2;

    // 21 ноября (пт) | Аренда 105 | 3ч | 90 карта 15 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-21', start_time: '18:00', hours: 3,
      rental_cost: 105, deposit_amount: 0, comment: 'Без продлений. Карта 90, нал 15'
    });
    await insertPayment(db, bid, 90, 'card_transfer', 'deposit', '2025-11-21');
    await insertPayment(db, bid, 15, 'cash', 'additional', '2025-11-21');
    totalBookings++; totalPayments += 2;

    // 22 ноября (сб) | Аренда 480 | Посуда/декор 55 | 6+2=8ч | 180 карта 355 нал | Итого 535
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-22', start_time: '17:00', hours: 8,
      rental_cost: 480, deposit_amount: 0, comment: 'Посуда и декор 55 руб. 6ч + 2ч продление. Итого 535 руб. Карта 180, нал 355'
    });
    await insertAddon(db, bid, svcDishDecor, 55);
    await insertPayment(db, bid, 180, 'card_transfer', 'deposit', '2025-11-22');
    await insertPayment(db, bid, 355, 'cash', 'additional', '2025-11-22');
    totalBookings++; totalPayments += 2;

    // 29 ноября (сб) | Аренда 262.50 | Кальян 80 | Посуда 51.60 | 4ч | 60 карта 334 нал | Итого 394
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-29', start_time: '18:00', hours: 4,
      rental_cost: 262.50, deposit_amount: 60, comment: 'Кальян 80 руб, посуда 51.60 руб. Итого 394 руб. Карта 60, нал 334. Без продлений'
    });
    await insertAddon(db, bid, svcHookah, 80);
    await insertAddon(db, bid, svcDishes, 51.60);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-29');
    await insertPayment(db, bid, 334, 'cash', 'additional', '2025-11-29');
    totalBookings++; totalPayments += 2;

    // 30 ноября (вс) | Аренда 180 | Декор/посуда 20 | 3ч | 60 карта 140 нал | Итого 200
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-30', start_time: '18:00', hours: 3,
      rental_cost: 180, deposit_amount: 60, comment: 'Декор и посуда 20 руб. Итого 200 руб. Карта 60, нал 140. Без продлений'
    });
    await insertAddon(db, bid, svcDishDecor, 20);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-30');
    await insertPayment(db, bid, 140, 'cash', 'additional', '2025-11-30');
    totalBookings++; totalPayments += 2;

    // Катарина ноябрь: 215 руб (сводная запись)
    bid = await insertBooking(db, {
      client_id: KATARINA, booking_date: '2025-11-15', start_time: '16:00', hours: 5,
      rental_cost: 215, deposit_amount: 0, event_type: 'Занятие',
      comment: 'Катарина — сводная запись за ноябрь 2025. Итого 215 руб'
    });
    await insertPayment(db, bid, 215, 'cash', 'additional', '2025-11-14');
    totalBookings++; totalPayments++;
    console.log('  Катарина ноябрь: 215 руб (сводная)');

    // Ноябрь: отмены
    // 14 ноября: 2 отмены, задаток 120 руб (по 60 каждая, по карте)
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-14', start_time: '17:00', hours: 3,
      rental_cost: 0, deposit_amount: 60, status: 'cancelled',
      comment: 'Отмена мероприятия #1 из 2. Задаток 60 руб по карте'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-14');
    totalBookings++; totalPayments++;

    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-14', start_time: '20:00', hours: 3,
      rental_cost: 0, deposit_amount: 60, status: 'cancelled',
      comment: 'Отмена мероприятия #2 из 2. Задаток 60 руб по карте'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-14');
    totalBookings++; totalPayments++;

    // 28 ноября: отмена, задаток 60 руб по карте
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-11-28', start_time: '18:00', hours: 3,
      rental_cost: 0, deposit_amount: 60, status: 'cancelled',
      comment: 'Отмена мероприятия. Задаток 60 руб по карте'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-11-28');
    totalBookings++; totalPayments++;

    console.log(`  Ноябрь: 10 мероприятий + 3 отмены`);

    // Расходы ноября
    await db.query(`INSERT INTO expenses (expense_date, category_id, amount, payment_method, comment, created_by) VALUES
      ('2025-11-08', $1, 56, 'cash', 'Свечи и пакетики к НГ', 1),
      ('2025-11-08', $1, 8, 'cash', 'Наклейки', 1),
      ('2025-11-08', $1, 11, 'cash', 'Стаканы для воды', 1),
      ('2025-11-14', $1, 8.5, 'cash', 'Печенье с предсказаниями в подарок', 1)
    `, [expCatSupply]);
    console.log('  Расходы ноября: 83.50 руб');

    // ═══════════════════════════════════════════════════════
    // ДЕКАБРЬ 2025
    // ═══════════════════════════════════════════════════════
    console.log('\n--- Декабрь 2025 ---');

    // 5 декабря (пт) | Аренда 240 | Посуда 25 | 4ч | 60 карта 205 нал | Итого 265
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-05', start_time: '18:00', hours: 4,
      rental_cost: 240, deposit_amount: 60, comment: 'Посуда 25 руб. Итого 265 руб. Карта 60, нал 205. Без продлений'
    });
    await insertAddon(db, bid, svcDishes, 25);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-05');
    await insertPayment(db, bid, 205, 'cash', 'additional', '2025-12-05');
    totalBookings++; totalPayments += 2;

    // 6 декабря (сб) | Аренда 240+60=300 | 4+1=5ч | 60 карта 240 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-06', start_time: '18:00', hours: 5,
      rental_cost: 300, deposit_amount: 60, comment: 'Аренда 240 руб + Продление 60 руб (1ч). Карта 60, нал 240'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-06');
    await insertPayment(db, bid, 240, 'cash', 'additional', '2025-12-06');
    totalBookings++; totalPayments += 2;

    // 12 декабря (пт) | Аренда 330 | Посуда 35 | 5ч | 60 карта 305 нал | Итого 365
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-12', start_time: '18:00', hours: 5,
      rental_cost: 330, deposit_amount: 60, comment: 'Посуда 35 руб. Итого 365 руб. Карта 60, нал 305. Без продлений'
    });
    await insertAddon(db, bid, svcDishes, 35);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-12');
    await insertPayment(db, bid, 305, 'cash', 'additional', '2025-12-12');
    totalBookings++; totalPayments += 2;

    // 13 декабря (сб) | Аренда 300+75=375 | Посуда 25 | 5+1=6ч | 60 карта 340 нал | Итого 400
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-13', start_time: '17:00', hours: 6,
      rental_cost: 375, deposit_amount: 60, comment: 'Аренда 300 руб + Продление 75 руб (1ч). Посуда 25 руб. Итого 400 руб. Карта 60, нал 340'
    });
    await insertAddon(db, bid, svcDishes, 25);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-13');
    await insertPayment(db, bid, 340, 'cash', 'additional', '2025-12-13');
    totalBookings++; totalPayments += 2;

    // 14 декабря утро (вс) | Аренда 240 | Посуда 64 | 4ч | 60 карта 244 нал | Итого 304
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-14', start_time: '10:00', hours: 4,
      rental_cost: 240, deposit_amount: 60, comment: 'Утреннее мероприятие. Посуда 64 руб. Итого 304 руб. Карта 60, нал 244. Без продлений'
    });
    await insertAddon(db, bid, svcDishes, 64);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-14');
    await insertPayment(db, bid, 244, 'cash', 'additional', '2025-12-14');
    totalBookings++; totalPayments += 2;

    // 18 декабря (чт) | Аренда 300 | Посуда 10 | Кальян 30 | 5ч | 80 карта 260 нал | Итого 340
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-18', start_time: '17:00', hours: 5,
      rental_cost: 300, deposit_amount: 0, comment: 'Посуда 10 руб, кальян 30 руб. Итого 340 руб. Карта 80, нал 260'
    });
    await insertAddon(db, bid, svcDishes, 10);
    await insertAddon(db, bid, svcHookah, 30);
    await insertPayment(db, bid, 80, 'card_transfer', 'deposit', '2025-12-18');
    await insertPayment(db, bid, 260, 'cash', 'additional', '2025-12-18');
    totalBookings++; totalPayments += 2;

    // 19 декабря (пт) | Аренда 280 | 4ч | 100 карта 180 нал | Итого 280
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-19', start_time: '18:00', hours: 4,
      rental_cost: 280, deposit_amount: 0, comment: 'Без посуды и декора. Карта 100, нал 180'
    });
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-19');
    await insertPayment(db, bid, 180, 'cash', 'additional', '2025-12-19');
    totalBookings++; totalPayments += 2;

    // 20 декабря (сб) | Аренда 570+90=660 | Декор/посуда 55 | 7+1=8ч | 100 карта 560 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-20', start_time: '16:00', hours: 8,
      rental_cost: 660, deposit_amount: 0,
      comment: 'Аренда 570 руб + Продление 90 руб (1ч). Декор и посуда 55 руб (в подарок). Карта 100, нал 560'
    });
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-20');
    await insertPayment(db, bid, 560, 'cash', 'additional', '2025-12-20');
    totalBookings++; totalPayments += 2;

    // 21 декабря день (вс) | Аренда 210 | Декор 15 | 3ч | 210 карта 15 нал | Итого 225
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-21', start_time: '12:00', hours: 3,
      rental_cost: 210, deposit_amount: 0, comment: 'Дневное мероприятие. Декор 15 руб. Итого 225 руб. Карта 210, нал 15. Без продлений'
    });
    await insertAddon(db, bid, svcDecor, 15);
    await insertPayment(db, bid, 210, 'card_transfer', 'deposit', '2025-12-21');
    await insertPayment(db, bid, 15, 'cash', 'additional', '2025-12-21');
    totalBookings++; totalPayments += 2;

    // 21 декабря вечер (вс) | Аренда 252 (скидка 10%) | 4ч | 100 карта 152 нал | Итого 252
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-21', start_time: '18:00', hours: 4,
      rental_cost: 252, deposit_amount: 0, comment: 'Вечернее мероприятие. Скидка 10% по промокоду. Без декора/посуды. Карта 100, нал 152'
    });
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-21');
    await insertPayment(db, bid, 152, 'cash', 'additional', '2025-12-21');
    totalBookings++; totalPayments += 2;

    // 22 декабря (пн) | Аренда 240 | Декор 15 | 4ч | 80 карта 175 нал | Итого 255
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-22', start_time: '18:00', hours: 4,
      rental_cost: 240, deposit_amount: 0, comment: 'Декор 15 руб. Итого 255 руб. Карта 80, нал 175. Без продлений'
    });
    await insertAddon(db, bid, svcDecor, 15);
    await insertPayment(db, bid, 80, 'card_transfer', 'deposit', '2025-12-22');
    await insertPayment(db, bid, 175, 'cash', 'additional', '2025-12-22');
    totalBookings++; totalPayments += 2;

    // 24 декабря (ср) | Аренда 570 | Посуда 30 | 7ч | 100 карта 500 нал | Итого 600
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-24', start_time: '16:00', hours: 7,
      rental_cost: 570, deposit_amount: 0, comment: 'Посуда 30 руб. Итого 600 руб. Карта 100, нал 500'
    });
    await insertAddon(db, bid, svcDishes, 30);
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-24');
    await insertPayment(db, bid, 500, 'cash', 'additional', '2025-12-24');
    totalBookings++; totalPayments += 2;

    // 26 декабря (пт) | Аренда 350 | 5ч | 135 карта 215 нал | Итого 350
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-26', start_time: '17:00', hours: 5,
      rental_cost: 350, deposit_amount: 0, comment: 'Без доп.услуг. Карта 135, нал 215. Без продлений'
    });
    await insertPayment(db, bid, 135, 'card_transfer', 'deposit', '2025-12-26');
    await insertPayment(db, bid, 215, 'cash', 'additional', '2025-12-26');
    totalBookings++; totalPayments += 2;

    // 27 декабря вечер (сб) | Аренда base 350 + ext ≈180 = 530 | Посуда 34 | Кальян 80 | 5+2=7ч
    // Итого: 100 карта 544 нал = 644
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-27', start_time: '17:00', hours: 7,
      rental_cost: 530, deposit_amount: 0,
      comment: 'Аренда 350 руб + Продление ~180 руб (2ч). Посуда 34 руб, кальян 80 руб. Итого 644 руб. Карта 100, нал 544'
    });
    await insertAddon(db, bid, svcDishes, 34);
    await insertAddon(db, bid, svcHookah, 80);
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-27');
    await insertPayment(db, bid, 544, 'cash', 'additional', '2025-12-27');
    totalBookings++; totalPayments += 2;

    // 28 декабря (вс) | Аренда base 420 + ext ≈80 = 500 | Мафия 100 | Кейтеринг 140 | 6+1=7ч
    // Итого: 100 карта 640 нал = 740
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-28', start_time: '16:00', hours: 7,
      rental_cost: 500, deposit_amount: 0,
      comment: 'Аренда 420 руб + Продление ~80 руб (1ч). Мафия 100 руб, кейтеринг 140 руб. Итого 740 руб. Карта 100, нал 640'
    });
    await insertAddon(db, bid, svcMafia, 100);
    await insertAddon(db, bid, svcCatering, 140);
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-28');
    await insertPayment(db, bid, 640, 'cash', 'additional', '2025-12-28');
    totalBookings++; totalPayments += 2;

    // 29 декабря (пн) | Аренда 420 | Посуда/декор 70 | 4+2=6ч | 100 карта 390 нал | Итого 490
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-29', start_time: '18:00', hours: 6,
      rental_cost: 420, deposit_amount: 0,
      comment: 'Посуда и декор 70 руб. 4ч основное + 2ч продление. Итого 490 руб. Карта 100, нал 390'
    });
    await insertAddon(db, bid, svcDishDecor, 70);
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-29');
    await insertPayment(db, bid, 390, 'cash', 'additional', '2025-12-29');
    totalBookings++; totalPayments += 2;

    // 30 декабря (вт) | Аренда 350 | Мафия 100 | 5ч | 100 карта 350 нал | Итого 450
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-30', start_time: '17:00', hours: 5,
      rental_cost: 350, deposit_amount: 0,
      comment: 'Мафия 100 руб. Итого 450 руб. Карта 100, нал 350'
    });
    await insertAddon(db, bid, svcMafia, 100);
    await insertPayment(db, bid, 100, 'card_transfer', 'deposit', '2025-12-30');
    await insertPayment(db, bid, 350, 'cash', 'additional', '2025-12-30');
    totalBookings++; totalPayments += 2;

    // 31 декабря (ср) | Аренда 300 | 3ч | Наличные
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-31', start_time: '12:00', hours: 3,
      rental_cost: 300, deposit_amount: 0, comment: 'Наличными'
    });
    await insertPayment(db, bid, 300, 'cash', 'additional', '2025-12-31');
    totalBookings++; totalPayments++;

    // Катарина декабрь: 500 руб (сводная)
    bid = await insertBooking(db, {
      client_id: KATARINA, booking_date: '2025-12-15', start_time: '16:00', hours: 12,
      rental_cost: 500, deposit_amount: 0, event_type: 'Занятие',
      comment: 'Катарина — сводная запись за декабрь 2025. Итого 500 руб'
    });
    await insertPayment(db, bid, 500, 'cash', 'additional', '2025-12-06');
    totalBookings++; totalPayments++;
    console.log('  Катарина декабрь: 500 руб (сводная)');

    // Декабрь: отмены
    // 14 декабря вечер: задаток 60 по карте
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-14', start_time: '18:00', hours: 3,
      rental_cost: 0, deposit_amount: 60, status: 'cancelled',
      comment: 'Отмена вечернего мероприятия. Задаток 60 руб по карте'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2025-12-12');
    totalBookings++; totalPayments++;

    // 27 декабря: задаток 100
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-27', start_time: '12:00', hours: 3,
      rental_cost: 0, deposit_amount: 100, status: 'cancelled',
      comment: 'Отмена одного мероприятия. Задаток 100 руб'
    });
    await insertPayment(db, bid, 100, 'cash', 'deposit', '2025-12-26');
    totalBookings++; totalPayments++;

    // 29,30,31 декабря утро: 3 отмены одного клиента, задаток 100 руб общий
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-29', start_time: '10:00', hours: 3,
      rental_cost: 0, deposit_amount: 100, status: 'cancelled',
      comment: 'Отмена утреннего мероприятия (часть группы: 29,30,31 дек утро одного клиента). Общий задаток 100 руб'
    });
    await insertPayment(db, bid, 100, 'cash', 'deposit', '2025-12-26');
    totalBookings++; totalPayments++;

    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-30', start_time: '10:00', hours: 3,
      rental_cost: 0, deposit_amount: 0, status: 'cancelled',
      comment: 'Отмена утреннего мероприятия (часть группы: 29,30,31 дек). Задаток учтён в бронировании 29 дек'
    });
    totalBookings++;

    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2025-12-31', start_time: '10:00', hours: 3,
      rental_cost: 0, deposit_amount: 0, status: 'cancelled',
      comment: 'Отмена утреннего мероприятия (часть группы: 29,30,31 дек). Задаток учтён в бронировании 29 дек'
    });
    totalBookings++;

    console.log(`  Декабрь: 19 мероприятий + 5 отмен`);

    // ═══════════════════════════════════════════════════════
    // ЯНВАРЬ 2026
    // ═══════════════════════════════════════════════════════
    console.log('\n--- Январь 2026 ---');

    // 11 января (вс) | Аренда 300 | Посуда/декор 45 | 5ч | 60 карта 285 нал | Итого 345
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2026-01-11', start_time: '17:00', hours: 5,
      rental_cost: 300, deposit_amount: 60, comment: 'Посуда и декор 45 руб. Итого 345 руб. Карта 60, нал 285'
    });
    await insertAddon(db, bid, svcDishDecor, 45);
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2026-01-11');
    await insertPayment(db, bid, 285, 'cash', 'additional', '2026-01-11');
    totalBookings++; totalPayments += 2;

    // 17 января (сб) | Аренда 360 | 6ч | 60 карта 300 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2026-01-17', start_time: '17:00', hours: 6,
      rental_cost: 360, deposit_amount: 60, comment: 'Карта 60, нал 300. Без допов и продлений'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2026-01-17');
    await insertPayment(db, bid, 300, 'cash', 'additional', '2026-01-17');
    totalBookings++; totalPayments += 2;

    // 22 января (чт) | Аренда 180 | 4ч | 50 карта 130 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2026-01-22', start_time: '18:00', hours: 4,
      rental_cost: 180, deposit_amount: 50, comment: 'Без продлений и доп. услуг. Карта 50, нал 130'
    });
    await insertPayment(db, bid, 50, 'card_transfer', 'deposit', '2026-01-22');
    await insertPayment(db, bid, 130, 'cash', 'additional', '2026-01-22');
    totalBookings++; totalPayments += 2;

    // 25 января (вс) | Аренда 180 | 3ч | Всё по карте
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2026-01-25', start_time: '18:00', hours: 3,
      rental_cost: 180, deposit_amount: 0, comment: 'Без допов. Вся оплата по карте'
    });
    await insertPayment(db, bid, 180, 'card_transfer', 'additional', '2026-01-25');
    totalBookings++; totalPayments++;

    // 30 января (пт) | Аренда 300 | 5ч | 60 карта 240 нал
    bid = await insertBooking(db, {
      client_id: GUEST, booking_date: '2026-01-30', start_time: '17:00', hours: 5,
      rental_cost: 300, deposit_amount: 60, comment: 'Карта 60, нал 240'
    });
    await insertPayment(db, bid, 60, 'card_transfer', 'deposit', '2026-01-30');
    await insertPayment(db, bid, 240, 'cash', 'additional', '2026-01-30');
    totalBookings++; totalPayments += 2;

    // Катарина январь: 340 руб (8 часов) + 45 руб допол.
    bid = await insertBooking(db, {
      client_id: KATARINA, booking_date: '2026-01-15', start_time: '16:00', hours: 8,
      rental_cost: 340, deposit_amount: 0, event_type: 'Занятие',
      comment: 'Катарина — сводная запись за январь 2026. 8 часов за месяц. 340 руб + 45 руб дополнительно = 385 руб. Наличные'
    });
    await insertPayment(db, bid, 340, 'cash', 'additional', '2026-01-11');
    await insertPayment(db, bid, 45, 'cash', 'additional', '2026-01-25');
    totalBookings++; totalPayments += 2;
    console.log('  Катарина январь: 385 руб (сводная)');

    // Расход января: доставка ключа 19 руб
    await db.query(`INSERT INTO expenses (expense_date, category_id, amount, payment_method, comment, created_by) VALUES
      ('2026-01-24', $1, 19, 'cash', 'Доставка ключа', 1)
    `, [expCatDeliv]);

    console.log(`  Январь: 6 мероприятий`);

    // ═══════════════════════════════════════════════════════
    // ФЕВРАЛЬ 2026 — обновление существующих броней
    // ═══════════════════════════════════════════════════════
    console.log('\n--- Февраль 2026 ---');

    // Находим существующие февральские брони по дате
    const febData = [
      { date: '2026-02-13', rental_cost: 180, hours: 3, card: 60, cash: 120,
        comment: 'Аренда 180 руб. 60 по карте, 120 наличными. Основное время 3 часа' },
      { date: '2026-02-14', rental_cost: 240, hours: 4, card: 60, cash: 180,
        comment: 'Аренда 240 руб. 60 по карте, 180 наличными. Основное время 4 часа' },
      { date: '2026-02-19', rental_cost: 135, hours: 3, card: 50, cash: 85,
        comment: 'Аренда 135 руб. 50 по карте, 85 наличными. Основное время 3 часа' },
      { date: '2026-02-21', rental_cost: 360, hours: 6, card: 60, cash: 390, extras: 90,
        comment: 'Аренда 360 руб. Посуда и декор 90 руб. Итого 450 руб. 60 по карте, 390 наличными. 6 часов, без продлений' },
    ];

    for (const feb of febData) {
      // Найти бронь по дате (не Катарина и не overnight — берём первую подходящую)
      const existing = await db.query(`
        SELECT id FROM bookings WHERE booking_date = $1 AND status != 'cancelled'
          AND client_id != $2 AND id <= 27
        ORDER BY id LIMIT 1
      `, [feb.date, KATARINA]);

      if (existing.rows.length > 0) {
        const bookingId = existing.rows[0].id;

        // Обновляем статус и комментарий
        await db.query(`
          UPDATE bookings SET status = 'completed', comment = $1, updated_at = NOW()
          WHERE id = $2
        `, [feb.comment, bookingId]);

        // Добавляем платежи
        if (feb.card > 0) {
          await insertPayment(db, bookingId, feb.card, 'card_transfer', 'deposit', feb.date);
          totalPayments++;
        }
        if (feb.cash > 0) {
          await insertPayment(db, bookingId, feb.cash, 'cash', 'additional', feb.date);
          totalPayments++;
        }

        // Добавляем доп. услуги для 21 февраля
        if (feb.extras) {
          await insertAddon(db, bookingId, svcDishDecor, feb.extras);
        }

        console.log(`  Обновлена бронь ID ${bookingId} (${feb.date}): статус=completed, платежи добавлены`);
      } else {
        console.log(`  ⚠ Бронь не найдена для даты ${feb.date}`);
      }
    }

    // Расход февраля: помпа 25 руб
    await db.query(`INSERT INTO expenses (expense_date, category_id, amount, payment_method, comment, created_by) VALUES
      ('2026-02-05', $1, 25, 'cash', 'Помпа для воды', 1)
    `, [expCatEquip]);

    await db.query('COMMIT');

    // ═══════════════════════════════════════════════════════
    // ИТОГИ
    // ═══════════════════════════════════════════════════════
    console.log('\n========================================');
    console.log(`Всего создано бронирований: ${totalBookings}`);
    console.log(`Всего создано платежей: ${totalPayments}`);

    // Статистика по месяцам
    const stats = await pool.query(`
      SELECT
        TO_CHAR(booking_date, 'YYYY-MM') as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(rental_cost) FILTER (WHERE status != 'cancelled'), 0) as rental_income,
        COALESCE(SUM(deposit_amount) FILTER (WHERE status = 'cancelled'), 0) as cancel_deposits
      FROM bookings
      WHERE is_archived = 0
      GROUP BY TO_CHAR(booking_date, 'YYYY-MM')
      ORDER BY month
    `);
    console.log('\nСтатистика по месяцам:');
    console.log('─────────────────────────────────────────────');
    for (const row of stats.rows) {
      console.log(`${row.month}: ${row.completed} мероп. + ${row.cancelled} отмен | Аренда: ${row.rental_income} руб | Задатки отмен: ${row.cancel_deposits} руб`);
    }

    // Общая выручка с учётом допов
    const revenue = await pool.query(`
      SELECT
        TO_CHAR(b.booking_date, 'YYYY-MM') as month,
        COALESCE(SUM(p.amount), 0) as total_payments
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.is_archived = 0
      GROUP BY TO_CHAR(b.booking_date, 'YYYY-MM')
      ORDER BY month
    `);
    console.log('\nОбщие поступления (аренда + допы + задатки):');
    console.log('─────────────────────────────────────────────');
    let grandTotal = 0;
    for (const row of revenue.rows) {
      console.log(`${row.month}: ${row.total_payments} руб`);
      grandTotal += parseFloat(row.total_payments);
    }
    console.log(`─────────────────────────────────────────────`);
    console.log(`ИТОГО: ${grandTotal} руб`);

    // Расходы
    const expStats = await pool.query(`
      SELECT
        TO_CHAR(expense_date, 'YYYY-MM') as month,
        SUM(amount) as total
      FROM expenses
      WHERE is_archived = 0
      GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
      ORDER BY month
    `);
    console.log('\nРасходы по месяцам:');
    let totalExp = 0;
    for (const row of expStats.rows) {
      console.log(`${row.month}: ${row.total} руб`);
      totalExp += parseFloat(row.total);
    }
    console.log(`ИТОГО расходы: ${totalExp} руб`);
    console.log(`\nЧистая прибыль (оценка): ${grandTotal - totalExp} руб`);
    console.log('========================================');

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('ОШИБКА:', err);
  } finally {
    db.release();
    await pool.end();
  }
}

main();

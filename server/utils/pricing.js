/**
 * Тарифы Эйфория Room
 *
 * Будние дни (пн-чт):
 *   09:00–16:00  — 35 руб/час
 *   16:00–23:00  — 45 руб/час
 *   23:00–09:00  — 60 руб/час
 *
 * Выходные (пт-вс):
 *   09:00–23:00  — 60 руб/час
 *   23:00–09:00  — 75 руб/час
 *
 * Минимум бронирования: 3 часа
 * 30 минут до и после мероприятия в подарок
 */

/**
 * Безопасно извлечь строку даты "YYYY-MM-DD" из любого формата
 * (строка ISO, Date объект из pg, и т.д.)
 */
function toDateString(d) {
  if (!d) return null;
  if (d instanceof Date) {
    // Используем getFullYear/getMonth/getDate (local timezone), НЕ toISOString (UTC)
    // pg возвращает Date объект в local timezone, toISOString сдвигает на UTC
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof d === 'string') return d.split('T')[0];
  return String(d).split('T')[0];
}

function getDayType(dateInput) {
  const clean = toDateString(dateInput);
  const date = new Date(clean + 'T12:00:00');
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Выходные: пятница(5), суббота(6), воскресенье(0)
  return (day === 0 || day === 5 || day === 6) ? 'weekend' : 'weekday';
}

function getDayTypeLabel(dayType) {
  return dayType === 'weekend' ? 'Выходной' : 'Будний';
}

/**
 * Рассчитать стоимость аренды с учётом тарифных зон
 * @param {string} booking_date  "2026-02-14"
 * @param {string} start_time    "19:00"
 * @param {string} end_time      "23:00"
 * @returns {{ hours, rental_cost, hourly_rate, day_type, breakdown[] }}
 */
function calculatePrice(booking_date, start_time, end_time) {
  const dayType = getDayType(booking_date);

  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);

  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 1440; // ночное мероприятие через полночь

  const hours = (endMin - startMin) / 60;

  // Тарифные зоны (с расширением для ночных мероприятий до 09:00 следующего дня)
  const bands = dayType === 'weekday'
    ? [
        { start: 0,    end: 540,  rate: 60, label: 'Ночь (00:00–09:00)' },
        { start: 540,  end: 960,  rate: 35, label: 'День (09:00–16:00)' },
        { start: 960,  end: 1380, rate: 45, label: 'Вечер (16:00–23:00)' },
        { start: 1380, end: 1980, rate: 60, label: 'Ночь (23:00–09:00)' },
      ]
    : [
        { start: 0,    end: 540,  rate: 75, label: 'Ночь (00:00–09:00)' },
        { start: 540,  end: 1380, rate: 60, label: 'День (09:00–23:00)' },
        { start: 1380, end: 1980, rate: 75, label: 'Ночь (23:00–09:00)' },
      ];

  let rental_cost = 0;
  let pos = startMin;
  const breakdown = [];

  for (const band of bands) {
    if (pos >= endMin) break;
    if (pos >= band.end || endMin <= band.start) continue;

    const segStart = Math.max(pos, band.start);
    const segEnd = Math.min(endMin, band.end);
    const segHours = (segEnd - segStart) / 60;

    if (segHours > 0) {
      rental_cost += segHours * band.rate;
      breakdown.push({
        hours: Math.round(segHours * 100) / 100,
        rate: band.rate,
        subtotal: Math.round(segHours * band.rate * 100) / 100,
        label: band.label,
      });
      pos = segEnd;
    }
  }

  rental_cost = Math.round(rental_cost * 100) / 100;
  const effective_rate = hours > 0 ? Math.round((rental_cost / hours) * 100) / 100 : 0;

  return {
    hours,
    rental_cost,
    hourly_rate: effective_rate,
    total_amount: rental_cost,
    day_type: dayType,
    day_type_label: getDayTypeLabel(dayType),
    breakdown,
  };
}

/**
 * Получить ставку для первого часа (для расчёта задатка по умолчанию)
 */
function getFirstHourRate(booking_date, start_time) {
  const dayType = getDayType(booking_date);
  const [sh, sm] = start_time.split(':').map(Number);
  const minuteOfDay = sh * 60 + sm;

  if (dayType === 'weekday') {
    if (minuteOfDay >= 540 && minuteOfDay < 960) return 35;
    if (minuteOfDay >= 960 && minuteOfDay < 1380) return 45;
    return 60;
  } else {
    if (minuteOfDay >= 540 && minuteOfDay < 1380) return 60;
    return 75;
  }
}

module.exports = { calculatePrice, getDayType, getDayTypeLabel, getFirstHourRate, toDateString };

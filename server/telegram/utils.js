/**
 * Telegram bot utilities: formatting, labels, helpers
 */

const BOOKING_STATUS_LABELS = {
  preliminary: 'Предварительная',
  no_deposit: 'Без предоплаты',
  deposit_paid: 'Предоплата внесена',
  fully_paid: 'Полностью оплачена',
  completed: 'Завершена',
  cancelled: 'Отменена',
  rescheduled: 'Перенесена',
};

const BOOKING_STATUS_EMOJI = {
  preliminary: '📋',
  no_deposit: '⚠️',
  deposit_paid: '💰',
  fully_paid: '✅',
  completed: '🏁',
  cancelled: '❌',
  rescheduled: '🔄',
};

const SOURCE_LABELS = {
  instagram: 'Instagram',
  website: 'Сайт',
  telegram: 'Telegram',
  relax: 'Relax.by',
  '2gis': '2ГИС',
  yandex: 'Яндекс',
  recommendation: 'Рекомендация',
  other: 'Другое',
};

const TASK_TYPE_LABELS = {
  deposit_reminder: 'Напомнить предоплату',
  payment_reminder: 'Напомнить оплату',
  addons_discuss: 'Обсудить допы',
  review_request: 'Запросить отзыв',
  other: 'Другое',
};

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDateTg(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatDateFullTg(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return Number(amount).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Get today string in Minsk timezone
function todayMinsk() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Minsk' });
}

// Get N days from today
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Minsk' });
}

module.exports = {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_EMOJI,
  SOURCE_LABELS,
  TASK_TYPE_LABELS,
  DAY_NAMES,
  MONTH_NAMES,
  formatDateTg,
  formatDateFullTg,
  formatMoney,
  escapeHtml,
  todayMinsk,
  daysFromNow,
};

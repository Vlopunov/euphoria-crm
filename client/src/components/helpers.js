// Shared helpers and constants

export const SOURCE_OPTIONS = [
  { value: '', label: 'Все источники' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'website', label: 'Сайт' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'relax', label: 'Relax' },
  { value: '2gis', label: '2ГИС' },
  { value: 'yandex', label: 'Яндекс' },
  { value: 'recommendation', label: 'Рекомендация' },
  { value: 'other', label: 'Другое' },
];

export const SOURCE_LABELS = {
  instagram: 'Instagram',
  website: 'Сайт',
  telegram: 'Telegram',
  relax: 'Relax',
  '2gis': '2ГИС',
  yandex: 'Яндекс',
  recommendation: 'Рекомендация',
  other: 'Другое',
};

export const LEAD_STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новый лид' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'proposal_sent', label: 'Отправлено предложение' },
  { value: 'waiting_response', label: 'Ожидаем ответ' },
  { value: 'confirmed', label: 'Подтверждено' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'no_response', label: 'Не отвечает' },
];

export const LEAD_STATUS_LABELS = {
  new: { label: 'Новый лид', color: 'blue' },
  in_progress: { label: 'В работе', color: 'yellow' },
  proposal_sent: { label: 'Предложение', color: 'purple' },
  waiting_response: { label: 'Ожидаем ответ', color: 'orange' },
  confirmed: { label: 'Подтверждено', color: 'green' },
  rejected: { label: 'Отказ', color: 'red' },
  no_response: { label: 'Не отвечает', color: 'gray' },
};

export const BOOKING_STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'preliminary', label: 'Предварительная' },
  { value: 'no_deposit', label: 'Без предоплаты' },
  { value: 'deposit_paid', label: 'Предоплата внесена' },
  { value: 'fully_paid', label: 'Полностью оплачено' },
  { value: 'completed', label: 'Проведено' },
  { value: 'cancelled', label: 'Отменено' },
  { value: 'rescheduled', label: 'Перенос' },
];

export const BOOKING_STATUS_LABELS = {
  preliminary: { label: 'Предварительная', color: 'gray' },
  no_deposit: { label: 'Без предоплаты', color: 'yellow' },
  deposit_paid: { label: 'Предоплата', color: 'blue' },
  fully_paid: { label: 'Оплачено', color: 'green' },
  completed: { label: 'Проведено', color: 'green' },
  cancelled: { label: 'Отменено', color: 'red' },
  rescheduled: { label: 'Перенос', color: 'purple' },
};

export const PAYMENT_TYPE_LABELS = {
  deposit: 'Предоплата',
  additional: 'Доплата',
  addons: 'Оплата допов',
  other: 'Прочее',
};

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card_transfer', label: 'Перевод на карту' },
  { value: 'erip', label: 'ЕРИП' },
  { value: 'bank_account', label: 'Расчётный счёт' },
];

export const PAYMENT_METHOD_LABELS = {
  cash: 'Наличные',
  card_transfer: 'Карта',
  erip: 'ЕРИП',
  bank_account: 'Р/С',
};

export const EVENT_TYPES = [
  'День рождения', 'Вечеринка', 'Девичник', 'Корпоратив',
  'Мастер-класс', 'Детский праздник', 'Фотосессия', 'Другое',
];

export const TASK_TYPE_LABELS = {
  deposit_reminder: 'Предоплата',
  payment_reminder: 'Оплата',
  addons_discuss: 'Допы',
  review_request: 'Отзыв',
  other: 'Другое',
};

export function formatMoney(v) {
  if (v == null) return '0';
  return Number(v).toFixed(2).replace(/\.00$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDate(d) {
  if (!d) return '—';
  // Поддержка и "2026-02-01" и "2026-02-01T00:00:00.000Z"
  const dateStr = typeof d === 'string' ? d.split('T')[0] : d;
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(d) {
  if (!d) return '—';
  const dateStr = typeof d === 'string' ? d.split('T')[0] : d;
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function toLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isToday(d) {
  const dateStr = typeof d === 'string' ? d.split('T')[0] : d;
  return dateStr === toLocalDateStr();
}

export function isTomorrow(d) {
  const dateStr = typeof d === 'string' ? d.split('T')[0] : d;
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return dateStr === toLocalDateStr(t);
}

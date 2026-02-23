import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Select, Input, Modal, Badge, EmptyState, Loader } from '../components/UI';
import {
  BOOKING_STATUS_OPTIONS,
  BOOKING_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  formatDate,
  formatMoney,
} from '../components/helpers';
import { ArrowLeft, Plus, Trash2, CreditCard, Package, CheckCircle, Clock, Users as UsersIcon, Edit } from 'lucide-react';

const PAYMENT_TYPE_OPTIONS = [
  { value: 'deposit', label: 'Предоплата' },
  { value: 'additional', label: 'Доплата' },
  { value: 'addons', label: 'Оплата допов' },
  { value: 'other', label: 'Прочее' },
];

const STATUS_UPDATE_OPTIONS = BOOKING_STATUS_OPTIONS.filter(o => o.value !== '');

const EMPTY_ADDON_FORM = { service_id: '', quantity: 1, sale_price: '', cost_price: '' };
const EMPTY_PAYMENT_FORM = { amount: '', payment_type: 'deposit', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], comment: '' };
const EMPTY_TASK_FORM = { title: '', due_date: '', booking_id: '' };

export default function BookingDetail() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Модалки
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Формы
  const [addonForm, setAddonForm] = useState(EMPTY_ADDON_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);

  // Справочники
  const [addonServices, setAddonServices] = useState([]);

  // Состояния сохранения
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchBooking = async () => {
    try {
      setLoading(true);
      const data = await api.getBooking(id);
      setBooking(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAddonServices = async () => {
    try {
      const data = await api.getAddonServices();
      setAddonServices(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBooking();
    fetchAddonServices();
  }, [id]);

  // --- Обработчики статуса ---
  const handleStatusChange = async (newStatus) => {
    try {
      await api.updateBooking(id, { status: newStatus });
      fetchBooking();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Допы ---
  const openAddonModal = () => {
    setAddonForm(EMPTY_ADDON_FORM);
    setFormError('');
    setAddonModalOpen(true);
  };

  const handleAddonServiceChange = (serviceId) => {
    const service = addonServices.find(s => String(s.id) === String(serviceId));
    setAddonForm(prev => ({
      ...prev,
      service_id: serviceId,
      sale_price: service?.price || '',
      cost_price: service?.cost_price || '',
    }));
  };

  const handleSaveAddon = async (e) => {
    e.preventDefault();
    if (!addonForm.service_id) {
      setFormError('Выберите услугу');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.addBookingAddon(id, {
        service_id: Number(addonForm.service_id),
        quantity: Number(addonForm.quantity) || 1,
        sale_price: Number(addonForm.sale_price) || 0,
        cost_price: Number(addonForm.cost_price) || 0,
      });
      setAddonModalOpen(false);
      fetchBooking();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddon = async (addonId) => {
    if (!confirm('Удалить доп. услугу?')) return;
    try {
      await api.deleteBookingAddon(addonId);
      fetchBooking();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Платежи ---
  const openPaymentModal = (prefillType) => {
    const form = {
      ...EMPTY_PAYMENT_FORM,
      payment_date: new Date().toISOString().split('T')[0],
    };
    if (prefillType === 'deposit' && booking) {
      form.payment_type = 'deposit';
      form.amount = booking.deposit_amount || '';
    }
    setPaymentForm(form);
    setFormError('');
    setPaymentModalOpen(true);
  };

  const handlePaymentTypeChange = (type) => {
    setPaymentForm(prev => {
      const updated = { ...prev, payment_type: type };
      if (type === 'deposit' && booking) {
        updated.amount = booking.deposit_amount || '';
      }
      return updated;
    });
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      setFormError('Укажите сумму');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.createPayment({
        booking_id: Number(id),
        amount: Number(paymentForm.amount),
        payment_type: paymentForm.payment_type,
        payment_method: paymentForm.payment_method,
        payment_date: paymentForm.payment_date,
        comment: paymentForm.comment,
      });
      setPaymentModalOpen(false);
      fetchBooking();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!confirm('Удалить платёж?')) return;
    try {
      await api.deletePayment(paymentId);
      fetchBooking();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Задачи ---
  const openTaskModal = () => {
    setTaskForm({ ...EMPTY_TASK_FORM, booking_id: id });
    setFormError('');
    setTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      setFormError('Введите название задачи');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await api.createTask({
        title: taskForm.title,
        due_date: taskForm.due_date || null,
        booking_id: Number(id),
      });
      setTaskModalOpen(false);
      fetchBooking();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await api.updateTask(task.id, { is_completed: task.is_completed ? 0 : 1 });
      fetchBooking();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Хелперы ---
  const getStatusBadge = (status) => {
    const info = BOOKING_STATUS_LABELS[status];
    if (!info) return <Badge color="gray">{status}</Badge>;
    return <Badge color={info.color}>{info.label}</Badge>;
  };

  const addonServiceOptions = [
    { value: '', label: 'Выберите услугу' },
    ...addonServices.map(s => ({ value: String(s.id), label: `${s.name} (${formatMoney(s.price)} BYN)` })),
  ];

  // --- Рендер ---
  if (loading) return <Loader />;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error}</p>
      <Link to="/bookings">
        <Button variant="secondary"><ArrowLeft size={16} /> Назад к бронированиям</Button>
      </Link>
    </div>
  );
  if (!booking) return null;

  const b = booking;
  const remaining = Number(b.remaining || 0);
  const addons = b.addons || [];
  const payments = b.payments || [];
  const tasks = b.tasks || [];

  const addonsSum = addons.reduce((acc, a) => acc + (Number(a.sale_price) * Number(a.quantity)), 0);
  const paymentsSum = payments.reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <div>
      {/* Шапка */}
      <div className="mb-6">
        <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors mb-3">
          <ArrowLeft size={16} />
          Все бронирования
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              {formatDate(b.booking_date)}, {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
            </h1>
            {getStatusBadge(b.status)}
          </div>
          <Select
            options={STATUS_UPDATE_OPTIONS}
            value={b.status}
            onChange={e => handleStatusChange(e.target.value)}
            className="sm:w-52"
          />
        </div>
      </div>

      {/* Финансовая сводка */}
      <Card className="p-5 md:p-6 mb-6 border-2 border-primary-100 bg-gradient-to-br from-white to-primary-50/30">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={20} className="text-primary-600" />
          <h2 className="text-lg font-bold text-gray-900">Финансы</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Стоимость аренды</p>
            <p className="text-lg font-semibold text-gray-800">{formatMoney(b.rental_cost)} <span className="text-sm font-normal text-gray-400">BYN</span></p>
            <p className="text-xs text-gray-400">{b.hours || '—'} ч. x {formatMoney(b.hourly_rate)} BYN</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Стоимость допов</p>
            <p className="text-lg font-semibold text-gray-800">{formatMoney(b.addons_total)} <span className="text-sm font-normal text-gray-400">BYN</span></p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-xs text-gray-500 mb-0.5">ИТОГО</p>
            <p className="text-2xl font-bold text-gray-900">{formatMoney(b.grand_total)} <span className="text-sm font-normal text-gray-400">BYN</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Оплачено</p>
            <p className="text-lg font-semibold text-green-600">{formatMoney(b.total_paid)} <span className="text-sm font-normal text-green-400">BYN</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Остаток</p>
            <p className={`text-lg font-semibold ${remaining > 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {formatMoney(remaining)} <span className={`text-sm font-normal ${remaining > 0 ? 'text-red-400' : 'text-gray-400'}`}>BYN</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Рекомендуемый задаток</p>
            <p className="text-lg font-semibold text-gray-600">{formatMoney(b.deposit_amount)} <span className="text-sm font-normal text-gray-400">BYN</span></p>
            <p className="text-xs text-gray-400">= 1 час аренды</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Информация о клиенте */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <UsersIcon size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Клиент</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500">Имя</p>
              {b.client_id ? (
                <Link to={`/clients/${b.client_id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                  {b.client?.name}
                </Link>
              ) : (
                <p className="text-sm text-gray-700">{b.client?.name || '—'}</p>
              )}
            </div>
            {b.client?.phone && (
              <div>
                <p className="text-xs text-gray-500">Телефон</p>
                <p className="text-sm text-gray-700">{b.client?.phone}</p>
              </div>
            )}
            {b.client?.telegram && (
              <div>
                <p className="text-xs text-gray-500">Telegram</p>
                <p className="text-sm text-gray-700">{b.client?.telegram}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Детали мероприятия */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Детали</h3>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500">Тип мероприятия</p>
              <p className="text-sm text-gray-700">{b.event_type || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Гостей</p>
              <p className="text-sm text-gray-700">{b.guest_count || '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500">Часов</p>
                <p className="text-sm text-gray-700">{b.hours || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ставка/час</p>
                <p className="text-sm text-gray-700">{b.hourly_rate ? `${formatMoney(b.hourly_rate)} BYN` : '—'}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Комментарий */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Edit size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Комментарий</h3>
          </div>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{b.comment || 'Нет комментария'}</p>
        </Card>
      </div>

      {/* Доп. услуги */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Доп. услуги</h3>
            {addons.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{addons.length}</span>
            )}
          </div>
          <Button size="sm" onClick={openAddonModal}>
            <Plus size={14} />
            Добавить доп
          </Button>
        </div>

        {addons.length === 0 ? (
          <EmptyState message="Доп. услуги не добавлены" />
        ) : (
          <>
            {/* Таблица десктоп */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Услуга</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Категория</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-600">Кол-во</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Цена</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Себест.</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Сумма</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Маржа</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {addons.map(addon => {
                    const sum = Number(addon.sale_price) * Number(addon.quantity);
                    const costSum = Number(addon.cost_price) * Number(addon.quantity);
                    const margin = sum - costSum;
                    return (
                      <tr key={addon.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{addon.service_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{addon.category_name || '—'}</td>
                        <td className="px-4 py-2.5 text-center text-gray-700">{addon.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{formatMoney(addon.sale_price)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{formatMoney(addon.cost_price)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatMoney(sum)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatMoney(margin)}
                        </td>
                        <td className="px-2 py-2.5">
                          <button onClick={() => handleDeleteAddon(addon.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-medium">
                    <td colSpan={5} className="px-4 py-2.5 text-right text-gray-600">Итого допы:</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{formatMoney(addonsSum)}</td>
                    <td className="px-4 py-2.5 text-right text-green-600">
                      {formatMoney(addons.reduce((acc, a) => acc + (Number(a.sale_price) - Number(a.cost_price)) * Number(a.quantity), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Карточки мобильные */}
            <div className="md:hidden p-4 space-y-3">
              {addons.map(addon => {
                const sum = Number(addon.sale_price) * Number(addon.quantity);
                const costSum = Number(addon.cost_price) * Number(addon.quantity);
                const margin = sum - costSum;
                return (
                  <div key={addon.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{addon.service_name}</p>
                      <p className="text-xs text-gray-400">{addon.category_name || '—'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {addon.quantity} шт. x {formatMoney(addon.sale_price)} = <span className="font-medium text-gray-700">{formatMoney(sum)} BYN</span>
                      </p>
                      <p className={`text-xs mt-0.5 ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Маржа: {formatMoney(margin)} BYN
                      </p>
                    </div>
                    <button onClick={() => handleDeleteAddon(addon.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              <div className="text-right text-sm font-medium text-gray-700 pt-2 border-t border-gray-200">
                Итого: {formatMoney(addonsSum)} BYN
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Платежи */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Платежи</h3>
            {payments.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{payments.length}</span>
            )}
          </div>
          <Button size="sm" onClick={() => openPaymentModal()}>
            <Plus size={14} />
            Добавить платёж
          </Button>
        </div>

        {payments.length === 0 ? (
          <EmptyState message="Платежей нет" />
        ) : (
          <>
            {/* Таблица десктоп */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Дата</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Сумма</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Тип</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Способ</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Комментарий</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-600">{formatMoney(p.amount)} BYN</td>
                      <td className="px-4 py-2.5 text-gray-600">{PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}</td>
                      <td className="px-4 py-2.5 text-gray-600">{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                      <td className="px-4 py-2.5 text-gray-400 truncate max-w-[200px]">{p.comment || '—'}</td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => handleDeletePayment(p.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="px-4 py-2.5 text-right text-gray-600">Итого:</td>
                    <td className="px-4 py-2.5 text-right text-green-600">{formatMoney(paymentsSum)} BYN</td>
                    <td colSpan={4}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Карточки мобильные */}
            <div className="md:hidden p-4 space-y-3">
              {payments.map(p => (
                <div key={p.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-600">{formatMoney(p.amount)} BYN</span>
                      <Badge color="blue">{PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                    </p>
                    {p.comment && <p className="text-xs text-gray-400 mt-0.5">{p.comment}</p>}
                  </div>
                  <button onClick={() => handleDeletePayment(p.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <div className="text-right text-sm font-medium text-green-600 pt-2 border-t border-gray-200">
                Итого: {formatMoney(paymentsSum)} BYN
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Задачи */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Задачи</h3>
            {tasks.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>
            )}
          </div>
          <Button size="sm" onClick={openTaskModal}>
            <Plus size={14} />
            Добавить задачу
          </Button>
        </div>

        {tasks.length === 0 ? (
          <EmptyState message="Задач нет" />
        ) : (
          <div className="p-4 space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${task.is_completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}
              >
                <button
                  onClick={() => handleToggleTask(task)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    task.is_completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-primary-500'
                  }`}
                >
                  {task.is_completed && <CheckCircle size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${task.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {task.title}
                  </p>
                  {task.due_date && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(task.due_date)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- Модалки --- */}

      {/* Модалка добавления допа */}
      <Modal open={addonModalOpen} onClose={() => setAddonModalOpen(false)} title="Добавить доп. услугу">
        <form onSubmit={handleSaveAddon} className="space-y-4">
          {formError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{formError}</div>}

          <Select
            label="Услуга *"
            options={addonServiceOptions}
            value={addonForm.service_id}
            onChange={e => handleAddonServiceChange(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Кол-во"
              type="number"
              min={1}
              value={addonForm.quantity}
              onChange={e => setAddonForm(prev => ({ ...prev, quantity: e.target.value }))}
            />
            <Input
              label="Цена продажи"
              type="number"
              step="0.01"
              value={addonForm.sale_price}
              onChange={e => setAddonForm(prev => ({ ...prev, sale_price: e.target.value }))}
            />
            <Input
              label="Себестоимость"
              type="number"
              step="0.01"
              value={addonForm.cost_price}
              onChange={e => setAddonForm(prev => ({ ...prev, cost_price: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAddonModalOpen(false)}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</Button>
          </div>
        </form>
      </Modal>

      {/* Модалка добавления платежа */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Добавить платёж">
        <form onSubmit={handleSavePayment} className="space-y-4">
          {formError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{formError}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Сумма *"
              type="number"
              step="0.01"
              min="0"
              value={paymentForm.amount}
              onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="0.00"
            />
            <Input
              label="Дата"
              type="date"
              value={paymentForm.payment_date}
              onChange={e => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Тип платежа"
              options={PAYMENT_TYPE_OPTIONS}
              value={paymentForm.payment_type}
              onChange={e => handlePaymentTypeChange(e.target.value)}
            />
            <Select
              label="Способ оплаты"
              options={PAYMENT_METHOD_OPTIONS}
              value={paymentForm.payment_method}
              onChange={e => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
            />
          </div>

          <Input
            label="Комментарий"
            value={paymentForm.comment}
            onChange={e => setPaymentForm(prev => ({ ...prev, comment: e.target.value }))}
            placeholder="Необязательно"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setPaymentModalOpen(false)}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</Button>
          </div>
        </form>
      </Modal>

      {/* Модалка добавления задачи */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="Новая задача">
        <form onSubmit={handleSaveTask} className="space-y-4">
          {formError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{formError}</div>}

          <Input
            label="Название *"
            value={taskForm.title}
            onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Что нужно сделать?"
          />

          <Input
            label="Срок"
            type="date"
            value={taskForm.due_date}
            onChange={e => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setTaskModalOpen(false)}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Создать'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

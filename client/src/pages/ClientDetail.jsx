import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge, EmptyState, Loader } from '../components/UI';
import { BOOKING_STATUS_LABELS, LEAD_STATUS_LABELS, SOURCE_LABELS, SOURCE_OPTIONS, formatDate, formatMoney } from '../components/helpers';
import { ArrowLeft, Edit, Phone, MessageCircle } from 'lucide-react';

const SOURCE_EDIT_OPTIONS = SOURCE_OPTIONS.filter(o => o.value !== '').map(o => ({ ...o }));
SOURCE_EDIT_OPTIONS.unshift({ value: '', label: 'Не выбран' });

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', telegram: '', instagram: '', source: '', comment: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchClient = async () => {
    try {
      setLoading(true);
      const data = await api.getClient(id);
      setClient(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClient();
  }, [id]);

  const openEdit = () => {
    setForm({
      name: client.name || '',
      phone: client.phone || '',
      telegram: client.telegram || '',
      instagram: client.instagram || '',
      source: client.source || '',
      comment: client.comment || '',
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Имя клиента обязательно');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updateClient(id, form);
      closeModal();
      fetchClient();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  if (loading) return <Loader />;
  if (!client) return <EmptyState message="Клиент не найден" />;

  const bookings = client.bookings || [];
  const leads = client.leads || [];

  return (
    <div>
      {/* Back link */}
      <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors mb-4">
        <ArrowLeft size={16} />
        Назад к клиентам
      </Link>

      <PageHeader
        title={client.name}
        subtitle={client.is_repeat ? 'Повторный клиент' : 'Клиент'}
        action={
          <Button variant="secondary" onClick={openEdit}>
            <Edit size={16} />
            Редактировать
          </Button>
        }
      />

      {/* Client Info Card */}
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
              <Phone size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Телефон</p>
              <p className="text-sm text-gray-900 mt-0.5">{client.phone || '—'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
              <MessageCircle size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Telegram</p>
              <p className="text-sm text-gray-900 mt-0.5">{client.telegram || '—'}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium">Instagram</p>
            <p className="text-sm text-gray-900 mt-0.5">{client.instagram || '—'}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium">Источник</p>
            <p className="text-sm text-gray-900 mt-0.5">
              {client.source ? (
                <Badge color="blue">{SOURCE_LABELS[client.source] || client.source}</Badge>
              ) : '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium">Первый контакт</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(client.first_contact_date)}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium">Бронирований</p>
            <p className="text-sm text-gray-900 mt-0.5">
              {client.booking_count || 0}
              {client.is_repeat ? (
                <Badge color="green" className="ml-2">Повторный</Badge>
              ) : null}
            </p>
          </div>
        </div>

        {client.comment && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-1">Комментарий</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.comment}</p>
          </div>
        )}
      </Card>

      {/* Bookings Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Бронирования</h2>
        {bookings.length === 0 ? (
          <Card className="p-6">
            <EmptyState message="Нет бронирований" />
          </Card>
        ) : (
          <div className="space-y-2">
            {bookings.map(booking => {
              const statusInfo = BOOKING_STATUS_LABELS[booking.status] || { label: booking.status, color: 'gray' };
              return (
                <Link key={booking.id} to={`/bookings/${booking.id}`} className="block">
                  <Card className="p-4 hover:border-primary-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {formatDate(booking.booking_date)}
                          </span>
                          <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {booking.start_time}–{booking.end_time} | {booking.event_type || 'Мероприятие'} | {booking.guest_count || '?'} гостей
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatMoney(booking.total_amount)} BYN</p>
                        {booking.deposit_amount > 0 && (
                          <p className="text-xs text-gray-500">Предоплата: {formatMoney(booking.deposit_amount)}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Leads Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Заявки</h2>
        {leads.length === 0 ? (
          <Card className="p-6">
            <EmptyState message="Нет заявок" />
          </Card>
        ) : (
          <div className="space-y-2">
            {leads.map(lead => {
              const statusInfo = LEAD_STATUS_LABELS[lead.status] || { label: lead.status, color: 'gray' };
              return (
                <Card key={lead.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">
                          Заявка #{lead.id}
                        </span>
                        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {lead.desired_date ? `Желаемая дата: ${formatDate(lead.desired_date)}` : ''}
                        {lead.event_type ? ` | ${lead.event_type}` : ''}
                        {lead.guest_count ? ` | ${lead.guest_count} гостей` : ''}
                      </p>
                      {lead.comment && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{lead.comment}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {formatDate(lead.contact_date)}
                      {lead.booking_id && (
                        <Link
                          to={`/bookings/${lead.booking_id}`}
                          className="block text-primary-600 hover:text-primary-700 mt-1"
                        >
                          Бронь #{lead.booking_id}
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="Редактировать клиента">
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          <Input
            label="Имя *"
            value={form.name}
            onChange={e => updateForm('name', e.target.value)}
            placeholder="Иванова Анна"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Телефон"
              value={form.phone}
              onChange={e => updateForm('phone', e.target.value)}
              placeholder="+375 29 123-45-67"
            />
            <Input
              label="Telegram"
              value={form.telegram}
              onChange={e => updateForm('telegram', e.target.value)}
              placeholder="@username"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Instagram"
              value={form.instagram}
              onChange={e => updateForm('instagram', e.target.value)}
              placeholder="@username"
            />
            <Select
              label="Источник"
              options={SOURCE_EDIT_OPTIONS}
              value={form.source}
              onChange={e => updateForm('source', e.target.value)}
            />
          </div>

          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={e => updateForm('comment', e.target.value)}
            placeholder="Примечания о клиенте..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge } from '../components/UI';
import { BOOKING_STATUS_LABELS, EVENT_TYPES } from '../components/helpers';
import { Plus } from 'lucide-react';

const STATUS_COLORS = {
  preliminary: '#94a3b8',
  no_deposit: '#f59e0b',
  deposit_paid: '#3b82f6',
  fully_paid: '#22c55e',
  completed: '#6b7280',
  cancelled: '#ef4444',
  rescheduled: '#a855f7',
};

export default function CalendarPage() {
  const navigate = useNavigate();
  const calendarRef = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // New client inline creation
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Booking form
  const [form, setForm] = useState({
    client_id: '',
    booking_date: '',
    start_time: '',
    end_time: '',
    guest_count: '',
    event_type: '',
    hourly_rate: '35',
    comment: '',
  });

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoadingClients(true);
    try {
      const data = await api.getClients();
      setClients(data);
    } catch {
      // silent
    } finally {
      setLoadingClients(false);
    }
  }

  // FullCalendar event fetching (bookings + Google events)
  function fetchEvents(info, successCallback, failureCallback) {
    const start = info.startStr.split('T')[0];
    const end = info.endStr.split('T')[0];
    Promise.all([
      api.getCalendarEvents({ start, end }),
      api.googleEvents({ start, end }).catch(() => []),
    ])
      .then(([bookings, googleEvents]) => successCallback([...bookings, ...googleEvents]))
      .catch(err => failureCallback(err));
  }

  // State for Google event popup
  const [googlePopup, setGooglePopup] = useState(null);

  // Click on existing event -> navigate to booking or show Google event info
  function handleEventClick(info) {
    const event = info.event;
    // If it's a Google event, show popup instead of navigating
    if (event.extendedProps?.source === 'google') {
      setGooglePopup({
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.extendedProps.description,
        location: event.extendedProps.location,
      });
      return;
    }
    const bookingId = event.id;
    navigate(`/bookings/${bookingId}`);
  }

  // Click on empty slot -> open creation modal
  function handleDateSelect(info) {
    const date = info.startStr.split('T')[0];
    const startTime = info.startStr.includes('T')
      ? info.startStr.split('T')[1].substring(0, 5)
      : '08:00';
    const endHour = info.endStr.includes('T')
      ? info.endStr.split('T')[1].substring(0, 5)
      : '';

    setForm({
      client_id: '',
      booking_date: date,
      start_time: startTime,
      end_time: endHour || addHour(startTime),
      guest_count: '',
      event_type: '',
      hourly_rate: '35',
      comment: '',
    });
    setError('');
    setCreatingClient(false);
    setNewClientName('');
    setNewClientPhone('');
    setModalOpen(true);
  }

  function addHour(time) {
    const [h, m] = time.split(':').map(Number);
    const nh = Math.min(h + 1, 24);
    return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Calculations
  function getCalculations() {
    const { start_time, end_time, hourly_rate } = form;
    if (!start_time || !end_time) return { hours: 0, rental_cost: 0, deposit: 0 };
    const [sh, sm] = start_time.split(':').map(Number);
    const [eh, em] = end_time.split(':').map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (hours <= 0) return { hours: 0, rental_cost: 0, deposit: 0 };
    const rate = Number(hourly_rate) || 0;
    return {
      hours: Math.round(hours * 100) / 100,
      rental_cost: rate * hours,
      deposit: rate * 1,
    };
  }

  // Create new client inline
  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    try {
      const created = await api.createClient({ name: newClientName.trim(), phone: newClientPhone.trim() || null });
      await loadClients();
      setForm(prev => ({ ...prev, client_id: String(created.id) }));
      setCreatingClient(false);
      setNewClientName('');
      setNewClientPhone('');
    } catch (err) {
      setError(err.message);
    }
  }

  // Submit booking
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.client_id) {
      setError('Выберите клиента');
      return;
    }
    if (!form.booking_date || !form.start_time || !form.end_time) {
      setError('Заполните дату и время');
      return;
    }

    const calc = getCalculations();
    if (calc.hours <= 0) {
      setError('Время окончания должно быть позже начала');
      return;
    }

    setSubmitting(true);
    try {
      await api.createBooking({
        client_id: Number(form.client_id),
        booking_date: form.booking_date,
        start_time: form.start_time,
        end_time: form.end_time,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        event_type: form.event_type || null,
        hourly_rate: Number(form.hourly_rate) || 35,
        comment: form.comment || null,
      });
      setModalOpen(false);
      // Refresh calendar
      const calendarApi = calendarRef.current?.getApi();
      if (calendarApi) calendarApi.refetchEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const calc = getCalculations();

  const clientOptions = [
    { value: '', label: loadingClients ? 'Загрузка...' : '— Выберите клиента —' },
    ...clients.map(c => ({ value: String(c.id), label: `${c.name}${c.phone ? ' (' + c.phone + ')' : ''}` })),
  ];

  const eventTypeOptions = [
    { value: '', label: '— Тип мероприятия —' },
    ...EVENT_TYPES.map(t => ({ value: t, label: t })),
  ];

  return (
    <div>
      <PageHeader
        title="Календарь"
        subtitle="Расписание бронирований"
        action={
          <Button onClick={() => {
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            setForm({
              client_id: '',
              booking_date: date,
              start_time: '18:00',
              end_time: '22:00',
              guest_count: '',
              event_type: '',
              hourly_rate: '35',
              comment: '',
            });
            setError('');
            setCreatingClient(false);
            setModalOpen(true);
          }}>
            <Plus size={16} />
            Новая бронь
          </Button>
        }
      />

      <Card className="p-3 md:p-5">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay',
          }}
          buttonText={{
            today: 'Сегодня',
            week: 'Неделя',
            day: 'День',
          }}
          allDayText="Весь день"
          noEventsText="Нет событий"
          locale="ru"
          firstDay={1}
          slotDuration="01:00:00"
          slotMinTime="08:00:00"
          slotMaxTime="24:00:00"
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          dayHeaderFormat={{
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }}
          selectable={true}
          selectMirror={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          events={fetchEvents}
          height="auto"
          expandRows={true}
          nowIndicator={true}
          dayMaxEvents={true}
        />
      </Card>

      {/* Legend */}
      <Card className="mt-4 p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Статусы бронирований:</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(BOOKING_STATUS_LABELS).map(([key, { label }]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[key] || '#6b7280' }}
              />
              <span className="text-sm text-gray-600">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#8b5cf6' }} />
            <span className="text-sm text-gray-600">Google Calendar</span>
          </div>
        </div>
      </Card>

      {/* Google event popup */}
      <Modal open={!!googlePopup} onClose={() => setGooglePopup(null)} title="Событие Google Calendar">
        {googlePopup && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#8b5cf6' }} />
              <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Google Calendar</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{googlePopup.title}</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">Время:</span>{' '}
                {googlePopup.start?.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {googlePopup.end?.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {googlePopup.location && (
                <p><span className="font-medium">Место:</span> {googlePopup.location}</p>
              )}
              {googlePopup.description && (
                <div>
                  <span className="font-medium">Описание:</span>
                  <p className="mt-1 text-gray-500 whitespace-pre-wrap">{googlePopup.description}</p>
                </div>
              )}
            </div>
            <div className="pt-3 flex justify-end">
              <Button variant="ghost" onClick={() => setGooglePopup(null)}>Закрыть</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Booking creation modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая бронь" wide>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Client selection */}
          <div>
            {!creatingClient ? (
              <div className="flex items-end gap-2">
                <Select
                  label="Клиент"
                  options={clientOptions}
                  value={form.client_id}
                  onChange={e => updateForm('client_id', e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreatingClient(true)}
                  className="mb-0.5"
                >
                  <Plus size={14} />
                  Новый
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                <p className="text-sm font-medium text-gray-700">Новый клиент:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Имя *"
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    placeholder="Имя клиента"
                  />
                  <Input
                    label="Телефон"
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(e.target.value)}
                    placeholder="+375..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleCreateClient}>
                    Создать
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingClient(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Date and time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Дата"
              type="date"
              value={form.booking_date}
              onChange={e => updateForm('booking_date', e.target.value)}
            />
            <Input
              label="Начало"
              type="time"
              value={form.start_time}
              onChange={e => updateForm('start_time', e.target.value)}
            />
            <Input
              label="Окончание"
              type="time"
              value={form.end_time}
              onChange={e => updateForm('end_time', e.target.value)}
            />
          </div>

          {/* Event details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Кол-во гостей"
              type="number"
              min="1"
              value={form.guest_count}
              onChange={e => updateForm('guest_count', e.target.value)}
              placeholder="10"
            />
            <Select
              label="Тип мероприятия"
              options={eventTypeOptions}
              value={form.event_type}
              onChange={e => updateForm('event_type', e.target.value)}
            />
            <Input
              label="Ставка BYN/час"
              type="number"
              min="0"
              step="1"
              value={form.hourly_rate}
              onChange={e => updateForm('hourly_rate', e.target.value)}
            />
          </div>

          {/* Comment */}
          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={e => updateForm('comment', e.target.value)}
            placeholder="Пожелания, детали..."
          />

          {/* Calculations */}
          {calc.hours > 0 && (
            <div className="p-3 bg-primary-50 rounded-lg">
              <p className="text-sm font-medium text-primary-800 mb-2">Расчёт:</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-primary-600">Часов:</span>
                  <span className="font-semibold text-primary-900 ml-1">{calc.hours}</span>
                </div>
                <div>
                  <span className="text-primary-600">Аренда:</span>
                  <span className="font-semibold text-primary-900 ml-1">{calc.rental_cost} BYN</span>
                </div>
                <div>
                  <span className="text-primary-600">Задаток:</span>
                  <span className="font-semibold text-primary-900 ml-1">{calc.deposit} BYN</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохранение...' : 'Создать бронь'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

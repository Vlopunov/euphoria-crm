import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge, EmptyState, Loader } from '../components/UI';
import { TASK_TYPE_LABELS, formatDate } from '../components/helpers';
import { Plus, Trash2, CheckCircle, Circle, AlertCircle, Clock } from 'lucide-react';

const TASK_TYPE_COLORS = {
  deposit_reminder: 'red',
  payment_reminder: 'yellow',
  addons_discuss: 'blue',
  review_request: 'green',
  other: 'gray',
};

const TASK_TYPE_OPTIONS = [
  { value: 'deposit_reminder', label: 'Напомнить предоплату' },
  { value: 'payment_reminder', label: 'Напомнить оплату' },
  { value: 'addons_discuss', label: 'Обсудить допы' },
  { value: 'review_request', label: 'Запросить отзыв' },
  { value: 'other', label: 'Другое' },
];

const EMPTY_FORM = {
  title: '',
  description: '',
  due_date: '',
  task_type: 'other',
  booking_id: '',
  client_id: '',
  assigned_to: '',
};

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDueDateStatus(dueDate, isCompleted) {
  if (!dueDate || isCompleted) return null;
  const today = getToday();
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'future';
}

function getDueDateColor(status) {
  if (status === 'overdue') return 'text-red-600';
  if (status === 'today') return 'text-orange-500';
  return 'text-gray-500';
}

function getRowBorder(dueDate, isCompleted) {
  const status = getDueDateStatus(dueDate, isCompleted);
  if (status === 'overdue') return 'border-l-4 border-l-red-500';
  if (status === 'today') return 'border-l-4 border-l-orange-400';
  return 'border-l-4 border-l-transparent';
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reference data
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    loadTasks();
  }, [showCompleted]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await api.getTasks({ completed: showCompleted ? 'true' : 'false' });
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    try {
      const [usersData, clientsData, bookingsData] = await Promise.all([
        api.getUsers(),
        api.getClients(),
        api.getBookings(),
      ]);
      setUsers(usersData);
      setClients(clientsData);
      setBookings(bookingsData);
    } catch (err) {
      console.error(err);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setError('');
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError('Название задачи обязательно');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        task_type: form.task_type,
        booking_id: form.booking_id ? Number(form.booking_id) : null,
        client_id: form.client_id ? Number(form.client_id) : null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      await api.createTask(payload);
      closeModal();
      await loadTasks();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(task) {
    try {
      await api.updateTask(task.id, { is_completed: task.is_completed ? 0 : 1 });
      await loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteTask(id) {
    if (!window.confirm('Удалить задачу?')) return;
    try {
      await api.deleteTask(id);
      await loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  const userOptions = [
    { value: '', label: 'Не назначен' },
    ...users.map(u => ({ value: u.id, label: u.name })),
  ];

  const clientOptions = [
    { value: '', label: 'Без клиента' },
    ...clients.map(c => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` })),
  ];

  const bookingOptions = [
    { value: '', label: 'Без бронирования' },
    ...bookings.map(b => ({ value: b.id, label: `#${b.id} — ${b.client_name || 'Без клиента'} (${formatDate(b.booking_date)})` })),
  ];

  return (
    <div>
      <PageHeader
        title="Задачи и напоминания"
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Новая задача
          </Button>
        }
      />

      {/* Toggle filter */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompleted(false)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !showCompleted
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Активные
          </button>
          <button
            onClick={() => setShowCompleted(true)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showCompleted
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Завершённые
          </button>
        </div>
      </Card>

      {/* Tasks list */}
      {loading ? (
        <Loader />
      ) : tasks.length === 0 ? (
        <Card className="p-6">
          <EmptyState message={showCompleted ? 'Нет завершённых задач' : 'Нет активных задач'} />
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const dueDateStatus = getDueDateStatus(task.due_date, task.is_completed);
            const borderClass = getRowBorder(task.due_date, task.is_completed);
            const typeColor = TASK_TYPE_COLORS[task.task_type] || 'gray';
            const typeLabel = TASK_TYPE_LABELS[task.task_type] || task.task_type;

            return (
              <Card key={task.id} className={`p-4 ${borderClass}`}>
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleComplete(task)}
                    className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-primary-600 transition-colors"
                    title={task.is_completed ? 'Вернуть в активные' : 'Завершить'}
                  >
                    {task.is_completed ? (
                      <CheckCircle size={20} className="text-green-500" />
                    ) : (
                      <Circle size={20} />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`font-semibold text-gray-900 ${task.is_completed ? 'line-through text-gray-400' : ''}`}>
                        {task.title}
                      </span>
                      <Badge color={typeColor}>{typeLabel}</Badge>
                    </div>

                    {task.description && (
                      <p className="text-sm text-gray-500 mb-2">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {task.client_name && (
                        <span className="text-primary-600 font-medium">{task.client_name}</span>
                      )}

                      {task.booking_date && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Бронь: {formatDate(task.booking_date)}
                        </span>
                      )}

                      {task.due_date && (
                        <span className={`flex items-center gap-1 font-medium ${getDueDateColor(dueDateStatus)}`}>
                          {dueDateStatus === 'overdue' && <AlertCircle size={12} />}
                          {dueDateStatus === 'today' && <Clock size={12} />}
                          {dueDateStatus === 'overdue' ? 'Просрочено: ' : dueDateStatus === 'today' ? 'Сегодня: ' : 'Срок: '}
                          {formatDate(task.due_date)}
                        </span>
                      )}

                      {task.assigned_name && (
                        <span className="text-gray-400">{task.assigned_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="Новая задача">
        <div className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          <Input
            label="Название *"
            value={form.title}
            onChange={e => updateForm('title', e.target.value)}
            placeholder="Что нужно сделать..."
          />

          <Textarea
            label="Описание"
            value={form.description}
            onChange={e => updateForm('description', e.target.value)}
            placeholder="Подробности задачи..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Срок выполнения"
              type="date"
              value={form.due_date}
              onChange={e => updateForm('due_date', e.target.value)}
            />
            <Select
              label="Тип задачи"
              options={TASK_TYPE_OPTIONS}
              value={form.task_type}
              onChange={e => updateForm('task_type', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Бронирование"
              options={bookingOptions}
              value={form.booking_id}
              onChange={e => updateForm('booking_id', e.target.value)}
            />
            <Select
              label="Клиент"
              options={clientOptions}
              value={form.client_id}
              onChange={e => updateForm('client_id', e.target.value)}
            />
          </div>

          <Select
            label="Ответственный"
            options={userOptions}
            value={form.assigned_to}
            onChange={e => updateForm('assigned_to', e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

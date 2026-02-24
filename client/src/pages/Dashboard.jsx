import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { Calendar, Users, CreditCard, TrendingUp, Clock, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { Card, StatCard, Badge, Loader } from '../components/UI';
import {
  formatMoney,
  formatDate,
  formatDateShort,
  BOOKING_STATUS_LABELS,
  TASK_TYPE_LABELS,
  SOURCE_LABELS,
  isToday,
  isTomorrow,
  toLocalDateStr,
} from '../components/helpers';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completingTask, setCompletingTask] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError('');
      const result = await api.dashboard();
      setData(result);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteTask(taskId) {
    try {
      setCompletingTask(taskId);
      await api.updateTask(taskId, { is_completed: 1 });
      setData(prev => ({
        ...prev,
        pendingTasks: prev.pendingTasks.filter(t => t.id !== taskId),
      }));
    } catch (err) {
      setError(err.message || 'Не удалось завершить задачу');
    } finally {
      setCompletingTask(null);
    }
  }

  function getDateLabel(dateStr) {
    if (isToday(dateStr)) return 'Сегодня';
    if (isTomorrow(dateStr)) return 'Завтра';
    return formatDateShort(dateStr);
  }

  if (loading) return <Loader />;

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle size={40} className="text-red-400 mb-3" />
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        >
          Повторить
        </button>
      </div>
    );
  }

  const {
    weekBookings = 0,
    monthRevenue = 0,
    expectedRevenue = 0,
    utilization = 0,
    avgCheck = 0,
    depositsToCollect = { count: 0, total: 0 },
    repeatClients = 0,
    cancellations = { cancelled: 0, rescheduled: 0 },
    upcomingEvents = [],
    pendingTasks = [],
    revenueBySource = [],
  } = data || {};

  const maxSourceRevenue = revenueBySource.length
    ? Math.max(...revenueBySource.map(s => Number(s.total) || 0))
    : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-sm text-gray-500 mt-0.5">Обзор текущей ситуации</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Брони на неделю"
          value={weekBookings}
          icon={Calendar}
          color="blue"
        />
        <StatCard
          label="Выручка за месяц"
          value={`${formatMoney(monthRevenue)} BYN`}
          icon={CreditCard}
          color="green"
        />
        <StatCard
          label="Ожидаемая выручка"
          value={`${formatMoney(expectedRevenue)} BYN`}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          label="Загрузка"
          value={`${utilization}%`}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          label="Средний чек"
          value={`${formatMoney(avgCheck)} BYN`}
          icon={CreditCard}
          color="blue"
        />
        <StatCard
          label="Предоплаты к получению"
          value={`${depositsToCollect.count} шт.`}
          sub={`${formatMoney(depositsToCollect.total)} BYN`}
          icon={AlertCircle}
          color="red"
        />
        <StatCard
          label="Повторные клиенты"
          value={repeatClients}
          icon={Users}
          color="green"
        />
        <StatCard
          label="Отмены / переносы"
          value={`${cancellations.cancelled + cancellations.rescheduled}`}
          sub={`${cancellations.cancelled} отм. / ${cancellations.rescheduled} перен.`}
          icon={AlertCircle}
          color="yellow"
        />
      </div>

      {/* Two-column layout: events + tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Upcoming events */}
        <Card>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Ближайшие мероприятия</h2>
            <Link
              to="/bookings"
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Все брони <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                Нет ближайших мероприятий
              </div>
            ) : (
              upcomingEvents.map(event => {
                const statusInfo = BOOKING_STATUS_LABELS[event.status] || {
                  label: event.status,
                  color: 'gray',
                };
                return (
                  <Link
                    key={event.id}
                    to={`/bookings/${event.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 text-center w-12">
                      <p className={`text-xs font-semibold ${
                        isToday(event.booking_date)
                          ? 'text-primary-600'
                          : isTomorrow(event.booking_date)
                            ? 'text-orange-500'
                            : 'text-gray-500'
                      }`}>
                        {getDateLabel(event.booking_date)}
                      </p>
                      {event.start_time && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {event.start_time.slice(0, 5)}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {event.client_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {event.event_type}
                      </p>
                    </div>
                    <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                  </Link>
                );
              })
            )}
          </div>
        </Card>

        {/* Pending tasks */}
        <Card>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Задачи и напоминания</h2>
            <Link
              to="/tasks"
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Все задачи <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingTasks.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                Нет активных задач
              </div>
            ) : (
              pendingTasks.map(task => {
                const typeLabel = TASK_TYPE_LABELS[task.task_type] || task.task_type;
                const isOverdue = task.due_date && task.due_date < toLocalDateStr();
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      disabled={completingTask === task.id}
                      className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center transition-colors disabled:opacity-50"
                      title="Отметить выполненной"
                    >
                      {completingTask === task.id && (
                        <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.client_name && (
                          <p className="text-xs text-gray-500 truncate">{task.client_name}</p>
                        )}
                        {task.due_date && (
                          <p className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {getDateLabel(task.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge color={
                      task.task_type === 'deposit_reminder' || task.task_type === 'payment_reminder'
                        ? 'yellow'
                        : task.task_type === 'review_request'
                          ? 'green'
                          : 'gray'
                    }>
                      {typeLabel}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Revenue by source */}
      {revenueBySource.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Выручка по источникам</h2>
          </div>
          <div className="p-5 space-y-3">
            {revenueBySource.map(item => {
              const total = Number(item.total) || 0;
              const pct = maxSourceRevenue > 0 ? (total / maxSourceRevenue) * 100 : 0;
              const label = SOURCE_LABELS[item.source] || item.source || 'Не указан';
              return (
                <div key={item.source || 'unknown'}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{label}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatMoney(total)} BYN
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

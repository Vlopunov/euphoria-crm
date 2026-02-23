import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Select, Input, Badge, EmptyState, Loader } from '../components/UI';
import { BOOKING_STATUS_OPTIONS, BOOKING_STATUS_LABELS, formatDate, formatMoney } from '../components/helpers';
import { Calendar, Plus } from 'lucide-react';

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await api.getBookings(params);
      setBookings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [statusFilter, dateFrom, dateTo]);

  const getStatusBadge = (status) => {
    const info = BOOKING_STATUS_LABELS[status];
    if (!info) return <Badge color="gray">{status}</Badge>;
    return <Badge color={info.color}>{info.label}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Бронирования"
        subtitle={`Всего: ${bookings.length}`}
        action={
          <Link to="/calendar">
            <Button>
              <Plus size={16} />
              Новая бронь
            </Button>
          </Link>
        }
      />

      {/* Фильтры */}
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select
            options={BOOKING_STATUS_OPTIONS}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="sm:w-52"
          />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            placeholder="Дата от"
            className="sm:w-44"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            placeholder="Дата до"
            className="sm:w-44"
          />
          {(statusFilter || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
                setDateFrom('');
                setDateTo('');
              }}
              className="self-center"
            >
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      {/* Контент */}
      {loading ? (
        <Loader />
      ) : bookings.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Бронирования не найдены" />
        </Card>
      ) : (
        <>
          {/* Таблица для десктопа */}
          <Card className="overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Время</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Клиент</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Тип</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Гости</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Аренда</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Допы</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Итого</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Оплачено</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Остаток</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const remaining = Number(b.remaining || 0);
                    return (
                      <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/bookings/${b.id}`} className="font-medium text-gray-900 hover:text-primary-600 transition-colors">
                            {formatDate(b.booking_date)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{b.client_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{b.event_type || '—'}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{b.guest_count || '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatMoney(b.rental_cost)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatMoney(b.addons_total)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatMoney(b.grand_total)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatMoney(b.total_paid)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${remaining > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {formatMoney(remaining)}
                        </td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(b.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Карточки для мобильных */}
          <div className="lg:hidden space-y-3">
            {bookings.map(b => {
              const remaining = Number(b.remaining || 0);
              return (
                <Link key={b.id} to={`/bookings/${b.id}`}>
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="font-medium text-gray-900">{formatDate(b.booking_date)}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                        </p>
                      </div>
                      {getStatusBadge(b.status)}
                    </div>

                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-700">{b.client_name || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {b.event_type || '—'}{b.guest_count ? ` · ${b.guest_count} гостей` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-2">
                      <div>
                        <span className="text-gray-500">Итого: </span>
                        <span className="font-medium text-gray-900">{formatMoney(b.grand_total)} BYN</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Остаток: </span>
                        <span className={`font-medium ${remaining > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {formatMoney(remaining)} BYN
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

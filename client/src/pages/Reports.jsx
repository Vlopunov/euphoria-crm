import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Loader } from '../components/UI';
import { formatMoney, formatDateShort, SOURCE_LABELS } from '../components/helpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

function toLocalISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    date_from: toLocalISO(from),
    date_to: toLocalISO(to),
  };
}

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(() => getMonthRange().date_from);
  const [dateTo, setDateTo] = useState(() => getMonthRange().date_to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReport();
  }, [dateFrom, dateTo]);

  async function loadReport() {
    try {
      setLoading(true);
      setError('');
      const result = await api.reports({ date_from: dateFrom, date_to: dateTo });
      setData(result);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить отчёт');
    } finally {
      setLoading(false);
    }
  }

  function setPeriod(type) {
    const now = new Date();
    let from, to;

    switch (type) {
      case 'week': {
        from = new Date(now);
        from.setDate(now.getDate() - 6);
        to = now;
        break;
      }
      case 'month': {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        from = new Date(now.getFullYear(), qMonth, 1);
        to = new Date(now.getFullYear(), qMonth + 3, 0);
        break;
      }
      case 'year': {
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31);
        break;
      }
      default:
        return;
    }

    setDateFrom(toLocalISO(from));
    setDateTo(toLocalISO(to));
  }

  const chartData = (data?.dailyRevenue || []).map(d => ({
    date: formatDateShort(d.date),
    total: Number(d.total) || 0,
  }));

  const maxExpense = data?.expensesByCategory?.length
    ? Math.max(...data.expensesByCategory.map(e => Number(e.total) || 0))
    : 0;

  const sortedSources = data?.sourceAnalytics
    ? [...data.sourceAnalytics].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
    : [];

  const incomeTotal = Number(data?.totalIncome) || 0;
  const rentalRev = Number(data?.rentalRevenue) || 0;
  const addonsRev = Number(data?.addonsRevenue) || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Отчёты" subtitle="Финансовая аналитика за период" />

      {/* Date range controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <Input
            label="Дата начала"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full sm:w-auto"
          />
          <Input
            label="Дата конца"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full sm:w-auto"
          />
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => setPeriod('week')}>
              Неделя
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPeriod('month')}>
              Месяц
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPeriod('quarter')}>
              Квартал
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPeriod('year')}>
              Год
            </Button>
          </div>
        </div>
      </Card>

      {loading && <Loader />}

      {error && !loading && (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Доходы</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {formatMoney(data.totalIncome)} BYN
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-green-50">
                  <TrendingUp size={24} className="text-green-600" />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Расходы</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {formatMoney(data.totalExpenses)} BYN
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-red-50">
                  <TrendingDown size={24} className="text-red-600" />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Прибыль</p>
                  <p className={`text-2xl font-bold mt-1 ${Number(data.profit) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatMoney(data.profit)} BYN
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${Number(data.profit) >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <DollarSign size={24} className={Number(data.profit) >= 0 ? 'text-blue-600' : 'text-red-600'} />
                </div>
              </div>
            </Card>
          </div>

          {/* Income breakdown + Revenue chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Income breakdown */}
            <Card>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Структура доходов</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-700">Аренда</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatMoney(rentalRev)} BYN
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: incomeTotal > 0 ? `${(rentalRev / incomeTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-700">Допы</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatMoney(addonsRev)} BYN
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-500"
                      style={{ width: incomeTotal > 0 ? `${(addonsRev / incomeTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Итого</span>
                  <span className="text-sm font-bold text-gray-900">
                    {formatMoney(incomeTotal)} BYN
                  </span>
                </div>
              </div>
            </Card>

            {/* Revenue chart */}
            <Card>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Выручка по дням</h2>
              </div>
              <div className="p-5">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                        tickFormatter={v => formatMoney(v)}
                      />
                      <Tooltip
                        formatter={(value) => [`${formatMoney(value)} BYN`, 'Выручка']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          fontSize: '13px',
                        }}
                      />
                      <Bar
                        dataKey="total"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    Нет данных за период
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Expenses by category + Source analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Expenses by category */}
            <Card>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Расходы по категориям</h2>
              </div>
              <div className="p-5 space-y-3">
                {data.expensesByCategory && data.expensesByCategory.length > 0 ? (
                  <>
                    {data.expensesByCategory.map((item, idx) => {
                      const total = Number(item.total) || 0;
                      const pct = maxExpense > 0 ? (total / maxExpense) * 100 : 0;
                      return (
                        <div key={item.category || idx}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700">{item.category || 'Без категории'}</span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatMoney(total)} BYN
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Итого</span>
                      <span className="text-sm font-bold text-gray-900">
                        {formatMoney(data.totalExpenses)} BYN
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Нет расходов за период
                  </div>
                )}
              </div>
            </Card>

            {/* Source analytics */}
            <Card>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Аналитика по источникам</h2>
              </div>
              <div className="p-5">
                {sortedSources.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 pr-4 font-medium text-gray-500">Источник</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">Брони</th>
                          <th className="text-right py-2 pl-4 font-medium text-gray-500">Выручка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSources.map((item, idx) => (
                          <tr key={item.source || idx} className="border-b border-gray-50 last:border-0">
                            <td className="py-2.5 pr-4 text-gray-700">
                              {SOURCE_LABELS[item.source] || item.source || 'Не указан'}
                            </td>
                            <td className="py-2.5 px-4 text-right text-gray-600">
                              {item.bookings}
                            </td>
                            <td className="py-2.5 pl-4 text-right font-medium text-gray-900">
                              {formatMoney(item.revenue)} BYN
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Нет данных за период
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

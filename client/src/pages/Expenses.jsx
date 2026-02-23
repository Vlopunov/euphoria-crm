import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, EmptyState, Loader } from '../components/UI';
import { formatMoney, formatDate, PAYMENT_METHOD_OPTIONS, PAYMENT_METHOD_LABELS } from '../components/helpers';
import { Plus, Trash2, Receipt } from 'lucide-react';

const EMPTY_FORM = {
  expense_date: new Date().toISOString().split('T')[0],
  category_id: '',
  amount: '',
  payment_method: 'cash',
  comment: '',
};

export default function Expenses() {
  const { can } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [expensesData, categoriesData] = await Promise.all([
        api.getExpenses(buildParams()),
        api.getExpenseCategories(),
      ]);
      setExpenses(expensesData);
      setCategories(categoriesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const buildParams = () => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (categoryFilter) params.category_id = categoryFilter;
    return params;
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, categoryFilter]);

  const categoryFilterOptions = [
    { value: '', label: 'Все категории' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  const categoryFormOptions = [
    { value: '', label: 'Выберите категорию' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  const paymentMethodFormOptions = [
    ...PAYMENT_METHOD_OPTIONS,
  ];

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const openCreate = () => {
    setEditingExpense(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (expense) => {
    setEditingExpense(expense);
    setForm({
      expense_date: expense.expense_date || '',
      category_id: expense.category_id || '',
      amount: expense.amount ?? '',
      payment_method: expense.payment_method || 'cash',
      comment: expense.comment || '',
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingExpense(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.expense_date) {
      setError('Дата обязательна');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Укажите сумму');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
      };
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, payload);
      } else {
        await api.createExpense(payload);
      }
      closeModal();
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`Удалить расход "${expense.category_name || ''}" на ${formatMoney(expense.amount)} BYN?`)) return;
    try {
      setDeleting(expense.id);
      await api.deleteExpense(expense.id);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <PageHeader
        title="Расходы"
        subtitle={`Итого: ${formatMoney(total)} BYN`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Добавить расход
          </Button>
        }
      />

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="sm:w-44"
            label="Дата от"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="sm:w-44"
            label="Дата до"
          />
          <Select
            label="Категория"
            options={categoryFilterOptions}
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="sm:w-52"
          />
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <Loader />
      ) : expenses.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Расходы не найдены" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Категория</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Сумма</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Способ оплаты</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Комментарий</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Создал</th>
                  {can('owner') && (
                    <th className="text-center px-4 py-3 font-medium text-gray-600 w-10"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {expenses.map(expense => (
                  <tr
                    key={expense.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => openEdit(expense)}
                  >
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Receipt size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{expense.category_name || '—'}</span>
                      </div>
                      <div className="sm:hidden text-xs text-gray-500 mt-0.5">
                        {PAYMENT_METHOD_LABELS[expense.payment_method] || expense.payment_method}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {formatMoney(expense.amount)} BYN
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      {PAYMENT_METHOD_LABELS[expense.payment_method] || expense.payment_method || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      <span className="line-clamp-1">{expense.comment || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell whitespace-nowrap">
                      {expense.created_by_name || '—'}
                    </td>
                    {can('owner') && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(expense);
                          }}
                          disabled={deleting === expense.id}
                          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Удалить"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Total row */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 font-semibold text-gray-700" colSpan={2}>
                    Итого
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                    {formatMoney(total)} BYN
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="hidden lg:table-cell" />
                  {can('owner') && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingExpense ? 'Редактировать расход' : 'Новый расход'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          <Input
            label="Дата *"
            type="date"
            value={form.expense_date}
            onChange={e => updateForm('expense_date', e.target.value)}
          />

          <Select
            label="Категория"
            options={categoryFormOptions}
            value={form.category_id}
            onChange={e => updateForm('category_id', e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Сумма (BYN) *"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={e => updateForm('amount', e.target.value)}
              placeholder="0"
            />
            <Select
              label="Способ оплаты"
              options={paymentMethodFormOptions}
              value={form.payment_method}
              onChange={e => updateForm('payment_method', e.target.value)}
            />
          </div>

          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={e => updateForm('comment', e.target.value)}
            placeholder="Описание расхода..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : editingExpense ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

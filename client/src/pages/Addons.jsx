import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge, EmptyState, Loader } from '../components/UI';
import { formatMoney } from '../components/helpers';
import { Plus, Edit, Package } from 'lucide-react';

const EXECUTOR_TYPE_OPTIONS = [
  { value: 'own', label: 'Свои' },
  { value: 'contractor', label: 'Подрядчик' },
];

const EXECUTOR_TYPE_LABELS = {
  own: 'Свои',
  contractor: 'Подрядчик',
};

const EMPTY_FORM = {
  category_id: '',
  name: '',
  price: '',
  cost_price: '',
  executor_type: 'own',
  comment: '',
  is_active: true,
};

export default function Addons() {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [servicesData, categoriesData] = await Promise.all([
        api.getAddonServices(),
        api.getAddonCategories(),
      ]);
      setServices(servicesData);
      setCategories(categoriesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const categoryOptions = [
    { value: '', label: 'Выберите категорию' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  const groupedServices = categories.map(cat => ({
    ...cat,
    services: services.filter(s => s.category_id === cat.id),
  })).filter(g => g.services.length > 0);

  const uncategorized = services.filter(
    s => !categories.some(c => c.id === s.category_id)
  );

  const openCreate = () => {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (service) => {
    setEditingService(service);
    setForm({
      category_id: service.category_id || '',
      name: service.name || '',
      price: service.price ?? '',
      cost_price: service.cost_price ?? '',
      executor_type: service.executor_type || 'own',
      comment: service.comment || '',
      is_active: !!service.is_active,
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingService(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Название услуги обязательно');
      return;
    }
    if (!form.category_id) {
      setError('Выберите категорию');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        price: form.price === '' ? 0 : Number(form.price),
        cost_price: form.cost_price === '' ? 0 : Number(form.cost_price),
        is_active: form.is_active ? 1 : 0,
      };
      if (editingService) {
        await api.updateAddonService(editingService.id, payload);
      } else {
        await api.createAddonService(payload);
      }
      closeModal();
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleToggleActive = async (service) => {
    try {
      await api.updateAddonService(service.id, {
        ...service,
        is_active: service.is_active ? 0 : 1,
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const renderServiceRow = (service) => {
    const margin = (Number(service.price) || 0) - (Number(service.cost_price) || 0);
    return (
      <tr
        key={service.id}
        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => openEdit(service)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{service.name}</span>
            {!service.is_active && (
              <Badge color="gray">Неактивна</Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
          {service.category_name || '—'}
        </td>
        <td className="px-4 py-3 text-gray-900 text-right">
          {formatMoney(service.price)} BYN
        </td>
        <td className="px-4 py-3 text-gray-500 text-right hidden sm:table-cell">
          {formatMoney(service.cost_price)} BYN
        </td>
        <td className="px-4 py-3 text-right hidden lg:table-cell">
          <span className={margin >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {formatMoney(margin)} BYN
          </span>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <Badge color={service.executor_type === 'own' ? 'blue' : 'purple'}>
            {EXECUTOR_TYPE_LABELS[service.executor_type] || service.executor_type}
          </Badge>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleActive(service);
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              service.is_active ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={service.is_active ? 'Деактивировать' : 'Активировать'}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                service.is_active ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(service);
            }}
            className="text-gray-400 hover:text-primary-600 transition-colors"
            title="Редактировать"
          >
            <Edit size={16} />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <PageHeader
        title="Каталог допов"
        subtitle={`Всего услуг: ${services.length}`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Добавить услугу
          </Button>
        }
      />

      {loading ? (
        <Loader />
      ) : services.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Услуги не найдены" />
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedServices.map(group => (
            <Card key={group.id} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Package size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">{group.name}</h3>
                <span className="text-xs text-gray-400">({group.services.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Название</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs hidden md:table-cell">Категория</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Цена</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs hidden sm:table-cell">Себестоимость</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs hidden lg:table-cell">Маржа</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs hidden sm:table-cell">Исполнитель</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs">Активна</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.services.map(renderServiceRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {uncategorized.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Package size={16} className="text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-500">Без категории</h3>
                <span className="text-xs text-gray-400">({uncategorized.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Название</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs hidden md:table-cell">Категория</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Цена</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs hidden sm:table-cell">Себестоимость</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs hidden lg:table-cell">Маржа</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs hidden sm:table-cell">Исполнитель</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs">Активна</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {uncategorized.map(renderServiceRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingService ? 'Редактировать услугу' : 'Новая услуга'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          <Select
            label="Категория *"
            options={categoryOptions}
            value={form.category_id}
            onChange={e => updateForm('category_id', e.target.value)}
          />

          <Input
            label="Название *"
            value={form.name}
            onChange={e => updateForm('name', e.target.value)}
            placeholder="Например: DJ на мероприятие"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Цена (BYN)"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={e => updateForm('price', e.target.value)}
              placeholder="0"
            />
            <Input
              label="Себестоимость (BYN)"
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price}
              onChange={e => updateForm('cost_price', e.target.value)}
              placeholder="0"
            />
          </div>

          {form.price !== '' && form.cost_price !== '' && (
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">Маржа: </span>
              <span className={
                (Number(form.price) - Number(form.cost_price)) >= 0
                  ? 'text-green-600 font-medium'
                  : 'text-red-600 font-medium'
              }>
                {formatMoney(Number(form.price) - Number(form.cost_price))} BYN
              </span>
            </div>
          )}

          <Select
            label="Тип исполнителя"
            options={EXECUTOR_TYPE_OPTIONS}
            value={form.executor_type}
            onChange={e => updateForm('executor_type', e.target.value)}
          />

          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={e => updateForm('comment', e.target.value)}
            placeholder="Примечания к услуге..."
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => updateForm('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Услуга активна</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : editingService ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

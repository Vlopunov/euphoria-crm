import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge, EmptyState, Loader } from '../components/UI';
import { SOURCE_OPTIONS, SOURCE_LABELS } from '../components/helpers';
import { Plus, Search, Users } from 'lucide-react';

const EMPTY_FORM = { name: '', phone: '', telegram: '', instagram: '', source: '', comment: '' };

const SOURCE_CREATE_OPTIONS = SOURCE_OPTIONS.filter(o => o.value !== '').map(o => ({ ...o }));
SOURCE_CREATE_OPTIONS.unshift({ value: '', label: 'Не выбран' });

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (sourceFilter) params.source = sourceFilter;
      const data = await api.getClients(params);
      setClients(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [sourceFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (client, e) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingClient(client);
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
    setEditingClient(null);
    setForm(EMPTY_FORM);
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
      if (editingClient) {
        await api.updateClient(editingClient.id, form);
      } else {
        await api.createClient(form);
      }
      closeModal();
      fetchClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <PageHeader
        title="Клиенты"
        subtitle={`Всего: ${clients.length}`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Добавить клиента
          </Button>
        }
      />

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени, телефону или Telegram..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <Select
            options={SOURCE_OPTIONS}
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="sm:w-48"
          />
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <Loader />
      ) : clients.length === 0 ? (
        <Card className="p-6">
          <EmptyState message="Клиенты не найдены" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Имя</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Телефон</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Telegram</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Instagram</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Источник</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Брони</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Статус</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/clients/${client.id}`} className="font-medium text-gray-900 hover:text-primary-600 transition-colors">
                        {client.name}
                      </Link>
                      <div className="sm:hidden text-xs text-gray-500 mt-0.5">
                        {client.phone || client.telegram || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{client.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{client.telegram || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{client.instagram || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {client.source ? (
                        <Badge color="blue">{SOURCE_LABELS[client.source] || client.source}</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{client.booking_count || 0}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {client.is_repeat ? (
                        <Badge color="green">Повторный</Badge>
                      ) : (
                        <Badge color="gray">Новый</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingClient ? 'Редактировать клиента' : 'Новый клиент'}>
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
              options={SOURCE_CREATE_OPTIONS}
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
              {saving ? 'Сохранение...' : editingClient ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

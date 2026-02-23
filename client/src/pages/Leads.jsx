import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Select, Textarea, Modal, Badge, EmptyState, Loader } from '../components/UI';
import { LEAD_STATUS_OPTIONS, LEAD_STATUS_LABELS, SOURCE_OPTIONS, SOURCE_LABELS, EVENT_TYPES, formatDate } from '../components/helpers';
import { Plus, Filter } from 'lucide-react';

const emptyForm = {
  client_id: '',
  desired_date: '',
  guest_count: '',
  event_type: '',
  source: '',
  status: 'new',
  assigned_to: '',
  comment: '',
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Inline new client
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '' });
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterStatus, filterSource]);

  async function loadData() {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterSource) params.source = filterSource;
      const [leadsData, clientsData, usersData] = await Promise.all([
        api.getLeads(params),
        api.getClients(),
        api.getUsers(),
      ]);
      setLeads(leadsData);
      setClients(clientsData);
      setUsers(usersData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingLead(null);
    setForm(emptyForm);
    setError('');
    setShowNewClient(false);
    setNewClient({ name: '', phone: '' });
    setModalOpen(true);
  }

  function openEdit(lead) {
    setEditingLead(lead);
    setForm({
      client_id: lead.client_id || '',
      desired_date: lead.desired_date || '',
      guest_count: lead.guest_count || '',
      event_type: lead.event_type || '',
      source: lead.source || '',
      status: lead.status || 'new',
      assigned_to: lead.assigned_to || '',
      comment: lead.comment || '',
    });
    setError('');
    setShowNewClient(false);
    setNewClient({ name: '', phone: '' });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingLead(null);
    setShowNewClient(false);
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreateClient() {
    if (!newClient.name.trim() || !newClient.phone.trim()) return;
    setCreatingClient(true);
    try {
      const created = await api.createClient({ name: newClient.name.trim(), phone: newClient.phone.trim() });
      setClients(prev => [...prev, created]);
      setForm(prev => ({ ...prev, client_id: created.id }));
      setShowNewClient(false);
      setNewClient({ name: '', phone: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSave() {
    if (!form.client_id) {
      setError('Выберите клиента');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        client_id: Number(form.client_id),
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      if (editingLead) {
        await api.updateLead(editingLead.id, payload);
      } else {
        await api.createLead(payload);
      }
      closeModal();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const clientOptions = [
    { value: '', label: 'Выберите клиента' },
    ...clients.map(c => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` })),
  ];

  const userOptions = [
    { value: '', label: 'Не назначен' },
    ...users.map(u => ({ value: u.id, label: u.name })),
  ];

  const eventTypeOptions = [
    { value: '', label: 'Тип мероприятия' },
    ...EVENT_TYPES.map(t => ({ value: t, label: t })),
  ];

  const sourceFormOptions = SOURCE_OPTIONS.filter(o => o.value !== '');

  const statusFormOptions = LEAD_STATUS_OPTIONS.filter(o => o.value !== '');

  return (
    <div>
      <PageHeader
        title="Заявки"
        subtitle={`Всего: ${leads.length}`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Новая заявка
          </Button>
        }
      />

      {/* Filters */}
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-gray-400 hidden sm:block" />
          <Select
            options={LEAD_STATUS_OPTIONS}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full sm:w-48"
          />
          <Select
            options={SOURCE_OPTIONS}
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="w-full sm:w-48"
          />
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Loader />
      ) : leads.length === 0 ? (
        <EmptyState message="Нет заявок" />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-3 font-medium text-gray-500">Клиент</th>
                  <th className="text-left p-3 font-medium text-gray-500">Телефон</th>
                  <th className="text-left p-3 font-medium text-gray-500">Дата</th>
                  <th className="text-left p-3 font-medium text-gray-500">Гости</th>
                  <th className="text-left p-3 font-medium text-gray-500">Тип</th>
                  <th className="text-left p-3 font-medium text-gray-500">Источник</th>
                  <th className="text-left p-3 font-medium text-gray-500">Статус</th>
                  <th className="text-left p-3 font-medium text-gray-500">Ответственный</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const st = LEAD_STATUS_LABELS[lead.status] || { label: lead.status, color: 'gray' };
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => openEdit(lead)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="p-3 font-medium text-gray-900">{lead.client_name || '—'}</td>
                      <td className="p-3 text-gray-600">{lead.client_phone || '—'}</td>
                      <td className="p-3 text-gray-600">{formatDate(lead.desired_date)}</td>
                      <td className="p-3 text-gray-600">{lead.guest_count || '—'}</td>
                      <td className="p-3 text-gray-600">{lead.event_type || '—'}</td>
                      <td className="p-3 text-gray-600">{SOURCE_LABELS[lead.source] || lead.source || '—'}</td>
                      <td className="p-3">
                        <Badge color={st.color}>{st.label}</Badge>
                      </td>
                      <td className="p-3 text-gray-600">{lead.assigned_name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {leads.map(lead => {
              const st = LEAD_STATUS_LABELS[lead.status] || { label: lead.status, color: 'gray' };
              return (
                <Card
                  key={lead.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openEdit(lead)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{lead.client_name || '—'}</p>
                      <p className="text-xs text-gray-500">{lead.client_phone || '—'}</p>
                    </div>
                    <Badge color={st.color}>{st.label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                    <span>Дата: {formatDate(lead.desired_date)}</span>
                    <span>Гостей: {lead.guest_count || '—'}</span>
                    <span>Тип: {lead.event_type || '—'}</span>
                    <span>Источник: {SOURCE_LABELS[lead.source] || '—'}</span>
                  </div>
                  {lead.assigned_name && (
                    <p className="text-xs text-gray-400 mt-2">Ответственный: {lead.assigned_name}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingLead ? 'Редактировать заявку' : 'Новая заявка'}
      >
        <div className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          {/* Client selection */}
          <div>
            <Select
              label="Клиент"
              options={clientOptions}
              value={form.client_id}
              onChange={e => updateForm('client_id', e.target.value)}
            />
            {!showNewClient ? (
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="text-xs text-primary-600 hover:text-primary-700 mt-1"
              >
                + Создать нового клиента
              </button>
            ) : (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
                <p className="text-xs font-medium text-gray-600">Новый клиент</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Имя"
                    value={newClient.name}
                    onChange={e => setNewClient(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Телефон"
                    value={newClient.phone}
                    onChange={e => setNewClient(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateClient} disabled={creatingClient}>
                    {creatingClient ? 'Создание...' : 'Создать'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewClient(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Желаемая дата"
              type="date"
              value={form.desired_date}
              onChange={e => updateForm('desired_date', e.target.value)}
            />
            <Input
              label="Кол-во гостей"
              type="number"
              min="1"
              value={form.guest_count}
              onChange={e => updateForm('guest_count', e.target.value)}
            />
          </div>

          <Select
            label="Тип мероприятия"
            options={eventTypeOptions}
            value={form.event_type}
            onChange={e => updateForm('event_type', e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Источник"
              options={[{ value: '', label: 'Не указан' }, ...sourceFormOptions]}
              value={form.source}
              onChange={e => updateForm('source', e.target.value)}
            />
            <Select
              label="Статус"
              options={statusFormOptions}
              value={form.status}
              onChange={e => updateForm('status', e.target.value)}
            />
          </div>

          <Select
            label="Ответственный"
            options={userOptions}
            value={form.assigned_to}
            onChange={e => updateForm('assigned_to', e.target.value)}
          />

          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={e => updateForm('comment', e.target.value)}
            placeholder="Дополнительная информация..."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : (editingLead ? 'Сохранить' : 'Создать')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

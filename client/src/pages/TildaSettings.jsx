import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Badge } from '../components/UI';
import { Globe, Link2, Unlink, CheckCircle, AlertCircle, RefreshCw, Copy, Key, FileText, Settings } from 'lucide-react';

export default function TildaSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [mapping, setMapping] = useState({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api.tildaStatus();
      setStatus(data);
      if (data.field_mapping) setMapping(data.field_mapping);
      if (data.connected) {
        const subs = await api.tildaSubmissions({ limit: 20 });
        setSubmissions(subs);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup() {
    setConnecting(true);
    setError('');
    try {
      const data = await api.tildaSetup();
      setMessage('Интеграция подключена! Скопируйте URL вебхука и вставьте в настройки Tilda.');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Отключить интеграцию с Tilda? Новые заявки перестанут поступать.')) return;
    try {
      await api.tildaDisconnect();
      setMessage('Интеграция отключена');
      setStatus({ connected: false });
      setSubmissions([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRegenerateKey() {
    if (!confirm('Сгенерировать новый API-ключ? Старый URL перестанет работать — нужно будет обновить его в Tilda.')) return;
    try {
      await api.tildaRegenerateKey();
      setMessage('Новый ключ сгенерирован. Обновите URL вебхука в Tilda!');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveMapping() {
    setSavingMapping(true);
    setError('');
    try {
      await api.tildaUpdateMapping(mapping);
      setMessage('Маппинг полей сохранён');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMapping(false);
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  function maskKey(key) {
    if (!key) return '';
    return key.substring(0, 8) + '••••••••' + key.substring(key.length - 4);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Настройки"
        subtitle="Tilda / Сайт"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Link
          to="/settings/google"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Google Calendar
        </Link>
        <Link
          to="/settings/instagram"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Instagram DM
        </Link>
        <Link
          to="/settings/telegram"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Telegram Bot
        </Link>
        <Link
          to="/settings/tilda"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white"
        >
          Tilda / Сайт
        </Link>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle size={16} />
          {message}
          <button onClick={() => setMessage('')} className="ml-auto text-green-500 hover:text-green-700">&times;</button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Connection Status */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status?.connected ? 'bg-purple-100' : 'bg-gray-100'}`}>
            <Globe size={24} className={status?.connected ? 'text-purple-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Tilda / Сайт</h3>
              <Badge color={status?.connected ? 'green' : 'gray'}>
                {status?.connected ? 'Подключено' : 'Не подключено'}
              </Badge>
            </div>
            {status?.connected ? (
              <div className="space-y-1">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <FileText size={14} />
                    Заявок: <span className="font-medium text-gray-700">{status.submission_count}</span>
                  </span>
                  {status.last_submission_at && (
                    <span>Последняя: {new Date(status.last_submission_at).toLocaleString('ru-RU')}</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Подключите интеграцию с Tilda для автоматического приёма заявок с сайта.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <Button onClick={loadStatus}>
                  <RefreshCw size={16} />
                  Обновить
                </Button>
                <Button variant="danger" onClick={handleDisconnect}>
                  <Unlink size={16} />
                  Отключить
                </Button>
              </>
            ) : (
              <Button onClick={handleSetup} disabled={connecting}>
                <Link2 size={16} />
                {connecting ? 'Подключение...' : 'Подключить'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Webhook URL & API Key (when connected) */}
      {status?.connected && (
        <Card className="p-6 mt-4">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Link2 size={18} />
            URL вебхука
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL (вставьте в Tilda)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={status.webhook_url}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono text-gray-700"
                />
                <Button onClick={() => copyToClipboard(status.webhook_url, 'url')}>
                  {copied === 'url' ? <CheckCircle size={16} className="text-green-600" /> : <Copy size={16} />}
                  {copied === 'url' ? 'Скопировано' : 'Копировать'}
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API-ключ</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={maskKey(status.api_key)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono text-gray-500"
                />
                <Button onClick={() => copyToClipboard(status.api_key, 'key')}>
                  {copied === 'key' ? <CheckCircle size={16} className="text-green-600" /> : <Copy size={16} />}
                  {copied === 'key' ? 'Скопировано' : 'Копировать'}
                </Button>
                <Button variant="secondary" onClick={handleRegenerateKey}>
                  <Key size={16} />
                  Новый ключ
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Field Mapping (when connected) */}
      {status?.connected && (
        <Card className="p-6 mt-4">
          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Settings size={18} />
            Маппинг полей
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Укажите названия полей из вашей формы в Tilda. Откройте форму в редакторе Tilda → нажмите на поле → скопируйте название из &laquo;Имя переменной&raquo;.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: 'name', label: 'Имя *', placeholder: 'Name' },
              { key: 'phone', label: 'Телефон', placeholder: 'Phone' },
              { key: 'email', label: 'Email', placeholder: 'Email' },
              { key: 'comment', label: 'Комментарий', placeholder: 'comment' },
              { key: 'event_type', label: 'Тип мероприятия', placeholder: 'не задано' },
              { key: 'desired_date', label: 'Желаемая дата', placeholder: 'не задано' },
              { key: 'guest_count', label: 'Кол-во гостей', placeholder: 'не задано' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={mapping[key] || ''}
                  onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button onClick={handleSaveMapping} disabled={savingMapping}>
              {savingMapping ? 'Сохранение...' : 'Сохранить маппинг'}
            </Button>
          </div>
        </Card>
      )}

      {/* Recent Submissions (when connected) */}
      {status?.connected && submissions.length > 0 && (
        <Card className="p-6 mt-4">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} />
            Последние заявки
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Дата</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Клиент</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Телефон</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Форма</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-600">
                      {new Date(s.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 px-3 font-medium text-gray-900">{s.client_name || '—'}</td>
                    <td className="py-2 px-3 text-gray-600">{s.client_phone || '—'}</td>
                    <td className="py-2 px-3 text-gray-500">{s.formname || '—'}</td>
                    <td className="py-2 px-3">
                      <Badge color={s.status === 'processed' ? 'green' : s.status === 'duplicate' ? 'yellow' : 'red'}>
                        {s.status === 'processed' ? 'Обработано' : s.status === 'duplicate' ? 'Дубликат' : 'Ошибка'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card className="p-6 mt-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {status?.connected ? '📖 Как настроить в Tilda' : '📖 Инструкция по подключению'}
        </h3>
        <ol className="space-y-3 text-sm text-gray-600">
          {!status?.connected && (
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">1</span>
              <span>Нажмите кнопку <strong>&laquo;Подключить&raquo;</strong> выше — система сгенерирует URL и API-ключ</span>
            </li>
          )}
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">{status?.connected ? '1' : '2'}</span>
            <span>В Tilda откройте блок с формой → <strong>Контент</strong> → нажмите на форму → <strong>Приёмщик данных (Сбор данных)</strong></span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">{status?.connected ? '2' : '3'}</span>
            <span>Добавьте &laquo;<strong>Webhook</strong>&raquo; и вставьте URL вебхука (скопируйте выше)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">{status?.connected ? '3' : '4'}</span>
            <span>Опубликуйте страницу и отправьте тестовую заявку</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">{status?.connected ? '4' : '5'}</span>
            <span>Проверьте, что заявка появилась в CRM (раздел <strong>Заявки</strong>) и в таблице выше</span>
          </li>
        </ol>
        {status?.connected && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <strong>Совет:</strong> Если названия полей в Tilda отличаются от стандартных — настройте маппинг выше.
            В Tilda: откройте форму → нажмите на поле → посмотрите &laquo;Имя переменной&raquo; (Variable Name).
          </div>
        )}
      </Card>

      {/* Features Info */}
      <Card className="p-6 mt-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Возможности интеграции</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: '📥', title: 'Автоматический приём заявок', desc: 'Заполненные формы на сайте автоматически создают клиента и лид в CRM' },
            { icon: '🔔', title: 'Telegram уведомления', desc: 'Менеджеры мгновенно получают уведомление в Telegram о новой заявке' },
            { icon: '👤', title: 'Умная дедупликация', desc: 'Если клиент с таким телефоном уже есть — заявка привязывается к существующему клиенту' },
            { icon: '🔒', title: 'Защита API-ключом', desc: 'Только ваш сайт может отправлять заявки — все запросы проверяются по ключу' },
          ].map((f, i) => (
            <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <h4 className="text-sm font-medium text-gray-900">{f.title}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

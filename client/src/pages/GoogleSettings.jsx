import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Badge } from '../components/UI';
import { Calendar, RefreshCw, Link2, Unlink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function GoogleSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadStatus();
    // Handle OAuth redirect params
    if (searchParams.get('connected') === 'true') {
      setMessage('Google Calendar успешно подключён!');
      setSearchParams({});
    }
    if (searchParams.get('error')) {
      setError('Ошибка подключения Google. Попробуйте ещё раз.');
      setSearchParams({});
    }
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api.googleStatus();
      setStatus(data);
      if (data.connected) {
        loadCalendars();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendars() {
    setLoadingCalendars(true);
    try {
      const data = await api.googleCalendars();
      setCalendars(data);
    } catch {
      // May fail if token is invalid
    } finally {
      setLoadingCalendars(false);
    }
  }

  async function handleConnect() {
    try {
      const { url } = await api.googleAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setError('');
    try {
      const result = await api.googleSync();
      setSyncResult(result.stats);
      setMessage(`Синхронизация завершена! Добавлено: ${result.stats.added}, обновлено: ${result.stats.updated}`);
    } catch (err) {
      if (err.message.includes('истёк')) {
        setStatus({ connected: false });
        setError('Токен Google истёк. Подключите заново.');
      } else {
        setError(err.message);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleSelectCalendar(calendarId) {
    try {
      await api.googleSelectCalendar(calendarId);
      setStatus(prev => ({ ...prev, calendar_id: calendarId }));
      setMessage('Календарь выбран');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Отключить Google Calendar? Импортированные события останутся в системе.')) return;
    try {
      await api.googleDisconnect();
      setStatus({ connected: false });
      setCalendars([]);
      setMessage('Google Calendar отключён');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Настройки"
        subtitle="Интеграция с Google Calendar"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Link
          to="/settings/google"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white"
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
      </div>

      {message && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle size={16} />
          {message}
          <button onClick={() => setMessage('')} className="ml-auto text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Connection status */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status?.connected ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Calendar size={24} className={status?.connected ? 'text-green-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Google Calendar</h3>
              <Badge color={status?.connected ? 'green' : 'gray'}>
                {status?.connected ? 'Подключён' : 'Не подключён'}
              </Badge>
            </div>
            {status?.connected ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-500">
                  Аккаунт: <span className="font-medium text-gray-700">{status.email}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Календарь: <span className="font-medium text-gray-700">{status.calendar_id || 'primary'}</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Подключите Google Calendar для импорта событий в систему бронирований.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <Button onClick={handleSync} disabled={syncing}>
                  <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Синхронизация...' : 'Синхронизировать'}
                </Button>
                <Button variant="danger" onClick={handleDisconnect}>
                  <Unlink size={16} />
                  Отключить
                </Button>
              </>
            ) : (
              <Button onClick={handleConnect}>
                <Link2 size={16} />
                Подключить Google Calendar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Sync results */}
      {syncResult && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Результат синхронизации</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">{syncResult.total}</p>
              <p className="text-xs text-blue-500 mt-1">Всего событий</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-700">{syncResult.added}</p>
              <p className="text-xs text-green-500 mt-1">Новых</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-700">{syncResult.updated}</p>
              <p className="text-xs text-yellow-500 mt-1">Обновлено</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{syncResult.deleted}</p>
              <p className="text-xs text-gray-500 mt-1">Удалено</p>
            </div>
          </div>
        </Card>
      )}

      {/* Calendar selection */}
      {status?.connected && calendars.length > 0 && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Выбор календаря</h4>
          <p className="text-xs text-gray-500 mb-3">Выберите, из какого Google-календаря импортировать события:</p>
          <div className="space-y-2">
            {calendars.map(cal => (
              <div
                key={cal.id}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  (status.calendar_id || 'primary') === cal.id
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => handleSelectCalendar(cal.id)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cal.backgroundColor || '#8b5cf6' }}
                  />
                  <span className="text-sm font-medium text-gray-800">{cal.summary}</span>
                  {cal.primary && <Badge color="blue">Основной</Badge>}
                </div>
                {(status.calendar_id || 'primary') === cal.id && (
                  <CheckCircle size={18} className="text-primary-600" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Setup Instructions */}
      {!status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">📋 Инструкция по настройке</h4>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-gray-800">Создайте проект в Google Cloud Console</p>
                <p className="text-gray-500 mt-0.5">
                  Перейдите на{' '}
                  <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                    console.cloud.google.com
                  </a>
                  {' '}и создайте новый проект (или используйте существующий).
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-gray-800">Включите Google Calendar API</p>
                <p className="text-gray-500 mt-0.5">
                  В разделе «APIs & Services» → «Library» найдите «Google Calendar API» и нажмите «Enable».
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-gray-800">Создайте OAuth 2.0 credentials</p>
                <p className="text-gray-500 mt-0.5">
                  В «APIs & Services» → «Credentials» → «Create Credentials» → «OAuth client ID».<br />
                  Тип: Web application.<br />
                  Authorized redirect URI: <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">http://localhost:3001/api/google/callback</code>
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium text-gray-800">Добавьте ключи в .env</p>
                <p className="text-gray-500 mt-0.5">
                  Скопируйте Client ID и Client Secret в файл <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">.env</code> в корне проекта:
                </p>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs font-mono text-gray-700 overflow-x-auto">
{`GOOGLE_CLIENT_ID=ваш-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ваш-client-secret`}
                </pre>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">5</span>
              <div>
                <p className="font-medium text-gray-800">Настройте OAuth Consent Screen</p>
                <p className="text-gray-500 mt-0.5">
                  В «OAuth consent screen» выберите «External», заполните название приложения.<br />
                  Добавьте свой email в «Test users».<br />
                  Scopes: <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">calendar.readonly</code> и <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">userinfo.email</code>
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">6</span>
              <div>
                <p className="font-medium text-gray-800">Перезапустите сервер и нажмите «Подключить»</p>
                <p className="text-gray-500 mt-0.5">
                  После сохранения .env перезапустите сервер и нажмите кнопку «Подключить Google Calendar» выше.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Info about how it works */}
      <Card className="mt-4 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">ℹ️ Как это работает</h4>
        <ul className="space-y-1.5 text-sm text-gray-500">
          <li>• Импорт событий идёт <strong>только из Google в Эйфорию</strong> (чтение)</li>
          <li>• Мы <strong>никогда не изменяем</strong> ваш Google Calendar</li>
          <li>• Google-события отображаются <strong>фиолетовым цветом</strong> в календаре</li>
          <li>• При синхронизации загружаются события за последние 30 дней и на 90 дней вперёд</li>
          <li>• Нажмите «Синхронизировать» для обновления данных</li>
        </ul>
      </Card>
    </div>
  );
}

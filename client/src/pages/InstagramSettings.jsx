import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Badge } from '../components/UI';
import { MessageCircle, Link2, Unlink, CheckCircle, AlertCircle, RefreshCw, Copy } from 'lucide-react';

export default function InstagramSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadStatus();
    // Handle OAuth redirect params
    if (searchParams.get('connected') === 'true') {
      setMessage('Instagram успешно подключён!');
      setSearchParams({});
    }
    if (searchParams.get('error')) {
      setError('Ошибка подключения Instagram: ' + (searchParams.get('error') || 'Попробуйте ещё раз.'));
      setSearchParams({});
    }
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api.instagramStatus();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const { url } = await api.instagramAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Отключить Instagram DM? Сохранённая переписка останется в системе.')) return;
    try {
      await api.instagramDisconnect();
      setStatus({ connected: false });
      setMessage('Instagram отключён');
    } catch (err) {
      setError(err.message);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      setMessage('Скопировано в буфер обмена');
    }).catch(() => {
      setError('Не удалось скопировать');
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const webhookUrl = `${window.location.origin.replace(':5173', ':3001')}/api/instagram/webhook`;

  return (
    <div>
      <PageHeader
        title="Настройки"
        subtitle="Интеграция с Instagram DM"
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
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white"
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
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Tilda / Сайт
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
            <MessageCircle size={24} className={status?.connected ? 'text-green-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Instagram DM</h3>
              <Badge color={status?.connected ? 'green' : 'gray'}>
                {status?.connected ? 'Подключён' : 'Не подключён'}
              </Badge>
            </div>
            {status?.connected ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-500">
                  Instagram: <span className="font-medium text-gray-700">@{status.ig_username}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Facebook Page: <span className="font-medium text-gray-700">{status.page_name}</span>
                </p>
                {status.updated_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Подключён: {new Date(status.updated_at).toLocaleString('ru-RU')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Подключите Instagram для приёма сообщений из Direct в CRM.
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
              <Button onClick={handleConnect}>
                <Link2 size={16} />
                Подключить Instagram
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Webhook info (only when connected) */}
      {status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Webhook для Meta Dashboard</h4>
          <p className="text-xs text-gray-500 mb-3">
            Скопируйте эти данные в Meta App → Webhooks → Instagram → подписка на <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">messages</code>
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Callback URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono text-gray-700 overflow-x-auto">
                  {webhookUrl}
                </code>
                <Button variant="ghost" onClick={() => copyToClipboard(webhookUrl)}>
                  <Copy size={16} />
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Verify Token</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono text-gray-700 overflow-x-auto">
                  {status.webhook_verify_token}
                </code>
                <Button variant="ghost" onClick={() => copyToClipboard(status.webhook_verify_token)}>
                  <Copy size={16} />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Setup Instructions (only when NOT connected) */}
      {!status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Инструкция по настройке</h4>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-gray-800">Создайте Meta App</p>
                <p className="text-gray-500 mt-0.5">
                  Перейдите на{' '}
                  <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                    developers.facebook.com
                  </a>
                  {' '}и создайте новое приложение с типом <strong>Business</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-gray-800">Добавьте продукты</p>
                <p className="text-gray-500 mt-0.5">
                  В настройках приложения добавьте продукты: <strong>Facebook Login</strong> и <strong>Instagram</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-gray-800">Настройте Redirect URI</p>
                <p className="text-gray-500 mt-0.5">
                  В <strong>Facebook Login → Settings</strong> добавьте redirect URI:
                </p>
                <code className="mt-1 inline-block px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">
                  http://localhost:3001/api/instagram/callback
                </code>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium text-gray-800">Скопируйте App ID и App Secret в .env</p>
                <p className="text-gray-500 mt-0.5">
                  В <strong>App Settings → Basic</strong> скопируйте App ID и App Secret в файл <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">.env</code> в корне проекта:
                </p>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs font-mono text-gray-700 overflow-x-auto">
{`META_APP_ID=ваш-app-id
META_APP_SECRET=ваш-app-secret`}
                </pre>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">5</span>
              <div>
                <p className="font-medium text-gray-800">Настройте OAuth Consent</p>
                <p className="text-gray-500 mt-0.5">
                  Добавьте себя в <strong>Test users</strong> в настройках приложения.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">6</span>
              <div>
                <p className="font-medium text-gray-800">Перезапустите сервер и нажмите «Подключить Instagram»</p>
                <p className="text-gray-500 mt-0.5">
                  После сохранения .env перезапустите сервер и нажмите кнопку «Подключить Instagram» выше.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">7</span>
              <div>
                <p className="font-medium text-gray-800">Настройте Webhooks (после подключения)</p>
                <p className="text-gray-500 mt-0.5">
                  В Meta App → <strong>Webhooks</strong> → <strong>Instagram</strong> → подпишитесь на <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">messages</code>, используя Callback URL и Verify Token, которые появятся на этой странице после подключения.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Info about how it works */}
      <Card className="mt-4 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Как это работает</h4>
        <ul className="space-y-1.5 text-sm text-gray-500">
          <li>• Входящие DM <strong>автоматически создают лид и клиента</strong> в CRM</li>
          <li>• Переписка сохраняется в разделе <strong>«Instagram DM»</strong></li>
          <li>• Менеджеры могут <strong>отвечать прямо из CRM</strong></li>
          <li>• Мы <strong>никогда не публикуем посты</strong> и не меняем настройки вашего Instagram</li>
        </ul>
      </Card>
    </div>
  );
}
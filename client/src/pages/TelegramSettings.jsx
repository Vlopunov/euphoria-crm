import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api';
import { Card, PageHeader, Button, Input, Textarea, Badge } from '../components/UI';
import { Bot, Link2, Unlink, CheckCircle, AlertCircle, RefreshCw, Users, MessageSquare, Send } from 'lucide-react';

export default function TelegramSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await api.telegramStatus();
      setStatus(data);
      if (data.welcome_message) setWelcomeMsg(data.welcome_message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!token.trim()) {
      setError('Введите токен бота');
      return;
    }
    setConnecting(true);
    setError('');
    try {
      const result = await api.telegramSetup(token.trim());
      setMessage(`Бот @${result.bot_username} успешно подключён!`);
      setToken('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Отключить Telegram бот? Переписки и заявки останутся в системе.')) return;
    try {
      await api.telegramDisconnect();
      setStatus({ connected: false });
      setMessage('Telegram бот отключён');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveWelcome() {
    setSavingWelcome(true);
    try {
      await api.telegramUpdateWelcome(welcomeMsg);
      setMessage('Приветственное сообщение обновлено');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingWelcome(false);
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
        subtitle="Telegram Bot"
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
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white"
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
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status?.connected ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Bot size={24} className={status?.connected ? 'text-blue-600' : 'text-gray-400'} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Telegram Bot</h3>
              <Badge color={status?.connected ? 'green' : 'gray'}>
                {status?.connected ? 'Подключён' : 'Не подключён'}
              </Badge>
            </div>
            {status?.connected ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-500">
                  Бот: <a href={`https://t.me/${status.bot_username}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">@{status.bot_username}</a>
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    Сотрудников: <span className="font-medium text-gray-700">{status.linked_staff}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={14} />
                    Переписок: <span className="font-medium text-gray-700">{status.conversations}</span>
                  </span>
                </div>
                {status.updated_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Подключён: {new Date(status.updated_at).toLocaleString('ru-RU')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Подключите Telegram бот для приёма заявок и уведомлений команде.
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
            ) : null}
          </div>
        </div>
      </Card>

      {/* Connect form (only when NOT connected) */}
      {!status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Подключить бот</h4>
          <div className="flex gap-3">
            <Input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Вставьте токен от @BotFather"
              className="flex-1"
            />
            <Button onClick={handleConnect} disabled={connecting}>
              <Link2 size={16} />
              {connecting ? 'Подключение...' : 'Подключить'}
            </Button>
          </div>
        </Card>
      )}

      {/* Welcome message editor (only when connected) */}
      {status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Приветственное сообщение</h4>
          <p className="text-xs text-gray-500 mb-3">
            Это сообщение увидят клиенты при первом запуске бота (/start).
          </p>
          <Textarea
            value={welcomeMsg}
            onChange={e => setWelcomeMsg(e.target.value)}
            placeholder="Добро пожаловать в Эйфория Room!"
            rows={4}
          />
          <div className="flex justify-end mt-3">
            <Button onClick={handleSaveWelcome} disabled={savingWelcome}>
              {savingWelcome ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </Card>
      )}

      {/* Staff linking instructions (when connected) */}
      {status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Привязка аккаунтов сотрудников</h4>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-gray-800">Откройте бот</p>
                <p className="text-gray-500 mt-0.5">
                  Перейдите в{' '}
                  <a href={`https://t.me/${status.bot_username}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    @{status.bot_username}
                  </a>{' '}
                  в Telegram.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-gray-800">Привяжите аккаунт</p>
                <p className="text-gray-500 mt-0.5">
                  Отправьте команду: <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">/link ваш_email ваш_пароль</code>
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Сообщение с паролем будет автоматически удалено из чата.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-gray-800">Готово!</p>
                <p className="text-gray-500 mt-0.5">
                  После привязки сотрудник получает доступ к командам <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">/today</code>, <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">/week</code>, <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">/stats</code> и будет получать уведомления о новых бронях и оплатах.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Setup instructions (when NOT connected) */}
      {!status?.connected && (
        <Card className="mt-4 p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Инструкция по настройке</h4>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-gray-800">Создайте бот в Telegram</p>
                <p className="text-gray-500 mt-0.5">
                  Напишите{' '}
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                    @BotFather
                  </a>
                  {' '}в Telegram и отправьте команду <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">/newbot</code>.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-gray-800">Задайте имя и username бота</p>
                <p className="text-gray-500 mt-0.5">
                  Например: <strong>Эйфория Room</strong> и <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">euphoria_room_bot</code>
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-gray-800">Скопируйте токен</p>
                <p className="text-gray-500 mt-0.5">
                  BotFather выдаст токен вида <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">123456:ABC-DEF1234...</code>
                  <br />Вставьте его в поле выше и нажмите «Подключить».
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* How it works */}
      <Card className="mt-4 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Возможности бота</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
          <div>
            <p className="font-medium text-gray-700 mb-1.5">Для клиентов:</p>
            <ul className="space-y-1">
              <li>• Просмотр свободных дат и тарифов</li>
              <li>• Онлайн-заявка на бронирование</li>
              <li>• Автоматическое создание лида в CRM</li>
              <li>• Связь с менеджером через бот</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1.5">Для команды:</p>
            <ul className="space-y-1">
              <li>• Уведомления о новых бронях и оплатах</li>
              <li>• Расписание на сегодня / завтра / неделю</li>
              <li>• Мини-дашборд с ключевыми метриками</li>
              <li>• Поиск клиентов по имени и телефону</li>
              <li>• Утренний брифинг (09:00) и вечернее напоминание (20:00)</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

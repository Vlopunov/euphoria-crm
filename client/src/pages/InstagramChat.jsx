import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, ArrowLeft, User, MessageCircle, ExternalLink } from 'lucide-react';
import { Card, PageHeader, Button, Input, Badge, Loader, EmptyState } from '../components/UI';
import { api } from '../api/api';
import { useAuth } from '../context/AuthContext';

const LEAD_STATUS_COLORS = {
  new: 'blue',
  in_progress: 'yellow',
  proposal_sent: 'purple',
  waiting_response: 'orange',
  confirmed: 'green',
  rejected: 'red',
  no_response: 'gray',
};

const LEAD_STATUS_NAMES = {
  new: 'Новый лид',
  in_progress: 'В работе',
  proposal_sent: 'Предложение',
  waiting_response: 'Ожидаем ответ',
  confirmed: 'Подтверждено',
  rejected: 'Отказ',
  no_response: 'Не отвечает',
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'сейчас';
  if (diffMin < 60) return `${diffMin} мин`;
  if (diffHours < 24) return `${diffHours} ч`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'вчера';

  if (diffDays < 365) {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export default function InstagramChat() {
  const { user } = useAuth();

  const [connected, setConnected] = useState(null);
  const [loading, setLoading] = useState(true);

  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Check Instagram connection status
  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await api.instagramStatus();
        setConnected(status.connected);
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!connected) return;
    try {
      const data = await api.instagramConversations();
      setConversations(data);
    } catch (err) {
      console.error('Ошибка загрузки переписок:', err);
    }
  }, [connected]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Poll conversations every 15s
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [connected, loadConversations]);

  // Load selected conversation messages
  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    try {
      const data = await api.instagramConversation(selectedId);
      setConversation(data);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      setLoadingMessages(true);
      loadMessages().finally(() => setLoadingMessages(false));
    } else {
      setConversation(null);
      setMessages([]);
    }
  }, [selectedId, loadMessages]);

  // Poll messages every 10s
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [selectedId, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [replyText]);

  // Select conversation
  function handleSelectConversation(id) {
    setSelectedId(id);
    setReplyText('');
  }

  // Go back (mobile)
  function handleBack() {
    setSelectedId(null);
    setConversation(null);
    setMessages([]);
  }

  // Send reply
  async function handleSend() {
    if (!replyText.trim() || sending || !selectedId) return;
    setSending(true);
    try {
      const savedMsg = await api.instagramReply(selectedId, replyText.trim());
      setMessages(prev => [...prev, savedMsg]);
      setReplyText('');
      // Update last message in conversation list
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedId
            ? { ...c, last_message: replyText.trim(), last_message_at: new Date().toISOString() }
            : c
        )
      );
    } catch (err) {
      console.error('Ошибка отправки:', err);
    } finally {
      setSending(false);
    }
  }

  // Handle Ctrl+Enter
  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Filter conversations
  const filtered = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.ig_username && c.ig_username.toLowerCase().includes(q)) ||
      (c.client_name && c.client_name.toLowerCase().includes(q))
    );
  });

  // Loading state
  if (loading) return <Loader />;

  // Not connected state
  if (!connected) {
    return (
      <div>
        <PageHeader title="Instagram Direct" subtitle="Переписки с клиентами из Instagram" />
        <Card className="p-6">
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <MessageCircle size={28} className="text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Instagram не подключён</h3>
            <p className="text-sm text-gray-500 mb-4 max-w-md">
              Подключите Instagram для получения и отправки сообщений прямо из CRM.
            </p>
            <Link to="/settings/instagram">
              <Button>
                <ExternalLink size={16} />
                Перейти в настройки
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Determine if we show chat on mobile (conversation selected)
  const showChatMobile = selectedId !== null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Instagram Direct" subtitle="Переписки с клиентами из Instagram" />

      <div className="flex-1 flex min-h-0 gap-0 md:gap-4">
        {/* Left Panel - Conversation List */}
        <div
          className={`
            ${showChatMobile ? 'hidden md:flex' : 'flex'}
            flex-col w-full md:w-80 lg:w-96 flex-shrink-0
          `}
        >
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
              <Input
                placeholder="Поиск по имени или username..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <EmptyState
                  message={
                    search
                      ? 'Ничего не найдено'
                      : 'Нет переписок. Входящие DM из Instagram появятся здесь автоматически.'
                  }
                />
              ) : (
                <div className="divide-y divide-gray-50">
                  {filtered.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50
                        ${selectedId === conv.id ? 'bg-purple-50 hover:bg-purple-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                          <User size={18} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900 truncate">
                              @{conv.ig_username || 'unknown'}
                            </span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {formatRelativeTime(conv.last_message_at)}
                            </span>
                          </div>
                          {conv.client_name && (
                            <p className="text-xs text-gray-500 truncate">{conv.client_name}</p>
                          )}
                          {conv.last_message && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {truncate(conv.last_message, 50)}
                            </p>
                          )}
                        </div>
                        {conv.unread_count > 0 && (
                          <span className="flex-shrink-0 w-5 h-5 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Panel - Chat */}
        <div
          className={`
            ${showChatMobile ? 'flex' : 'hidden md:flex'}
            flex-col flex-1 min-w-0
          `}
        >
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {!selectedId ? (
              /* No conversation selected */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle size={28} className="text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-sm">Выберите переписку слева</p>
                </div>
              </div>
            ) : loadingMessages && messages.length === 0 ? (
              <Loader />
            ) : (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  {/* Back button (mobile) */}
                  <button
                    onClick={handleBack}
                    className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700"
                  >
                    <ArrowLeft size={20} />
                  </button>

                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {conversation?.client_id ? (
                        <Link
                          to={`/clients/${conversation.client_id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors truncate"
                        >
                          {conversation.client_name || 'Клиент'}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {conversation?.client_name || conversation?.ig_name || 'Пользователь'}
                        </span>
                      )}
                      {conversation?.lead_status && (
                        <Badge color={LEAD_STATUS_COLORS[conversation.lead_status] || 'gray'}>
                          {LEAD_STATUS_NAMES[conversation.lead_status] || conversation.lead_status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      @{conversation?.ig_username || 'unknown'}
                    </p>
                  </div>

                  {conversation?.client_id && (
                    <Link
                      to={`/clients/${conversation.client_id}`}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Открыть карточку клиента"
                    >
                      <ExternalLink size={16} />
                    </Link>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-gray-400">Нет сообщений</p>
                    </div>
                  ) : (
                    messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] sm:max-w-[65%] px-3.5 py-2 rounded-2xl ${
                            msg.direction === 'outgoing'
                              ? 'bg-primary-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message_text}</p>
                          <div
                            className={`flex items-center gap-1.5 mt-1 ${
                              msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {msg.direction === 'outgoing' && msg.sender_name && (
                              <span
                                className={`text-xs ${
                                  msg.direction === 'outgoing' ? 'text-white/60' : 'text-gray-400'
                                }`}
                              >
                                {msg.sender_name}
                              </span>
                            )}
                            <span
                              className={`text-xs ${
                                msg.direction === 'outgoing' ? 'text-white/60' : 'text-gray-400'
                              }`}
                            >
                              {formatMessageTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Input */}
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Написать сообщение..."
                      rows={1}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none max-h-[120px]"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!replyText.trim() || sending}
                      className="flex-shrink-0"
                    >
                      <Send size={16} />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Ctrl+Enter для отправки</p>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

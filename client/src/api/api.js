const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('euphoria_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  };
  const res = await fetch(`${API_BASE}${path}`, config);
  if (res.status === 401) {
    localStorage.removeItem('euphoria_token');
    localStorage.removeItem('euphoria_user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),

  // Dashboard
  dashboard: () => request('/dashboard'),
  reports: (params) => request(`/dashboard/reports?${new URLSearchParams(params)}`),

  // Clients
  getClients: (params) => request(`/clients?${new URLSearchParams(params || {})}`),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),

  // Leads
  getLeads: (params) => request(`/leads?${new URLSearchParams(params || {})}`),
  getLead: (id) => request(`/leads/${id}`),
  createLead: (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLead: (id) => request(`/leads/${id}`, { method: 'DELETE' }),

  // Bookings
  getBookings: (params) => request(`/bookings?${new URLSearchParams(params || {})}`),
  getBooking: (id) => request(`/bookings/${id}`),
  getCalendarEvents: (params) => request(`/bookings/calendar?${new URLSearchParams(params || {})}`),
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  updateBooking: (id, data) => request(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBooking: (id) => request(`/bookings/${id}`, { method: 'DELETE' }),

  // Payments
  getPayments: (params) => request(`/payments?${new URLSearchParams(params || {})}`),
  getBookingPayments: (bookingId) => request(`/payments/booking/${bookingId}`),
  createPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: 'DELETE' }),

  // Add-ons
  getAddonCategories: () => request('/addons/categories'),
  getAddonServices: () => request('/addons/services'),
  createAddonService: (data) => request('/addons/services', { method: 'POST', body: JSON.stringify(data) }),
  updateAddonService: (id, data) => request(`/addons/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getBookingAddons: (bookingId) => request(`/addons/booking/${bookingId}`),
  addBookingAddon: (bookingId, data) => request(`/addons/booking/${bookingId}`, { method: 'POST', body: JSON.stringify(data) }),
  deleteBookingAddon: (id) => request(`/addons/booking-addon/${id}`, { method: 'DELETE' }),

  // Expenses
  getExpenseCategories: () => request('/expenses/categories'),
  getExpenses: (params) => request(`/expenses?${new URLSearchParams(params || {})}`),
  createExpense: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id, data) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params) => request(`/tasks?${new URLSearchParams(params || {})}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // Users
  getUsers: () => request('/users'),

  // Google Calendar
  googleStatus: () => request('/google/status'),
  googleAuthUrl: () => request('/google/auth'),
  googleCalendars: () => request('/google/calendars'),
  googleSelectCalendar: (calendar_id) => request('/google/calendar', { method: 'PUT', body: JSON.stringify({ calendar_id }) }),
  googleSync: () => request('/google/sync', { method: 'POST' }),
  googleDisconnect: () => request('/google/disconnect', { method: 'DELETE' }),
  googleEvents: (params) => request(`/google/events?${new URLSearchParams(params || {})}`),

  // Instagram DM
  instagramStatus: () => request('/instagram/status'),
  instagramAuthUrl: () => request('/instagram/auth'),
  instagramDisconnect: () => request('/instagram/disconnect', { method: 'DELETE' }),
  instagramConversations: () => request('/instagram/conversations'),
  instagramConversation: (id) => request(`/instagram/conversations/${id}`),
  instagramReply: (id, text) => request(`/instagram/conversations/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  instagramUnreadCount: () => request('/instagram/unread-count'),
};

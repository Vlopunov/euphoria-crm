import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Leads from './pages/Leads';
import CalendarPage from './pages/CalendarPage';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Addons from './pages/Addons';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Tasks from './pages/Tasks';
import GoogleSettings from './pages/GoogleSettings';
import InstagramSettings from './pages/InstagramSettings';
import InstagramChat from './pages/InstagramChat';
import TelegramSettings from './pages/TelegramSettings';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
      <Route path="/bookings/:id" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />
      <Route path="/addons" element={<ProtectedRoute><Addons /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/settings/google" element={<ProtectedRoute><GoogleSettings /></ProtectedRoute>} />
      <Route path="/settings/instagram" element={<ProtectedRoute><InstagramSettings /></ProtectedRoute>} />
      <Route path="/settings/telegram" element={<ProtectedRoute><TelegramSettings /></ProtectedRoute>} />
      <Route path="/instagram" element={<ProtectedRoute><InstagramChat /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

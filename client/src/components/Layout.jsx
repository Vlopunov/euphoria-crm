import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, FileText, Calendar, CreditCard,
  Package, Receipt, ListTodo, LogOut, Menu, X, ChevronDown, Settings, MessageCircle
} from 'lucide-react';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Дашборд' },
  { to: '/clients', icon: Users, label: 'Клиенты' },
  { to: '/leads', icon: FileText, label: 'Заявки' },
  { to: '/instagram', icon: MessageCircle, label: 'Instagram DM' },
  { to: '/calendar', icon: Calendar, label: 'Календарь' },
  { to: '/bookings', icon: Calendar, label: 'Брони' },
  { to: '/addons', icon: Package, label: 'Допы' },
  { to: '/expenses', icon: Receipt, label: 'Расходы' },
  { to: '/reports', icon: CreditCard, label: 'Отчёты' },
  { to: '/tasks', icon: ListTodo, label: 'Задачи' },
  { to: '/settings/google', icon: Settings, label: 'Настройки' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-xl font-bold text-primary-700">Эйфория</h1>
          <p className="text-xs text-gray-500 mt-0.5">CRM & Booking</p>
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {nav.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors
                  ${active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">{getRoleName(user?.role)}</p>
            </div>
            <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Выйти">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1">
            <Menu size={22} />
          </button>
          <h1 className="text-lg font-bold text-primary-700">Эйфория</h1>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function getRoleName(role) {
  const names = { owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', viewer: 'Просмотр' };
  return names[role] || role;
}

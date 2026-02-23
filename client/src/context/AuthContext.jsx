import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('euphoria_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('euphoria_token');
    if (token) {
      api.me().then(u => {
        setUser(u);
        localStorage.setItem('euphoria_user', JSON.stringify(u));
      }).catch(() => {
        setUser(null);
        localStorage.removeItem('euphoria_token');
        localStorage.removeItem('euphoria_user');
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    localStorage.setItem('euphoria_token', token);
    localStorage.setItem('euphoria_user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('euphoria_token');
    localStorage.removeItem('euphoria_user');
    setUser(null);
  };

  const can = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

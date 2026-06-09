import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('tss_token');
    const storedUser = localStorage.getItem('tss_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (token, user) => {
    localStorage.setItem('tss_token', token);
    localStorage.setItem('tss_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('tss_token');
    localStorage.removeItem('tss_user');
    setToken(null);
    setUser(null);
  };

  const isAdmin = !!user?.isAdmin;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

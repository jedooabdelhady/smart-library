import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = sessionStorage.getItem('library_auth');
    const admin = sessionStorage.getItem('library_admin');
    if (auth === 'true') {
      setIsAuthenticated(true);
      setIsAdmin(admin === 'true');
    }
    setLoading(false);
  }, []);

  const login = (passcode) => {
    if (passcode === '123456') {
      setIsAuthenticated(true);
      sessionStorage.setItem('library_auth', 'true');
      return true;
    }
    return false;
  };

  const adminLogin = (username, password) => {
    if (username === 'admin' && password === 'admin123') {
      setIsAdmin(true);
      setIsAuthenticated(true);
      sessionStorage.setItem('library_auth', 'true');
      sessionStorage.setItem('library_admin', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setIsAdmin(false);
    sessionStorage.removeItem('library_auth');
    sessionStorage.removeItem('library_admin');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAdmin, loading, login, adminLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

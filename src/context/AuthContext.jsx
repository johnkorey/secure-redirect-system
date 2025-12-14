import React, { createContext, useContext, useState, useEffect } from 'react';

// Detect backend URL dynamically - must match base44Client.js logic
function getBackendUrl() {
  // In production build, use relative URLs (same origin)
  // Since backend serves both frontend and API on same port
  if (import.meta.env.PROD) {
    console.log('[DEBUG] Production mode - using relative URLs');
    return '';
  }
  
  // In development, use proxy (relative URLs)
  return '';
}
const BACKEND_URL = getBackendUrl();

console.log('[DEBUG] BACKEND_URL set to:', BACKEND_URL || '(empty - relative URLs)');

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const authUrl = `${BACKEND_URL}/api/auth/me`;
          console.log('[DEBUG AUTH] Checking auth at:', authUrl || '/api/auth/me (relative)', 'BACKEND_URL:', BACKEND_URL);
          const response = await fetch(authUrl, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(storedToken);
          } else {
            localStorage.removeItem('token');
            setToken(null);
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const loginUrl = `${BACKEND_URL}/api/auth/login`;
    console.log('[DEBUG] Login attempt to:', loginUrl || '/api/auth/login (relative)');
    
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    console.log('[DEBUG] Login response:', {status: response.status, ok: response.ok});

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, full_name) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

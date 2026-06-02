import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Configure axios defaults
axios.defaults.withCredentials = true;

/* ===================== Axios 401 → silent refresh ===================== */
// PWA must never auto-logout while the user is actively working. When an
// API call returns 401 we:
//   1. Try POST /auth/refresh (uses the long-lived `refresh_token` cookie,
//      max-age=7 days).
//   2. If refresh succeeds → retry the original request transparently.
//   3. If refresh ALSO fails → fire the global `auth:expired` event so the
//      AuthProvider can flip the user to `false` and React Router redirects
//      to /login (only public routes are reachable when user === false).
// Requests in flight while a refresh is happening are queued so we don't
// fire 5 refresh calls in parallel.
let isRefreshing = false;
let refreshQueue = [];

const drainQueue = (error) => {
  refreshQueue.forEach((cb) => cb(error));
  refreshQueue = [];
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const isAuthEndpoint = (original.url || '').includes('/auth/');
    // Only act on 401 from a non-auth endpoint; auth endpoints handle their own errors
    if (status !== 401 || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }
    original._retry = true;
    if (isRefreshing) {
      // Queue this request until the in-flight refresh resolves
      return new Promise((resolve, reject) => {
        refreshQueue.push((err) => (err ? reject(err) : resolve(axios(original))));
      });
    }
    isRefreshing = true;
    try {
      await axios.post(`${API}/auth/refresh`);
      drainQueue(null);
      return axios(original);
    } catch (refreshErr) {
      drainQueue(refreshErr);
      // Notify the app — AuthProvider listens and flips user state
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = checking, false = not authenticated
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    // Listen for global auth-expired event fired by the axios interceptor
    const handleExpired = () => {
      // Show a single toast (deduplicate by id) so multiple inflight 401s
      // don't spam the user. Also: PWA users normally never see this because
      // their refresh_token is valid for 7 days and renews silently.
      toast.error('Session expired — please sign in again', { id: 'auth-expired' });
      setUser(false);
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
          navigator.clearAppBadge().catch(() => {});
        }
      } catch (_) { /* ignore */ }
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setUser(data);
    } catch (e) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    setUser(data);
    return data;
  };

  const register = async (email, password, name, organization_name, industry = 'education') => {
    const { data } = await axios.post(`${API}/auth/register`, {
      email,
      password,
      name,
      organization_name,
      industry,
    });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (e) {
      // ignore
    }
    // Clear the PWA app icon badge so a logged-out user doesn't see stale numbers
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
        navigator.clearAppBadge().catch(() => {});
      }
    } catch (_) {
      /* ignore */
    }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const formatApiErrorDetail = (detail) => {
  if (detail == null) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
};

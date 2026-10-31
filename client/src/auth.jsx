import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, subscription: null, ai: null, unread: 0, loading: !!getToken() });
  const [config, setConfig] = useState({ appName: 'Nyāya Grantha Sarvasvam', whatsappNumber: '', currency: 'INR' });

  const refresh = useCallback(async () => {
    if (!getToken()) return setState({ user: null, subscription: null, ai: null, unread: 0, loading: false });
    try {
      const me = await get('/auth/me');
      setState({ ...me, loading: false });
    } catch {
      setState({ user: null, subscription: null, ai: null, unread: 0, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    get('/config').then(setConfig).catch(() => {});
  }, [refresh]);

  const signIn = async (path, body) => {
    const { token } = await post(path, body);
    setToken(token);
    await refresh();
  };

  const value = {
    ...state,
    config,
    refresh,
    login: (email, password) => signIn('/auth/login', { email, password }),
    register: (data) => signIn('/auth/register', data),
    googleLogin: (credential) => signIn('/auth/google', { credential }),
    logout: () => {
      setToken(null);
      // Offline copies of texts may include this user's notes and bookmarks.
      if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      setState({ user: null, subscription: null, ai: null, unread: 0, loading: false }); },
    isStaff: ['admin', 'editor'].includes(state.user?.role),
    // Faculty run classes from the Faculty Desk; admins and editors may too.
    isFaculty: state.user?.user_type === 'faculty' || ['admin', 'editor'].includes(state.user?.role),
    isPremium: ['admin', 'editor'].includes(state.user?.role) || (!!state.subscription && state.subscription.plan_slug !== 'free'),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

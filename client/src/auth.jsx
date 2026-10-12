import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export const HOME_FOR_ROLE = { restaurant: '/restaurant', customer: '/find', charity: '/charity', admin: '/admin' };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: Boolean(tokenStore.get()) });

  const accept = useCallback(({ token, user, profile }) => {
    if (token) tokenStore.set(token);
    setState({ user, profile, loading: false });
    return user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setState({ user: null, profile: null, loading: false });
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return setState((s) => ({ ...s, loading: false }));
    try { accept(await api('/auth/me')); } catch { logout(); }
  }, [accept, logout]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    window.addEventListener('foodsave:unauthorized', logout);
    return () => window.removeEventListener('foodsave:unauthorized', logout);
  }, [logout]);

  const value = useMemo(() => ({
    ...state,
    login: async (email, password) => accept(await api('/auth/login', { method: 'POST', body: { email, password } })),
    register: async (body) => accept(await api('/auth/register', { method: 'POST', body })),
    registerCharity: async (form) => accept(await api('/charities/register', { method: 'POST', form })),
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    refresh,
    logout,
  }), [state, accept, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

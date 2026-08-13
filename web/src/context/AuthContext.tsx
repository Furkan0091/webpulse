import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';
import type { Organization, User } from '../lib/types';

interface AuthState {
  user: User | null;
  orgs: Organization[];
  activeOrg: Organization | null;
  loading: boolean;
  setActiveOrg: (org: Organization) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_ORG_KEY = 'wp_active_org';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSession() {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    try {
      const [meRes, orgsRes] = await Promise.all([api.get('/auth/me'), api.get('/orgs')]);
      setUser(meRes.data.data);
      setOrgs(orgsRes.data.data);
      const storedId = localStorage.getItem(ACTIVE_ORG_KEY);
      const orgList: Organization[] = orgsRes.data.data;
      const active = orgList.find((o) => o.id === storedId) ?? orgList[0] ?? null;
      if (active) setActiveOrgState(active);
    } catch {
      tokenStore.clear();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    window.addEventListener('wp:logout', () => {
      setUser(null);
      setOrgs([]);
      setActiveOrgState(null);
    });
  }, []);

  function setActiveOrg(org: Organization) {
    setActiveOrgState(org);
    localStorage.setItem(ACTIVE_ORG_KEY, org.id);
  }

  async function refreshOrgs() {
    const res = await api.get('/orgs');
    setOrgs(res.data.data);
    return res.data.data;
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    tokenStore.set(res.data.data.accessToken, res.data.data.refreshToken);
    setUser(res.data.data.user);
    await loadSession();
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.post('/auth/register', { name, email, password });
    tokenStore.set(res.data.data.accessToken, res.data.data.refreshToken);
    setUser(res.data.data.user);
    await refreshOrgs();
  }

  function logout() {
    const refresh = tokenStore.refresh;
    if (refresh) api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    tokenStore.clear();
    localStorage.removeItem(ACTIVE_ORG_KEY);
    setUser(null);
    setOrgs([]);
    setActiveOrgState(null);
  }

  return (
    <AuthContext.Provider value={{ user, orgs, activeOrg, loading, setActiveOrg, login, register, logout, refreshOrgs }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

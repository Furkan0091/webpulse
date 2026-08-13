import axios, { AxiosError } from 'axios';

const ACCESS_KEY = 'wp_access';
const REFRESH_KEY = 'wp_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// In production the frontend is served from a different origin than the API,
// so point at an absolute URL (e.g. the Render service). Falls back to the
// Vite dev proxy (`/api`) when unset.
const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = tokenStore.refresh;
  if (!refresh) return null;
  try {
    const res = await api.post('/auth/refresh', { refreshToken: refresh });
    const access = res.data.data.accessToken as string;
    tokenStore.set(access, refresh);
    return access;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing = refreshing ?? doRefresh();
      const access = await refreshing;
      refreshing = null;
      if (access) {
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      }
      window.dispatchEvent(new Event('wp:logout'));
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message ?? err.message;
  }
  return 'An unexpected error occurred.';
}

import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* noop */ } },
};
export const tokens = {
  get access() { return store.get("rv_access"); },
  get refresh() { return store.get("rv_refresh"); },
  set(a, r) { store.set("rv_access", a); store.set("rv_refresh", r); },
  clear() { store.set("rv_access", null); store.set("rv_refresh", null); },
};

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((cfg) => {
  if (tokens.access) cfg.headers.Authorization = `Bearer ${tokens.access}`;
  return cfg;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && tokens.refresh && !orig._retry && !orig.url.includes("/auth/")) {
      orig._retry = true;
      try {
        refreshing = refreshing || axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: tokens.refresh });
        const { data } = await refreshing;
        tokens.set(data.accessToken, data.refreshToken);
        return api(orig);
      } catch (e) {
        tokens.clear();
        window.location.href = "/login";
        throw e;
      } finally { refreshing = null; }
    }
    throw err;
  }
);
export default api;

export const get = (url, params) => api.get(url, { params }).then((r) => r.data);

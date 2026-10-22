import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { tokens } from "../api";
import { store } from "../utils";
import { applyPalette, DEFAULT_PALETTE, paletteByKey } from "../palettes";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [theme, setThemeState] = useState(store.get("rv_theme", "light"));
  const [locked, setLocked] = useState(store.get("rv_locked", false));
  const [palette, setPaletteState] = useState(() => paletteByKey(store.get("rv_palette", DEFAULT_PALETTE)).key);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyPalette(palette, theme);
  }, [theme, palette]);
  const setPalette = (k) => { setPaletteState(k); store.set("rv_palette", k); };

  useEffect(() => {
    if (!tokens.access) { setReady(true); return; }
    api.get("/api/user/me").then((r) => setUser(r.data)).catch(() => tokens.clear()).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (payload) => {
    const { data } = await api.post("/api/auth/login", payload);
    tokens.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const refreshUser = useCallback(() => api.get("/api/user/me").then((r) => { setUser(r.data); return r.data; }), []);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
    setLocked(false);
    store.set("rv_locked", false);
  }, []);

  const setTheme = (t) => {
    setThemeState(t);
    store.set("rv_theme", t);
    if (user) api.patch("/api/user/me", { theme: t }).catch(() => {});
  };
  const setLang = (l) => {
    i18n.changeLanguage(l);
    try { localStorage.setItem("rv_lang", l); } catch { /* noop */ }
    if (user) api.patch("/api/user/me", { lang: l }).catch(() => {});
  };
  const lock = (v) => { setLocked(v); store.set("rv_locked", v); };

  return (
    <Ctx.Provider value={{ user, ready, login, logout, theme, setTheme, setLang, lang: i18n.language, locked, lock, palette, setPalette, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Pages an admin can grant per user (keys match backend auth.PAGES). */
export const PAGE_PATHS = { map: "/", dashboard: "/dashboard", analytics: "/analytics", cameras: "/cameras" };
export const isAdmin = (user) => ["superadmin", "admin"].includes(user?.role);
export const canSee = (user, page) => !user?.pages || user.pages.includes(page);
export const homePath = (user) => PAGE_PATHS[Object.keys(PAGE_PATHS).find((p) => canSee(user, p))] || "/profile";

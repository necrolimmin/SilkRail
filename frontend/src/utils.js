import dayjs from "dayjs";
export const fmt = (n, d = 0) => {
  const digits = typeof d === "number" ? d : 0; // guards against use as a Table render fn (value, record)
  return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: digits });
};
export const money = (n) => (n == null ? "—" : `${fmt(n / 1e6, 1)} mln`);
export const date = (s) => (s ? dayjs(s).format("DD.MM.YYYY") : "—");
export const dateTime = (s) => (s ? dayjs(s).format("DD.MM.YYYY HH:mm") : "—");
export const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* noop */ } },
};

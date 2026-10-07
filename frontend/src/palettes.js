/**
 * Colour themes ("route stations") for the header, bottom dock, emblem and app accent.
 * Each palette is applied as CSS custom properties on <html>; index.css only reads the variables.
 *  bar:     colours of the dark "station board" bars
 *  primary: app accent for the light / dark UI theme
 */
export const PALETTES = [
  {
    key: "registon", city: "Samarqand",
    bar: { bg: "#0b2530", bg2: "#103a46", text: "#e6f4f1", glow: "#5eead4", lamp: "#fde68a", ind1: "#14b8a6", ind2: "#0e7490", board: "rgba(0,0,0,.28)" },
    primary: { light: ["#0d9488", "#0e7490", "#ccfbf1"], dark: ["#2dd4bf", "#22d3ee", "#134e4a"] },
  },
  {
    key: "lojuvard", city: "Samarqand · Go'ri Amir",
    bar: { bg: "#0a1838", bg2: "#14295c", text: "#e8eefc", glow: "#7dd3fc", lamp: "#fcd34d", ind1: "#3b82f6", ind2: "#1d4ed8", board: "rgba(0,0,0,.3)" },
    primary: { light: ["#2563eb", "#1d4ed8", "#dbeafe"], dark: ["#60a5fa", "#38bdf8", "#1e3a8a"] },
  },
  {
    key: "buxoro", city: "Buxoro · Minorai Kalon",
    bar: { bg: "#2a1409", bg2: "#4a2210", text: "#fdf1e7", glow: "#fdba74", lamp: "#fef3c7", ind1: "#ea580c", ind2: "#b45309", board: "rgba(0,0,0,.3)" },
    primary: { light: ["#c2410c", "#b45309", "#ffedd5"], dark: ["#fb923c", "#fbbf24", "#7c2d12"] },
  },
  {
    key: "xiva", city: "Xiva · Ichan qal'a",
    bar: { bg: "#1f1a0f", bg2: "#3a2e14", text: "#fbf6e6", glow: "#fcd34d", lamp: "#fff7d6", ind1: "#ca8a04", ind2: "#a16207", board: "rgba(0,0,0,.3)" },
    primary: { light: ["#a16207", "#854d0e", "#fef9c3"], dark: ["#facc15", "#fbbf24", "#713f12"] },
  },
  {
    key: "atlas", city: "Marg'ilon · atlas",
    bar: { bg: "#220b2e", bg2: "#3b1150", text: "#fbeefe", glow: "#f0abfc", lamp: "#fde68a", ind1: "#c026d3", ind2: "#7e22ce", board: "rgba(0,0,0,.3)" },
    primary: { light: ["#a21caf", "#7e22ce", "#fae8ff"], dark: ["#e879f9", "#c084fc", "#581c87"] },
  },
  {
    key: "paxta", city: "Toshkent · paxta",
    bar: { bg: "#ffffff", bg2: "#e9f4f2", text: "#0b1f33", glow: "#0d9488", lamp: "#f59e0b", ind1: "#14b8a6", ind2: "#0e7490", board: "#dff0ed", digits: "#0e7490", logoA: "#0b2530", logoB: "#114452", logoArch: "#5eead4" },
    primary: { light: ["#0d9488", "#0e7490", "#ccfbf1"], dark: ["#2dd4bf", "#22d3ee", "#134e4a"] },
  },
  {
    key: "tun", city: "Tungi reys",
    bar: { bg: "#111316", bg2: "#1e2228", text: "#eef0f3", glow: "#f87171", lamp: "#fde047", ind1: "#ef4444", ind2: "#b91c1c", board: "rgba(0,0,0,.35)" },
    primary: { light: ["#dc2626", "#b91c1c", "#fee2e2"], dark: ["#f87171", "#fb923c", "#7f1d1d"] },
  },
];
export const DEFAULT_PALETTE = "registon";
export const paletteByKey = (k) => PALETTES.find((p) => p.key === k) || PALETTES[0];

/** Registan-arch emblem as an SVG string (used for the browser-tab icon). */
export function emblemSvg(p) {
  const b = p.bar;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="${b.logoA || b.bg}"/><stop offset="1" stop-color="${b.logoB || b.bg2}"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#g)"/><path d="M11 41V22.5C11 15 17 10.5 24 7.5 31 10.5 37 15 37 22.5V41" stroke="${b.logoArch || b.glow}" stroke-width="2.6" stroke-linejoin="round"/><path d="M15.5 41V24C15.5 18.5 19.5 15.5 24 13 28.5 15.5 32.5 18.5 32.5 24V41" stroke="${b.logoArch || b.glow}" stroke-opacity=".35" stroke-width="1.4"/><circle cx="24" cy="21.5" r="4.2" fill="${b.lamp}"/><path d="M18 41 22.6 27M30 41 25.4 27" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M18.3 37.5h11.4M19.6 33.5h8.8M20.8 30h6.4" stroke="#fff" stroke-opacity=".6" stroke-width="1.3" stroke-linecap="round"/></svg>`;
}

/** Writes the palette into CSS variables (and the favicon) for the given light/dark theme. */
export function applyPalette(key, theme) {
  const p = paletteByKey(key);
  const b = p.bar;
  const [primary, primary2, soft] = p.primary[theme === "dark" ? "dark" : "light"];
  const vars = {
    "--hd-bg": b.bg, "--hd-bg2": b.bg2, "--hd-text": b.text, "--hd-glow": b.glow, "--hd-lamp": b.lamp,
    "--hd-ind1": b.ind1, "--hd-ind2": b.ind2, "--hd-board": b.board, "--hd-digits": b.digits || b.lamp,
    "--hd-logo-a": b.logoA || b.bg, "--hd-logo-b": b.logoB || b.bg2, "--hd-logo-arch": b.logoArch || b.glow,
    "--rv-primary": primary, "--rv-primary-2": primary2, "--rv-primary-soft": soft,
  };
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.palette = p.key;
  const link = document.querySelector("link[rel~='icon']");
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(emblemSvg(p))}`;
  return primary;
}

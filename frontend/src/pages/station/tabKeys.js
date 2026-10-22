/* Station card tab keys (order = order in the card), their groups, and the sections whose content is not ready.
   Kept separate from StationModal so the users admin page and the sections switchboard can import them without the whole card. */
export const TAB_GROUPS = [
  ["about", "#0d9488", ["home", "pano", "cameras"]],
  ["infra", "#6366f1", ["tech", "cadastre", "roads"]],
  ["team", "#0ea5e9", ["staff", "computers"]],
  ["ops", "#d97706", ["traffic", "indicators", "finance"]],
  ["wip", "#64748b", ["kpi", "emm", "kmo", "income"]],
];
export const STATION_TAB_KEYS = TAB_GROUPS.flatMap(([, , keys]) => keys);
// content not built yet: while such a section is switched off for users, it shows a "work in progress" screen.
// Which sections are switched off is no longer fixed here — admins set it (user.hiddenStationTabs).
export const WIP_TABS = new Set(["kpi", "emm", "kmo", "income"]);

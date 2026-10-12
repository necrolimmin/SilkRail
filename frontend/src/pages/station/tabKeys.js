/* Station card tab keys (order = order in the card) and the sections still in development.
   Kept separate from StationModal so the users admin page can import them without the whole card. */
export const STATION_TAB_KEYS = ["home", "pano", "cameras", "tech", "cadastre", "roads", "staff", "computers", "traffic", "indicators", "finance",
  "kpi", "emm", "kmo", "income"];
// hidden from regular users, admins see a "work in progress" screen
export const WIP_TABS = new Set(["kpi", "emm", "kmo", "income"]);

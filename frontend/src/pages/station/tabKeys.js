/* Station card tab keys, their icons, the default grouping, and the sections whose content is not ready.
   Kept separate from StationModal so the users admin page and the sections editor can import them without the whole card.
   The grouping actually shown comes from the server (user.stationLayout): admins rearrange it for everyone. */
import {
  TrainFront, Rotate3d, Cctv, TrainTrack, LandPlot, Split, UsersRound, MonitorCheck, ArrowRightLeft, Gauge, Coins,
  Target, Route, ClipboardCheck, Wallet,
} from "lucide-react";

export const TAB_ICONS = {
  home: TrainFront, pano: Rotate3d, cameras: Cctv, tech: TrainTrack, cadastre: LandPlot, roads: Split, staff: UsersRound,
  computers: MonitorCheck, traffic: ArrowRightLeft, indicators: Gauge, finance: Coins, kpi: Target, emm: Route,
  kmo: ClipboardCheck, income: Wallet,
};

export const TAB_GROUPS = [
  ["about", "#0d9488", ["home", "pano", "cameras"]],
  ["infra", "#6366f1", ["tech", "cadastre", "roads"]],
  ["team", "#0ea5e9", ["staff", "computers"]],
  ["ops", "#d97706", ["traffic", "indicators", "finance"]],
  ["wip", "#64748b", ["kpi", "emm", "kmo", "income"]],
];
export const STATION_TAB_KEYS = TAB_GROUPS.flatMap(([, , keys]) => keys);
export const DEFAULT_LAYOUT = TAB_GROUPS.map(([id, color, tabs]) => ({ id, color, title: null, tabs }));

/** Groups of the station card as set by admins: [{ id, color, title, tabs }]. */
export const stationLayout = (user) => (user?.stationLayout?.length ? user.stationLayout : DEFAULT_LAYOUT);

/** A group's name: the one an admin typed, else the built-in name of the group. */
export const groupTitle = (t, g) => g.title || t(`station.groups.${g.id}`, { defaultValue: t("sections.newGroup") });

// content not built yet: while such a section is switched off for users, it shows a "work in progress" screen.
// Which sections are switched off is not fixed here — admins set it (user.hiddenStationTabs).
export const WIP_TABS = new Set(["kpi", "emm", "kmo", "income"]);

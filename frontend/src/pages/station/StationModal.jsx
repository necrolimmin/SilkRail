import { Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrainFront, Rotate3d, Cctv, TrainTrack, LandPlot, Split, UsersRound, MonitorCheck, ArrowRightLeft, Gauge, Coins,
  Target, Route, ClipboardCheck, Wallet, X,
} from "lucide-react";
import { get } from "../../api";
import { useAuth, isAdmin } from "../../store/auth";
import UnderConstruction from "./UnderConstruction";
import { WIP_TABS } from "./tabKeys";
import { HomeTab, KpiTab } from "./tabsA";
import { CadastreTab } from "./tabCadastre";
import { StaffTab, TechTab, RoadsTab } from "./tabsRecords";
import { TrafficTab, EmmTab, KmoTab } from "./tabsB";
import { IndicatorsTab, FinanceTab } from "./tabsLive";
import { IncomeTab, ComputersTab, CamerasTab, PanoTab } from "./tabsC";

// Tabs grouped into coloured "carriages": [group, colour, [[key, icon, component], ...]] — order here is the order on screen
const GROUPS = [
  ["about", "#0d9488", [["home", TrainFront, HomeTab], ["pano", Rotate3d, PanoTab], ["cameras", Cctv, CamerasTab]]],
  ["infra", "#6366f1", [["tech", TrainTrack, TechTab], ["cadastre", LandPlot, CadastreTab], ["roads", Split, RoadsTab]]],
  ["team", "#0ea5e9", [["staff", UsersRound, StaffTab], ["computers", MonitorCheck, ComputersTab]]],
  ["ops", "#d97706", [["traffic", ArrowRightLeft, TrafficTab], ["indicators", Gauge, IndicatorsTab], ["finance", Coins, FinanceTab]]],
  ["wip", "#64748b", [["kpi", Target, KpiTab], ["emm", Route, EmmTab], ["kmo", ClipboardCheck, KmoTab], ["income", Wallet, IncomeTab]]],
];
const TABS = GROUPS.flatMap(([, , tabs]) => tabs);
// sections still in development: hidden from regular users, admins see a "work in progress" screen
const WIP = WIP_TABS;

export default function StationModal({ id, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = isAdmin(user);
  // admins see everything; others see the tabs granted to them (user.stationTabs), minus sections in development
  const tabs = TABS.filter(([k]) => admin || (!WIP.has(k) && (!user?.stationTabs || user.stationTabs.includes(k))));
  const first = tabs[0]?.[0];
  const [tab, setTab] = useState(first);
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!id) return;
    setTab(first);
    setSt(null);
    get(`/api/stations/${id}`).then(setSt);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const Active = (tabs.find((x) => x[0] === tab) || tabs[0])?.[2];

  return (
    <Modal open={!!id} onCancel={onClose} footer={null} closable={false} width="min(1240px, 96vw)" centered className="rv-station-modal" destroyOnHidden>
      <div className="rv-st-head">
        <div style={{ minWidth: 150, maxWidth: 190 }}>
          <div style={{ fontWeight: 800, fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st?.name || "…"}</div>
          <div className="rv-muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st?.mtu?.name}</div>
        </div>
        <div className="rv-st-tabs" role="tablist">
          {GROUPS.map(([g, color, list]) => {
            const mine = list.filter(([k]) => tabs.some((x) => x[0] === k));
            if (!mine.length) return null;
            return (
              <div key={g} className={`rv-st-group ${g}`} style={{ "--g": color }} title={t(`station.groups.${g}`)}>
                {mine.map(([k, Icon]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={`rv-st-t ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}
                    title={WIP.has(k) ? `${t(`station.tabs.${k}`)} · ${t("wip.badge")}` : t(`station.tabs.${k}`)}>
                    <Icon size={17} /><span className="lbl">{t(`station.tabs.${k}`)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <button className="rv-st-tab" onClick={onClose} aria-label="close"><X size={16} /></button>
      </div>
      <div className="rv-st-body">
        {!Active ? <div className="rv-card" style={{ textAlign: "center", padding: 40 }}><span className="rv-muted">{t("users.noStationTabs")}</span></div> : st ? (WIP.has(tab) ? <UnderConstruction section={tab} /> : <Active st={st} onChange={setSt} />) : <div style={{ height: 300, display: "grid", placeItems: "center" }}><Spin /></div>}
      </div>
    </Modal>
  );
}

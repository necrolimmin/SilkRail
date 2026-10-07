import { Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  House, Users, Info, FileText, Target, TrendingUp, Activity, Route, ClipboardCheck, Wallet, Landmark, GitBranch, Monitor, Cctv, Orbit, X,
} from "lucide-react";
import { get } from "../../api";
import { useAuth, isAdmin } from "../../store/auth";
import UnderConstruction from "./UnderConstruction";
import { WIP_TABS } from "./tabKeys";
import { HomeTab, KpiTab } from "./tabsA";
import { CadastreTab } from "./tabCadastre";
import { StaffTab, TechTab, RoadsTab } from "./tabsRecords";
import { IndicatorsTab, TrafficTab, EmmTab, KmoTab } from "./tabsB";
import { IncomeTab, FinanceTab, ComputersTab, CamerasTab, PanoTab } from "./tabsC";

const TABS = [
  ["home", House, HomeTab], ["staff", Users, StaffTab], ["tech", Info, TechTab], ["cadastre", FileText, CadastreTab],
  ["kpi", Target, KpiTab], ["indicators", TrendingUp, IndicatorsTab], ["traffic", Activity, TrafficTab], ["emm", Route, EmmTab],
  ["kmo", ClipboardCheck, KmoTab], ["income", Wallet, IncomeTab], ["finance", Landmark, FinanceTab], ["roads", GitBranch, RoadsTab],
  ["computers", Monitor, ComputersTab], ["cameras", Cctv, CamerasTab], ["pano", Orbit, PanoTab],
];
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
          {tabs.map(([k, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} title={WIP.has(k) ? `${t(`station.tabs.${k}`)} · ${t("wip.badge")}` : t(`station.tabs.${k}`)}
              className={`rv-st-tab ${tab === k ? "active" : ""} ${WIP.has(k) ? "wip" : ""}`} onClick={() => setTab(k)}>
              <Icon size={16} /><span className="lbl">{t(`station.tabs.${k}`)}</span>
            </button>
          ))}
        </div>
        <button className="rv-st-tab" onClick={onClose} aria-label="close"><X size={16} /></button>
      </div>
      <div className="rv-st-body">
        {!Active ? <div className="rv-card" style={{ textAlign: "center", padding: 40 }}><span className="rv-muted">{t("users.noStationTabs")}</span></div> : st ? (WIP.has(tab) ? <UnderConstruction section={tab} /> : <Active st={st} onChange={setSt} />) : <div style={{ height: 300, display: "grid", placeItems: "center" }}><Spin /></div>}
      </div>
    </Modal>
  );
}

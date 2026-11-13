import { Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { get } from "../../api";
import { useAuth, isAdmin } from "../../store/auth";
import UnderConstruction from "./UnderConstruction";
import { WIP_TABS, TAB_ICONS, stationLayout, groupTitle } from "./tabKeys";
import { HomeTab, KpiTab } from "./tabsA";
import { CadastreTab } from "./tabCadastre";
import { StaffTab, TechTab, RoadsTab } from "./tabsRecords";
import { TrafficTab, EmmTab, KmoTab } from "./tabsB";
import { IndicatorsTab, FinanceTab } from "./tabsLive";
import { IncomeTab, ComputersTab, CamerasTab, PanoTab } from "./tabsC";

const VIEWS = {
  home: HomeTab, pano: PanoTab, cameras: CamerasTab, tech: TechTab, cadastre: CadastreTab, roads: RoadsTab, staff: StaffTab,
  computers: ComputersTab, traffic: TrafficTab, indicators: IndicatorsTab, finance: FinanceTab, kpi: KpiTab, emm: EmmTab,
  kmo: KmoTab, income: IncomeTab,
};
// sections still in development: hidden from regular users, admins see a "work in progress" screen
const WIP = WIP_TABS;

export default function StationModal({ id, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = isAdmin(user);
  // groups ("carriages") of tabs in the order admins set for everyone: [id, colour, title, [[key, icon, view], ...]]
  const GROUPS = stationLayout(user).map((g) => [g.id, g.color, groupTitle(t, g), g.tabs.filter((k) => VIEWS[k]).map((k) => [k, TAB_ICONS[k], VIEWS[k]])]);
  // admins see everything; others see what the server allows (user.stationTabs already accounts for the sections
  // switched off for everyone and for this user's explicit exceptions)
  const tabs = GROUPS.flatMap(([, , , list]) => list).filter(([k]) => admin || !user?.stationTabs || user.stationTabs.includes(k));
  const off = new Set(user?.hiddenStationTabs || []); // switched off for regular users
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
          {GROUPS.map(([g, color, title, list]) => {
            const mine = list.filter(([k]) => tabs.some((x) => x[0] === k));
            if (!mine.length) return null;
            return (
              <div key={g} className={`rv-st-group ${mine.every(([k]) => off.has(k)) ? "wip" : ""}`} style={{ "--g": color }} title={title}>
                {mine.map(([k, Icon]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={`rv-st-t ${tab === k ? "active" : ""} ${off.has(k) ? "off" : ""}`} onClick={() => setTab(k)}
                    title={off.has(k) ? `${t(`station.tabs.${k}`)} · ${t("sections.adminsOnly")}` : t(`station.tabs.${k}`)}>
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
        {!Active ? <div className="rv-card" style={{ textAlign: "center", padding: 40 }}><span className="rv-muted">{t("users.noStationTabs")}</span></div> : st ? (WIP.has(tab) && off.has(tab) ? <UnderConstruction section={tab} /> : <Active st={st} onChange={setSt} />) : <div style={{ height: 300, display: "grid", placeItems: "center" }}><Spin /></div>}
      </div>
    </Modal>
  );
}

import { Select, Table, Tag, Progress, Avatar } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Hash, Globe, Train, Building2, Tags, MapPin, Network, Signpost, Boxes, BadgeCheck, Navigation, Compass, Receipt, Phone, Mail,
  UserRound,
} from "lucide-react";
import { PhotoHero, WeatherCard, StationEditButton } from "./StationMedia";
import { NoData, useFetch } from "../../components/ui";

export function StationIllustration({ name, hub }) {
  return (
    <svg viewBox="0 0 800 260" className="rv-hero-img" preserveAspectRatio="xMidYMid slice" role="img" aria-label={name}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#7dd3fc" /><stop offset="1" stopColor="#e0f2fe" /></linearGradient>
        <linearGradient id="bld" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f8fafc" /><stop offset="1" stopColor="#e2e8f0" /></linearGradient>
      </defs>
      <rect width="800" height="260" fill="url(#sky)" />
      <path d="M0 170 L120 120 L220 150 L330 105 L460 150 L580 110 L700 145 L800 125 L800 190 L0 190Z" fill="#94a3b8" opacity=".45" />
      <rect x="0" y="185" width="800" height="75" fill="#cbd5e1" />
      <rect x={hub ? 170 : 260} y="95" width={hub ? 460 : 280} height="95" rx="4" fill="url(#bld)" stroke="#94a3b8" />
      <rect x={hub ? 160 : 250} y="84" width={hub ? 480 : 300} height="16" rx="3" fill="#0d9488" />
      {Array.from({ length: hub ? 9 : 5 }).map((_, i) => <rect key={i} x={(hub ? 195 : 280) + i * 48} y="118" width="28" height="38" rx="3" fill="#1e3a5f" opacity=".8" />)}
      <rect x="380" y="150" width="40" height="40" fill="#475569" />
      <text x="400" y="80" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="22" fill="#0b3b4a">{name?.toUpperCase()}</text>
      <rect x="0" y="212" width="800" height="5" fill="#475569" /><rect x="0" y="232" width="800" height="5" fill="#475569" />
      {Array.from({ length: 40 }).map((_, i) => <rect key={i} x={i * 20} y="209" width="8" height="32" fill="#78716c" opacity=".5" />)}
    </svg>
  );
}

const KV = ({ icon: Icon, k, v }) => (
  <div className="rv-kv-item"><div className="ic"><Icon size={16} /></div><div style={{ minWidth: 0 }}><div className="k">{k}</div><div className="v">{v ?? "—"}</div></div></div>
);

export function HomeTab({ st, onChange }) {
  const { t } = useTranslation();
  const yn = (b) => (b ? t("common.yes") : t("common.no"));
  return (
    <div className="rv-grid">
      <div className="rv-grid rv-home-top">
        <div className="rv-card" style={{ padding: 8 }}>
          <PhotoHero st={st} onChange={onChange} fallback={<StationIllustration name={st.name} hub={st.isHub} />} />
        </div>
        <WeatherCard st={st} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "8px 0 0" }}>
        <h3 style={{ margin: 0 }}>{t("station.general")}</h3>
        <StationEditButton st={st} onChange={onChange} />
      </div>
      <div className="rv-kv">
        <KV icon={Hash} k={t("station.f.roadCode")} v={st.roadCode} />
        <KV icon={Network} k={t("station.f.networkMark")} v={st.networkMark} />
        <KV icon={Tags} k={t("station.f.esr")} v={st.esrCode} />
        <KV icon={Globe} k={t("station.f.country")} v={st.country} />
        <KV icon={Train} k={t("station.f.road")} v={st.road} />
        <KV icon={Building2} k={t("station.f.mtu")} v={st.mtu.name} />
        <KV icon={Signpost} k={t("station.f.stationClass")} v={st.stationClass} />
        <KV icon={Boxes} k={t("station.f.stationRole")} v={st.stationRole} />
        <KV icon={BadgeCheck} k={t("station.f.category")} v={st.category} />
        <KV icon={MapPin} k={t("station.f.pointType")} v={st.pointType} />
        <KV icon={Navigation} k={t("station.f.transit")} v={yn(st.transitPoint)} />
        <KV icon={Boxes} k={t("station.f.cargo")} v={yn(st.cargoOperations)} />
        <KV icon={BadgeCheck} k={t("station.f.operator")} v={yn(st.isOperator)} />
        <KV icon={Receipt} k={t("station.f.inn")} v={st.inn} />
        <KV icon={Compass} k={t("station.f.lat")} v={st.lat.toFixed(5)} />
        <KV icon={Compass} k={t("station.f.lng")} v={st.lng.toFixed(5)} />
      </div>
      <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="rv-card">
          <h3>{t("station.contact")}</h3>
          <div className="rv-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("station.leader")}</div>
          <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
            <span style={{ display: "flex", gap: 8 }}><UserRound size={16} />{st.leader.fullName}</span>
            <span style={{ display: "flex", gap: 8 }}><Phone size={16} />{st.leader.phone}</span>
            <span style={{ display: "flex", gap: 8 }}><Mail size={16} />{st.leader.email}</span>
          </div>
          <div className="rv-muted" style={{ fontSize: 12, fontWeight: 700, margin: "14px 0 8px" }}>{t("station.corpLeader")}</div>
          <span style={{ display: "flex", gap: 8, fontSize: 13.5 }}><UserRound size={16} />{st.corpLeader}</span>
        </div>
        <div className="rv-card">
          <h3>{t("station.codes")}</h3>
          <Table size="small" pagination={false} rowKey="c" dataSource={st.opCodes.map((c) => ({ c }))}
            columns={[{ title: "#", width: 60, render: (r) => <Tag color="cyan">{r.c}</Tag> }, { title: t("common.name"), render: (r) => t(`opCodes.${r.c}`) }]} />
        </div>
      </div>
    </div>
  );
}

export function KpiTab({ st }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState();
  const { data, loading } = useFetch(`/api/stations/${st.id}/kpi`, { month });
  const color = { confirmed: "green", cancelled: "red", pending: "orange" };
  const monthLabel = (m) => { const [y, mo] = m.split("-"); return `${t("months", { returnObjects: true, lng: i18n.language })[+mo - 1]} ${y}`; };
  return (
    <div className="rv-card">
      <div className="rv-toolbar">
        <h3 style={{ margin: 0 }}>KPI</h3>
        {data?.months && <Select style={{ width: 200 }} value={data.month} onChange={setMonth} options={data.months.map((m) => ({ value: m, label: monthLabel(m) }))} />}
      </div>
      <Table rowKey="id" loading={loading} dataSource={data?.items} pagination={{ pageSize: 8 }} scroll={{ x: 900 }}
        locale={{ emptyText: <NoData /> }}
        columns={[
          { title: t("station.kpi.worker"), render: (r) => <span style={{ display: "flex", gap: 10, alignItems: "center" }}><Avatar shape="square">{r.fullName[0]}</Avatar><span><b>{r.fullName}</b><div className="rv-muted" style={{ fontSize: 12 }}>{r.position}</div></span></span> },
          { title: t("station.kpi.work"), render: (r) => (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {Object.entries(r.docs).map(([k, v], i) => <Tag key={k} color={["green", "magenta", "gold"][i]} style={{ margin: 0 }}>{k}: {v}</Tag>)}
              <b style={{ marginLeft: 6 }}>{r.total}</b><span className="rv-muted">/ {r.plan}</span>
            </div>) },
          { title: t("station.kpi.kpi"), width: 200, render: (r) => <Progress percent={r.percent} size="small" strokeColor={r.percent > 80 ? "#16a34a" : r.percent > 50 ? "#f59e0b" : "#ef4444"} /> },
          { title: t("station.kpi.approval"), render: (r) => <Tag color={color[r.status]}>{t(`station.kpi.${r.status}`)}</Tag> },
        ]} />
    </div>
  );
}

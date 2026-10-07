import { DatePicker, Input, Segmented, Select, Table, Tag, Button } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LockOpen, Lock, RotateCcw, MessageSquare, Filter, ChevronUp, ChevronDown } from "lucide-react";
import { Chart, Loader, NoData, StatCard, useFetch } from "../../components/ui";
import { fmt, date, dateTime } from "../../utils";

const diffCell = (v) => <b style={{ color: v >= 0 ? "#16a34a" : "#ef4444" }}>{v >= 0 ? "+" : ""}{fmt(v, 1)}</b>;

export function IndicatorsTab({ st }) {
  const { t } = useTranslation();
  const [ym, setYm] = useState(dayjs());
  const { data, loading } = useFetch(`/api/stations/${st.id}/indicators`, { year: ym.year(), month: ym.month() + 1 });
  const y = ym.year();
  return (
    <div className="rv-grid">
      <div className="rv-card">
        <div className="rv-toolbar">
          <h3 style={{ margin: 0 }}>{t("station.tabs.indicators")}</h3>
          <DatePicker picker="month" value={ym} onChange={(v) => v && setYm(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} />
        </div>
        <Table rowKey="category" loading={loading} dataSource={data?.items} pagination={false} scroll={{ x: 900 }}
          columns={[
            { title: t("indicators.type"), render: (r) => <b>{t(`indicators.c${r.category}`)}</b> },
            { title: t("indicators.prev", { year: y - 1 }), dataIndex: "prevReport", render: (v) => fmt(v, 1) },
            { title: t("indicators.plan", { year: y }), dataIndex: "plan", render: (v) => fmt(v, 1) },
            { title: t("indicators.report", { year: y }), dataIndex: "report", render: (v) => <b>{fmt(v, 1)}</b> },
            { title: t("indicators.diffPlan"), dataIndex: "diffPlan", render: diffCell },
            { title: t("indicators.diffPrev"), dataIndex: "diffPrev", render: diffCell },
          ]} />
      </div>
      {data && (
        <div className="rv-card">
          <Chart height={320} option={{
            tooltip: { trigger: "axis" }, xAxis: { type: "category", data: data.items.map((r) => t(`indicators.c${r.category}`)), axisLabel: { interval: 0, width: 90, overflow: "break", fontSize: 11 } },
            yAxis: { type: "log", logBase: 10 },
            series: [
              { name: t("indicators.prev", { year: y - 1 }), type: "bar", data: data.items.map((r) => Math.max(1, r.prevReport)), itemStyle: { borderRadius: 4 } },
              { name: t("indicators.plan", { year: y }), type: "bar", data: data.items.map((r) => Math.max(1, r.plan)), itemStyle: { borderRadius: 4 } },
              { name: t("indicators.report", { year: y }), type: "bar", data: data.items.map((r) => Math.max(1, r.report)), itemStyle: { borderRadius: 4 } },
            ],
          }} />
        </div>
      )}
    </div>
  );
}

/* Harakat: live data from the MTU reporting API (via our backend). Day + night shifts are summed;
   "waiting" is a stock value, so it is averaged instead. */
export function TrafficTab({ st }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState("moves");
  const [mode, setMode] = useState("days");
  const { data, loading, error } = useFetch(`/api/stations/${st.id}/traffic`, { kind, mode });
  const labels = { moves: [t("traffic2.in"), t("traffic2.out")], load: [t("station.traffic.loaded"), t("station.traffic.unloaded")], waiting: [t("traffic2.waitLoad"), t("traffic2.waitUnload")] }[kind];
  const avg = data?.aggregate === "avg";
  const rows = data?.rows || [];
  return (
    <div className="rv-grid">
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Segmented value={kind} onChange={setKind} options={[
          { value: "moves", label: t("traffic2.moves") }, { value: "load", label: t("station.traffic.load") }, { value: "waiting", label: t("traffic2.waiting") },
        ]} />
      </div>
      <div className="rv-card">
        <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {t(`traffic2.title.${kind}`)}
            {kind === "moves" && <Tag color="gold" title={t("traffic2.unitHint")}>{t("traffic2.unitTbd")}</Tag>}
            {avg && <Tag>{t("traffic2.avgTag")}</Tag>}
          </h3>
          <Segmented value={mode} onChange={setMode} options={[{ value: "days", label: t("station.traffic.daily") }, { value: "months", label: t("station.traffic.monthly") }, { value: "years", label: t("station.traffic.yearly") }]} />
        </div>
        <Loader loading={loading} height={360}>
          {error ? (
            <div className="rv-rec-empty"><b>{t("traffic2.errTitle")}</b><span className="rv-muted">{t("traffic2.errText")}</span></div>
          ) : data?.source !== "api" ? (
            <div className="rv-rec-empty">
              <b>{t(data?.reason === "not_configured" ? "traffic2.notConfigured" : "traffic2.notMapped")}</b>
              <span className="rv-muted">{t(data?.reason === "not_configured" ? "traffic2.notConfiguredText" : "traffic2.notMappedText")}</span>
            </div>
          ) : (
            <>
              <div className="rv-traffic-kpis">
                {[[labels[0], data.totals.in, "#0d9488"], [labels[1], data.totals.out, "#f59e0b"]].map(([k, v, c]) => (
                  <div key={k} style={{ borderLeftColor: c }}>
                    <span>{k}{avg ? ` · ${t("traffic2.perDay")}` : ""}</span>
                    <b>{fmt(v, avg ? 1 : 0)}</b>
                  </div>
                ))}
                <div style={{ borderLeftColor: "var(--rv-border)" }}><span>{t("traffic2.period")}</span><b style={{ fontSize: 15 }}>{date(data.from)} — {date(data.to)}</b></div>
              </div>
              {rows.length ? (
                <Chart height={320} option={{
                  tooltip: { trigger: "axis" }, legend: { top: 0 }, color: ["#0d9488", "#f59e0b"], grid: { top: 36, left: 8, right: 16, bottom: 8, containLabel: true },
                  xAxis: { type: mode === "days" ? "category" : "category", data: rows.map((r) => r.period), boundaryGap: mode !== "days" },
                  yAxis: { type: "value" },
                  series: mode === "days" ? [
                    { name: labels[0], type: "line", smooth: true, data: rows.map((r) => r.in), areaStyle: { opacity: 0.12 }, symbolSize: 6 },
                    { name: labels[1], type: "line", smooth: true, data: rows.map((r) => r.out), areaStyle: { opacity: 0.12 }, symbolSize: 6 },
                  ] : [
                    { name: labels[0], type: "bar", barMaxWidth: 26, itemStyle: { borderRadius: [6, 6, 0, 0] }, data: rows.map((r) => r.in) },
                    { name: labels[1], type: "bar", barMaxWidth: 26, itemStyle: { borderRadius: [6, 6, 0, 0] }, data: rows.map((r) => r.out) },
                  ],
                }} />
              ) : <NoData />}
              <div className="rv-source">
                {t("traffic2.source")} · {t("traffic2.apiStation")}: <b>{data.apiStation}</b>
                {data.match !== "exact" && data.match !== "manual" && <span> ({t("traffic2.autoMatched")})</span>}
                {" · "}{t("traffic2.reported", { n: data.reported })}
              </div>
            </>
          )}
        </Loader>
      </div>
    </div>
  );
}

export function EmmTab({ st }) {
  const { t } = useTranslation();
  const { data, loading } = useFetch(`/api/stations/${st.id}/emm`);
  return (
    <div className="rv-card">
      <h3>{t("station.emm.title")}</h3>
      <Table rowKey="id" loading={loading} dataSource={data || []} size="middle" scroll={{ x: 1000 }} pagination={{ pageSize: 8 }} locale={{ emptyText: <NoData /> }}
        columns={[
          { title: t("station.emm.loco"), render: (r) => <span><b>{r.series}</b> №{r.locomotive}</span> },
          { title: t("station.emm.machinist"), dataIndex: "machinist" },
          { title: t("station.emm.route"), dataIndex: "route" },
          { title: t("station.emm.departed"), dataIndex: "departedAt", render: dateTime },
          { title: t("station.emm.arrived"), dataIndex: "arrivedAt", render: (v) => (v ? dateTime(v) : <Tag color="processing">{t("station.emm.onRoute")}</Tag>) },
          { title: t("station.emm.fuel"), render: (r) => <span>{fmt(r.fuelStart)} → <b>{fmt(r.fuelEnd)}</b></span> },
        ]} />
    </div>
  );
}

export function KmoTab({ st }) {
  const { t, i18n } = useTranslation();
  const [f, setF] = useState({});
  const [open, setOpen] = useState(true);
  const { data, loading } = useFetch(`/api/stations/${st.id}/kmo`, f);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v || undefined }));
  const roles = t("station.kmo.roles", { returnObjects: true, lng: i18n.language });
  const statuses = ["open", "closed", "repetition", "done", "not_done", "moved", "not_controlled"];
  return (
    <div className="rv-grid">
      <div className="rv-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
          <h3 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}><Filter size={18} color="var(--rv-primary)" />{t("station.kmo.filters")} {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</h3>
          <Button size="small" onClick={(e) => { e.stopPropagation(); setF({}); }}>{t("station.kmo.reset")}</Button>
        </div>
        {open && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
            <Select allowClear placeholder={t("station.kmo.status")} value={f.status} onChange={set("status")} options={statuses.map((s) => ({ value: s, label: t(`station.kmo.${s === "open" || s === "closed" ? s : s}`) }))} />
            <Select allowClear placeholder={t("station.kmo.role")} value={f.role} onChange={set("role")} options={Object.entries(roles).map(([k, v]) => ({ value: k, label: v }))} />
            <Select allowClear placeholder={t("station.kmo.type")} value={f.type} onChange={set("type")} options={[{ value: "kmo", label: t("station.kmo.kmo") }, { value: "kkmo", label: t("station.kmo.kkmo") }]} />
            <DatePicker picker="month" placeholder={t("station.kmo.month")} value={f.month ? dayjs(f.month) : null} onChange={(d) => set("month")(d?.format("YYYY-MM"))} />
            <Select allowClear placeholder={t("station.kmo.material")} value={f.material} onChange={set("material")} options={[{ value: "related", label: t("station.kmo.related") }, { value: "notRelated", label: t("station.kmo.notRelated") }]} />
            <Input.Search allowClear placeholder={t("station.kmo.desc")} onSearch={set("q")} />
          </div>
        )}
      </div>
      <Loader loading={loading && !data}>
        {data && (
          <>
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <StatCard label={t("station.kmo.open")} value={data.summary.open} icon={LockOpen} color="#16a34a" />
              <StatCard label={t("station.kmo.closed")} value={data.summary.closed} icon={Lock} color="#ef4444" />
              <StatCard label={t("station.kmo.rejected")} value={data.summary.rejected} icon={RotateCcw} color="#f59e0b" />
              <StatCard label={t("station.kmo.comments")} value={data.summary.comments} icon={MessageSquare} color="#6366f1" />
            </div>
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              {Object.entries(data.byRole).map(([k, v]) => (
                <div key={k} className="rv-card">
                  <h3>{roles[k]}</h3>
                  <Chart height={170} option={{
                    tooltip: { trigger: "item" }, legend: { show: false }, color: ["#16a34a", "#ef4444", "#94a3b8"],
                    series: [{ type: "pie", radius: ["58%", "82%"], label: { show: true, position: "center", formatter: () => `${v.total}`, fontSize: 22, fontWeight: 800 },
                      data: v.total ? [{ name: t("station.kmo.done"), value: v.done }, { name: t("station.kmo.not_done"), value: v.notDone }, { name: t("station.kmo.other"), value: v.other }] : [{ name: "—", value: 1, itemStyle: { color: "#e2e8f0" } }] }],
                  }} />
                </div>
              ))}
            </div>
            <div className="rv-card">
              <h3>{t("station.kmo.title")}</h3>
              <Table rowKey="id" size="small" dataSource={data.items} pagination={{ pageSize: 8 }} scroll={{ x: 1000 }} locale={{ emptyText: <NoData /> }}
                columns={[
                  { title: t("station.kmo.number"), dataIndex: "number", width: 60 },
                  { title: t("station.kmo.month"), dataIndex: "month", width: 90 },
                  { title: t("station.kmo.role"), dataIndex: "role", render: (v) => roles[v] },
                  { title: t("station.kmo.type"), dataIndex: "type", render: (v) => <Tag>{v.toUpperCase()}</Tag> },
                  { title: t("station.kmo.desc"), dataIndex: "description" },
                  { title: t("station.kmo.status"), dataIndex: "status", render: (v) => <Tag color={{ done: "green", not_done: "red", repetition: "orange", moved: "blue" }[v]}>{t(`station.kmo.${v}`)}</Tag> },
                  { title: t("station.kmo.deadline"), dataIndex: "deadline" },
                  { title: t("station.kmo.comments"), dataIndex: "comment", render: (v) => v || "—" },
                ]} />
            </div>
          </>
        )}
      </Loader>
    </div>
  );
}

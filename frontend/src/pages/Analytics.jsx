import { Checkbox, DatePicker, Input, Segmented, Select, Table, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Scale, Weight, AlertTriangle, PackageX, BadgeCheck, Percent, ScanLine, CircleCheck, CircleX } from "lucide-react";
import { Chart, Loader, NoData, StatCard, useFetch } from "../components/ui";
import { fmt, dateTime } from "../utils";
import { get } from "../api";

function WagonThumb({ number }) {
  return (
    <svg width="96" height="40" viewBox="0 0 96 40" aria-hidden="true" style={{ borderRadius: 6, background: "#1e293b" }}>
      <rect x="6" y="6" width="84" height="22" rx="3" fill="#475569" />
      <rect x="10" y="10" width="76" height="14" rx="2" fill="#0f172a" />
      <text x="48" y="21" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#fbbf24" fontWeight="700">{number}</text>
      <circle cx="22" cy="33" r="4" fill="#94a3b8" /><circle cx="74" cy="33" r="4" fill="#94a3b8" />
    </svg>
  );
}

export default function Analytics() {
  const { t } = useTranslation();
  const [range, setRange] = useState([dayjs().subtract(29, "day"), dayjs()]);
  const [mode, setMode] = useState("days");
  const [station, setStation] = useState();
  const [scale, setScale] = useState();
  const [customs, setCustoms] = useState();
  const [onlyExtra, setOnlyExtra] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [day, setDay] = useState(dayjs().subtract(1, "day"));
  const [scales, setScales] = useState([]);
  useEffect(() => { get("/api/scales").then(setScales); }, []);
  const base = { start: range[0].format("YYYY-MM-DD"), end: range[1].format("YYYY-MM-DD"), station, scale, customs };
  const sum = useFetch("/api/analytics/scale/summary", { ...base, mode });
  const hourly = useFetch("/api/analytics/scale/interval", { date: day.format("YYYY-MM-DD"), station });
  const list = useFetch("/api/analytics/scale/weighings", { ...base, onlyExtra, q, page, size: 10 });
  const stationOpts = [...new Map(scales.map((s) => [s.stationId, s.station])).entries()].map(([value, label]) => ({ value, label }));
  const s = sum.data?.totals;

  return (
    <div className="rv-page">
      <div className="rv-toolbar">
        <h2 className="rv-title" style={{ display: "flex", gap: 10, alignItems: "center" }}><ScanLine color="var(--rv-primary)" />{t("analytics.title")}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select allowClear showSearch optionFilterProp="label" placeholder={t("common.station")} style={{ width: 180 }} value={station} onChange={(v) => { setStation(v); setScale(undefined); setPage(1); }} options={stationOpts} />
          <Select allowClear placeholder={t("analytics.scale")} style={{ width: 170 }} value={scale} onChange={(v) => { setScale(v); setPage(1); }}
            options={scales.filter((x) => !station || x.stationId === station).map((x) => ({ value: x.id, label: `${x.code} · ${t(`analytics.${x.kind}`)}` }))} />
          <Select allowClear placeholder={t("analytics.customs")} style={{ width: 140 }} value={customs} onChange={(v) => { setCustoms(v); setPage(1); }}
            options={[{ value: "import", label: t("station.fin.import") }, { value: "export", label: t("station.fin.export") }]} />
          <DatePicker.RangePicker value={range} onChange={(v) => v && (setRange(v), setPage(1))} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} />
        </div>
      </div>
      <Loader loading={sum.loading && !s}>
        {s && (
          <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", marginBottom: 14 }}>
            <StatCard label={t("analytics.totalVagons")} value={fmt(s.vagons)} icon={Scale} />
            <StatCard label={t("analytics.totalWeight")} value={fmt(s.weight)} icon={Weight} color="#0ea5e9" />
            <StatCard label={t("analytics.extraVagons")} value={fmt(s.extraVagons)} icon={AlertTriangle} color="#f59e0b" />
            <StatCard label={t("analytics.extraWeight")} value={fmt(s.extraWeight, 1)} icon={PackageX} color="#ef4444" />
            <StatCard label={t("analytics.confirmedPct")} value={`${s.confirmedPct}%`} icon={BadgeCheck} color="#16a34a" />
            <StatCard label={t("analytics.extraPct")} value={`${s.extraPct}%`} icon={Percent} color="#a855f7" />
          </div>
        )}
      </Loader>
      <div className="rv-grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(300px,1fr)", marginBottom: 14 }}>
        <div className="rv-card">
          <div className="rv-toolbar"><h3 style={{ margin: 0 }}>{t("analytics.byPeriod")}</h3>
            <Segmented value={mode} onChange={setMode} options={[{ value: "days", label: t("common.days") }, { value: "months", label: t("common.months") }]} /></div>
          {sum.data?.series?.length ? (
            <Chart height={300} option={{
              xAxis: { type: "category", data: sum.data.series.map((r) => r.period) }, yAxis: [{ type: "value" }, { type: "value", show: false }],
              series: [
                { name: t("analytics.totalVagons"), type: "bar", data: sum.data.series.map((r) => r.vagons), itemStyle: { color: "#0d9488", borderRadius: [5, 5, 0, 0] } },
                { name: t("analytics.extraVagons"), type: "line", smooth: true, yAxisIndex: 1, data: sum.data.series.map((r) => r.extra), itemStyle: { color: "#ef4444" }, areaStyle: { opacity: 0.08 } },
              ],
            }} />
          ) : <NoData />}
        </div>
        <div className="rv-card">
          <h3>{t("analytics.topStations")}</h3>
          {sum.data?.stations?.length ? (
            <Chart height={300} option={{
              grid: { left: 8, right: 30, top: 24, bottom: 8, containLabel: true }, xAxis: { type: "value" },
              yAxis: { type: "category", inverse: true, data: sum.data.stations.map((r) => r.station) },
              series: [
                { name: t("analytics.totalVagons"), type: "bar", stack: "a", data: sum.data.stations.map((r) => r.vagons - r.extra), itemStyle: { color: "#14b8a6" } },
                { name: t("analytics.extra"), type: "bar", stack: "a", data: sum.data.stations.map((r) => r.extra), itemStyle: { color: "#f59e0b", borderRadius: [0, 5, 5, 0] } },
              ],
            }} />
          ) : <NoData />}
        </div>
      </div>
      <div className="rv-card" style={{ marginBottom: 14 }}>
        <div className="rv-toolbar"><h3 style={{ margin: 0 }}>{t("analytics.hourly")}</h3>
          <DatePicker value={day} onChange={(v) => v && setDay(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} /></div>
        {hourly.data && (
          <Chart height={220} option={{
            xAxis: { type: "category", data: hourly.data.map((h) => `${String(h.hour).padStart(2, "0")}:00`) }, yAxis: { type: "value" },
            series: [
              { name: t("analytics.totalVagons"), type: "bar", data: hourly.data.map((h) => h.vagons), itemStyle: { color: "#0ea5e9", borderRadius: [4, 4, 0, 0] } },
              { name: t("analytics.extraVagons"), type: "bar", data: hourly.data.map((h) => h.extra), itemStyle: { color: "#ef4444", borderRadius: [4, 4, 0, 0] } },
            ],
          }} />
        )}
      </div>
      <div className="rv-card">
        <div className="rv-toolbar">
          <h3 style={{ margin: 0 }}>{t("analytics.list")}</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Checkbox checked={onlyExtra} onChange={(e) => { setOnlyExtra(e.target.checked); setPage(1); }}>{t("analytics.onlyExtra")}</Checkbox>
            <Input.Search allowClear placeholder={t("analytics.wagon")} style={{ width: 200 }} onSearch={(v) => { setQ(v); setPage(1); }} />
          </div>
        </div>
        <Table rowKey="id" loading={list.loading} dataSource={list.data?.items} scroll={{ x: 1100 }} locale={{ emptyText: <NoData /> }}
          pagination={{ current: page, total: list.data?.total, pageSize: 10, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: t("analytics.photo"), render: (r) => <WagonThumb number={r.wagonNumber} />, width: 110 },
            { title: t("analytics.wagon"), dataIndex: "wagonNumber", render: (v, r) => <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b style={{ fontFamily: "monospace" }}>{v}</b>{!r.detected && <Tooltip title="AI"><Tag color="orange">?</Tag></Tooltip>}</span> },
            { title: t("common.station"), dataIndex: "station" },
            { title: t("analytics.weighedAt"), dataIndex: "weighedAt", render: dateTime },
            { title: t("analytics.norm"), dataIndex: "normTon", render: (v) => `${v} t` },
            { title: t("analytics.scaleTon"), dataIndex: "scaleTon", render: (v) => `${fmt(v, 2)} t` },
            { title: t("analytics.cargo"), dataIndex: "cargoTon", render: (v) => <b>{fmt(v, 2)} t</b> },
            { title: t("analytics.extra"), dataIndex: "extraTon", render: (v) => (v > 0 ? <Tag color="red">+{fmt(v, 2)} t</Tag> : "—") },
            { title: t("analytics.customs"), dataIndex: "customs", render: (v) => (v ? <Tag color={v === "import" ? "blue" : "purple"}>{t(`station.fin.${v}`)}</Tag> : "—") },
            { title: t("common.status"), dataIndex: "confirmed", render: (v) => (v ? <span style={{ color: "#16a34a", display: "flex", gap: 4, alignItems: "center" }}><CircleCheck size={16} />{t("analytics.confirmed")}</span> : <span style={{ color: "#94a3b8", display: "flex", gap: 4, alignItems: "center" }}><CircleX size={16} />{t("analytics.notConfirmed")}</span>) },
          ]} />
      </div>
    </div>
  );
}

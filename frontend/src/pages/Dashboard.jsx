import { Alert, Checkbox, DatePicker, Input, Segmented, Select, Table } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Fuel, Container, TrendingUp, Wallet, Landmark, Train, Building2, Cctv, Users, Ruler, TrainTrack } from "lucide-react";
import { Chart, Loader, NoData, PeriodFilter, StatCard, defaultPeriod, useFetch, PALETTE } from "../components/ui";
import { FinanceView } from "./station/tabsC";
import { fmt, store, money } from "../utils";
import { get } from "../api";

const diffCell = (v) => <b style={{ color: v >= 0 ? "#16a34a" : "#ef4444" }}>{v >= 0 ? "+" : ""}{fmt(v, 1)}</b>;
const periodLabel = (p) => p;

function ErrorBox({ error }) {
  const { t } = useTranslation();
  if (!error) return null;
  const oneMonth = error.response?.data?.detail === "range_one_month";
  return <Alert type="error" showIcon message={oneMonth ? t("common.rangeOneMonth") : t("common.error")} style={{ marginBottom: 14 }} />;
}

function Head({ title, period, setPeriod, extra, showMode = true }) {
  const { t } = useTranslation();
  return (
    <div className="rv-toolbar">
      <h2 className="rv-title">{title} <span className="rv-muted" style={{ fontSize: 14, fontWeight: 600 }}>{dayjs(period.start).format("DD.MM.YYYY")} {t("common.from")} {dayjs(period.end).format("DD.MM.YYYY")} {t("common.to")}</span></h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{extra}<PeriodFilter value={period} onChange={setPeriod} showMode={showMode} /></div>
    </div>
  );
}

function FuelTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(defaultPeriod());
  const [scope, setScope] = useState("all");
  const [tons, setTons] = useState(false);
  const { data, loading, error } = useFetch("/api/dashboard/fuel", { ...period, scope });
  return (
    <>
      <Head title={t("dash.fuelTitle")} period={period} setPeriod={setPeriod} />
      <div className="rv-card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: t("common.all") }, { value: "local", label: t("dash.local") }, { value: "export", label: t("dash.export") }]} />
        <Checkbox checked={tons} onChange={(e) => setTons(e.target.checked)}>{t("dash.showTons")}</Checkbox>
      </div>
      <ErrorBox error={error} />
      <Loader loading={loading}>
        {data && (
          <div className="rv-grid">
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <StatCard label={t("dash.plan")} value={fmt(data.totals.plan)} sub={t("dash.wagons")} icon={Container} color="#6366f1" />
              <StatCard label={t("dash.given")} value={fmt(data.totals.given)} sub={t("dash.wagons")} icon={Train} color="#0ea5e9" />
              <StatCard label={t("dash.loaded")} value={fmt(data.totals.loaded)} sub={t("dash.wagons")} icon={Fuel} color="#0d9488" />
              <StatCard label={t("dash.tons")} value={fmt(data.totals.tons)} sub="t" icon={Fuel} color="#f59e0b" />
              <StatCard label={t("dash.diff")} value={<span style={{ color: data.totals.diff >= 0 ? "#16a34a" : "#ef4444" }}>{fmt(data.totals.diff)}</span>} sub={t("dash.wagons")} icon={TrendingUp} color="#ef4444" />
            </div>
            <div className="rv-card">
              <Chart height={340} option={{
                xAxis: { type: "category", data: data.series.map((r) => periodLabel(r.period)) }, yAxis: [{ type: "value" }],
                series: tons
                  ? [{ name: t("dash.tons"), type: "bar", data: data.series.map((r) => r.tons), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#f59e0b" } }]
                  : [
                    { name: t("dash.plan"), type: "bar", data: data.series.map((r) => r.plan), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#c7d2fe" } },
                    { name: t("dash.given"), type: "bar", data: data.series.map((r) => r.given), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#38bdf8" } },
                    { name: t("dash.loaded"), type: "bar", data: data.series.map((r) => r.loaded), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#0d9488" } },
                  ],
              }} />
            </div>
            <div className="rv-grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)" }}>
              <div className="rv-card">
                <h3>{t("dash.byStation")}</h3>
                <Table rowKey="id" size="small" dataSource={data.stations} pagination={{ pageSize: 8 }} scroll={{ x: 600 }}
                  columns={[{ title: "#", width: 44, render: (_, __, i) => i + 1 }, { title: t("common.station"), dataIndex: "name" },
                    { title: t("dash.plan"), dataIndex: "plan", render: fmt }, { title: t("dash.given"), dataIndex: "given", render: fmt },
                    { title: t("dash.loaded"), dataIndex: "loaded", render: (v) => <b>{fmt(v)}</b> }, { title: t("dash.tons"), dataIndex: "tons", render: fmt },
                    { title: t("dash.diff"), dataIndex: "diff", render: diffCell }]} />
              </div>
              <div className="rv-card">
                <h3>{t("dash.byProduct")}</h3>
                <Chart height={320} option={{ tooltip: { trigger: "item" }, legend: { bottom: 0, top: "auto" },
                  series: [{ type: "pie", radius: ["40%", "70%"], center: ["50%", "42%"], itemStyle: { borderRadius: 6, borderColor: "transparent", borderWidth: 2 }, label: { show: false },
                    data: data.products.map((p) => ({ name: p.product, value: tons ? p.tons : p.wagons })) }] }} />
              </div>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}

function FuelCargoTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(defaultPeriod());
  const [scope, setScope] = useState("all");
  const [tons, setTons] = useState(false);
  const { data, loading, error } = useFetch("/api/dashboard/fuel-cargo", { ...period, scope });
  const k = tons ? "Tons" : "Wagons";
  return (
    <>
      <Head title={t("dash.fuelCargoTitle")} period={period} setPeriod={setPeriod} />
      <div className="rv-card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: t("common.all") }, { value: "local", label: t("dash.local") }, { value: "export", label: t("dash.export") }]} />
        <Checkbox checked={tons} onChange={(e) => setTons(e.target.checked)}>{t("dash.showTons")}</Checkbox>
      </div>
      <ErrorBox error={error} />
      <Loader loading={loading}>
        {data && (
          <div className="rv-grid">
            <div className="rv-card">
              <Chart height={330} option={{
                xAxis: { type: "category", data: data.series.map((r) => r.period) }, yAxis: { type: "value" },
                series: [
                  { name: t("dash.loading"), type: "bar", data: data.series.map((r) => r[`load${k}`]), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#0d9488" } },
                  { name: t("dash.unloading"), type: "bar", data: data.series.map((r) => r[`unload${k}`]), itemStyle: { borderRadius: [6, 6, 0, 0], color: "#f59e0b" } },
                ],
              }} />
            </div>
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))" }}>
              <div className="rv-card">
                <h3>{t("dash.byProduct")}</h3>
                <Chart height={300} option={{
                  grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true }, xAxis: { type: "value" }, yAxis: { type: "category", data: data.products.map((p) => p.product) },
                  series: [
                    { name: t("dash.loading"), type: "bar", stack: "a", data: data.products.map((p) => p[`load${k}`]), itemStyle: { color: "#0d9488" } },
                    { name: t("dash.unloading"), type: "bar", stack: "a", data: data.products.map((p) => p[`unload${k}`]), itemStyle: { color: "#f59e0b", borderRadius: [0, 6, 6, 0] } },
                  ],
                }} />
              </div>
              <div className="rv-card">
                <h3>{t("dash.byCompany")}</h3>
                <Table rowKey="id" size="small" dataSource={data.companies} pagination={{ pageSize: 7 }}
                  columns={[{ title: t("dash.company"), dataIndex: "name" }, { title: t("dash.loading"), render: (r) => fmt(r[`load${k}`]) }, { title: t("dash.unloading"), render: (r) => fmt(r[`unload${k}`]) }]} />
              </div>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}

function IndicatorsDashTab() {
  const { t } = useTranslation();
  const [cat, setCat] = useState(1);
  const [ym, setYm] = useState(dayjs());
  const [mtu, setMtu] = useState();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [mtus, setMtus] = useState([]);
  useEffect(() => { get("/api/map/mtus").then(setMtus); }, []);
  const { data, loading } = useFetch("/api/dashboard/indicators", { category: cat, year: ym.year(), month: ym.month() + 1, mtu, q, page, size });
  const y = ym.year();
  return (
    <>
      <div className="rv-toolbar">
        <h2 className="rv-title">{t("dash.indicatorsTitle")}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search allowClear placeholder={t("common.search")} style={{ width: 200 }} onSearch={(v) => { setQ(v); setPage(1); }} />
          <Select allowClear placeholder={t("dash.searchMtu")} style={{ width: 180 }} value={mtu} onChange={(v) => { setMtu(v); setPage(1); }} options={mtus.map((m) => ({ value: m.id, label: `${m.short} MTU` }))} />
          <DatePicker picker="month" value={ym} onChange={(v) => v && setYm(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} />
        </div>
      </div>
      <div className="rv-pill-tabs" style={{ marginBottom: 14 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((c) => <button key={c} className={`rv-pill ${cat === c ? "active" : ""}`} onClick={() => { setCat(c); setPage(1); }}>{t(`indicators.c${c}`)}</button>)}
      </div>
      <div className="rv-card">
        <Table rowKey="stationId" loading={loading} dataSource={data?.items} scroll={{ x: 900 }} locale={{ emptyText: <NoData /> }}
          pagination={{ current: page, pageSize: size, total: data?.total, onChange: (p, s) => { setPage(p); setSize(s); }, showTotal: (tot) => `${tot} ${t("common.station").toLowerCase()}` }}
          columns={[
            { title: "#", width: 50, render: (_, __, i) => (page - 1) * size + i + 1 },
            { title: t("common.station"), dataIndex: "station", render: (v) => <b>{v}</b> },
            { title: t("indicators.prev", { year: y - 1 }), dataIndex: "prevReport", render: (v) => fmt(v, 1) },
            { title: t("indicators.plan", { year: y }), dataIndex: "plan", render: (v) => fmt(v, 1) },
            { title: t("indicators.report", { year: y }), dataIndex: "report", render: (v) => <b>{fmt(v, 1)}</b> },
            { title: t("indicators.diffPlan"), dataIndex: "diffPlan", render: diffCell },
            { title: t("indicators.diffPrev"), dataIndex: "diffPrev", render: diffCell },
          ]}
          summary={() => data && (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>{t("common.total")}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2}><b>{fmt(data.sum.prevReport, 1)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><b>{fmt(data.sum.plan, 1)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={4}><b>{fmt(data.sum.report, 1)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={5}>{diffCell(data.sum.report - data.sum.plan)}</Table.Summary.Cell>
              <Table.Summary.Cell index={6}>{diffCell(data.sum.report - data.sum.prevReport)}</Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
      </div>
    </>
  );
}

function IncomeDashTab() {
  const { t } = useTranslation();
  const [metric, setMetric] = useState("staff");
  const [year, setYear] = useState(dayjs());
  const [mtu, setMtu] = useState();
  const [page, setPage] = useState(1);
  const [mtus, setMtus] = useState([]);
  useEffect(() => { get("/api/map/mtus").then(setMtus); }, []);
  const { data, loading } = useFetch("/api/dashboard/income-expense", { metric, year: year.year(), mtu, page, size: 10 });
  const isMoney = metric === "income" || metric === "expense";
  const val = (v) => (isMoney ? money(v) : fmt(v));
  return (
    <>
      <div className="rv-toolbar">
        <h2 className="rv-title">{t("dash.incomeTitle")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Select allowClear placeholder={t("dash.searchMtu")} style={{ width: 180 }} value={mtu} onChange={(v) => { setMtu(v); setPage(1); }} options={mtus.map((m) => ({ value: m.id, label: `${m.short} MTU` }))} />
          <DatePicker picker="year" value={year} onChange={(v) => v && setYear(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} />
        </div>
      </div>
      <div className="rv-pill-tabs" style={{ marginBottom: 14 }}>
        {Object.keys(t("dash.metrics", { returnObjects: true })).map((k) => <button key={k} className={`rv-pill ${metric === k ? "active" : ""}`} onClick={() => { setMetric(k); setPage(1); }}>{t(`dash.metrics.${k}`)}</button>)}
      </div>
      <div className="rv-card">
        <Table rowKey="stationId" loading={loading} dataSource={data?.items} bordered scroll={{ x: 1000 }}
          pagination={{ current: page, pageSize: 10, total: data?.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: "#", width: 50, render: (_, __, i) => (page - 1) * 10 + i + 1 },
            { title: t("common.station"), dataIndex: "station", render: (v) => <b>{v}</b> },
            { title: t(`dash.metrics.${metric}`), children: [
              { title: t("dash.lastYear"), dataIndex: "lastYear", render: val }, { title: t("dash.planCol"), dataIndex: "plan", render: val },
              { title: t("dash.fact"), dataIndex: "fact", render: (v) => <b>{val(v)}</b> },
              { title: t("dash.diff"), dataIndex: "diff", render: (v) => <b style={{ color: v >= 0 ? "#16a34a" : "#ef4444" }}>{val(v)}</b> }] },
            { title: t("dash.delivery"), children: [
              { title: t("dash.lastYear"), render: (r) => money(r.delivery?.lastYear) }, { title: t("dash.planCol"), render: (r) => money(r.delivery?.plan) },
              { title: t("dash.diff"), render: (r) => <b style={{ color: r.delivery?.diff >= 0 ? "#16a34a" : "#ef4444" }}>{money(r.delivery?.diff)}</b> }] },
          ]} />
      </div>
    </>
  );
}

function FinanceDashTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(defaultPeriod());
  const { data, loading } = useFetch("/api/dashboard/finance", period);
  return (
    <>
      <Head title={t("dash.financeTitle")} period={period} setPeriod={setPeriod} showMode={false} />
      <Loader loading={loading}>
        {data && (
          <div className="rv-grid">
            <FinanceView data={data} t={t} />
            <div className="rv-card">
              <h3>{t("dash.byMtu")}</h3>
              <Chart height={320} option={{
                xAxis: { type: "category", data: data.byMtu.map((m) => m.name) }, yAxis: [{ type: "value", axisLabel: { formatter: (v) => `${fmt(v / 1e6)}m` } }, { type: "value" }],
                series: [
                  { name: t("station.fin.income"), type: "bar", data: data.byMtu.map((m) => ({ value: m.income, itemStyle: { color: m.color } })), itemStyle: { borderRadius: [6, 6, 0, 0] } },
                  { name: t("station.fin.fines"), type: "bar", data: data.byMtu.map((m) => m.fines), itemStyle: { color: "#fca5a5", borderRadius: [6, 6, 0, 0] } },
                  { name: t("station.fin.loaded"), type: "line", yAxisIndex: 1, smooth: true, data: data.byMtu.map((m) => m.loaded), itemStyle: { color: "#6366f1" } },
                ],
              }} />
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}

const TABS = [["fuel", Fuel, FuelTab], ["fuelCargo", Container, FuelCargoTab], ["indicators", TrendingUp, IndicatorsDashTab], ["income", Wallet, IncomeDashTab], ["finance", Landmark, FinanceDashTab]];

export default function Dashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(store.get("rv_dash_tab", "fuel"));
  useEffect(() => store.set("rv_dash_tab", tab), [tab]);
  const ov = useFetch("/api/dashboard/overview");
  const Active = TABS.find((x) => x[0] === tab)?.[2] || FuelTab;
  const o = ov.data;
  return (
    <div className="rv-page">
      {o && (
        <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 16 }}>
          <StatCard label={t("dash.overview.stations")} value={fmt(o.stations)} sub={`${o.activeStations} ${t("map.mtuStats.active")}`} icon={TrainTrack} color={PALETTE[0]} />
          <StatCard label={t("dash.overview.companies")} value={fmt(o.companies)} icon={Building2} color={PALETTE[2]} />
          <StatCard label={t("dash.overview.cameras")} value={fmt(o.cameras)} icon={Cctv} color={PALETTE[3]} />
          <StatCard label={t("dash.overview.workers")} value={fmt(o.workers)} icon={Users} color={PALETTE[5]} />
          <StatCard label={t("dash.overview.length")} value={`${fmt(o.railwayLength)} km`} icon={Ruler} color={PALETTE[1]} />
          <StatCard label={t("dash.overview.trains")} value={fmt(o.todayTrains)} icon={Train} color={PALETTE[4]} />
        </div>
      )}
      <div className="rv-pill-tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, Icon]) => <button key={k} className={`rv-pill ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}><Icon size={16} />{t(`dash.tabs.${k}`)}</button>)}
      </div>
      <Active />
    </div>
  );
}

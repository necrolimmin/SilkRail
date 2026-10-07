import { DatePicker, Empty, Segmented, Select, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../store/auth";
import { get } from "../api";

export const PALETTE = ["#0d9488", "#f59e0b", "#6366f1", "#ec4899", "#22c55e", "#0ea5e9", "#ef4444", "#a855f7"];

export function StatCard({ label, value, icon: Icon, color = "#0d9488", sub }) {
  return (
    <div className="rv-card rv-stat">
      <div>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {sub && <div className="rv-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
      {Icon && <div className="icon" style={{ background: `${color}1f`, color }}><Icon size={20} /></div>}
    </div>
  );
}

export function Loader({ loading, children, height = 200 }) {
  if (loading) return <div style={{ height, display: "grid", placeItems: "center" }}><Spin /></div>;
  return children;
}

export function NoData() {
  const { t } = useTranslation();
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("common.noData")} />;
}

export function Chart({ option, height = 300 }) {
  const { theme } = useAuth();
  const dark = theme === "dark";
  const base = {
    textStyle: { fontFamily: "Manrope, sans-serif", color: dark ? "#b7c7d6" : "#334155" },
    color: PALETTE,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: dark ? "#132232" : "#fff", borderColor: dark ? "#1f3347" : "#e2e8ee", textStyle: { color: dark ? "#e6eef5" : "#0b1f33" } },
    legend: { top: 0, textStyle: { color: dark ? "#b7c7d6" : "#334155" }, icon: "roundRect" },
  };
  const axisStyle = { axisLine: { lineStyle: { color: dark ? "#1f3347" : "#d9e2ea" } }, splitLine: { lineStyle: { color: dark ? "#1a2c3e" : "#eef2f6" } } };
  const merged = { ...base, ...option };
  if (option.xAxis && !Array.isArray(option.xAxis)) merged.xAxis = { ...axisStyle, ...option.xAxis };
  if (option.yAxis && !Array.isArray(option.yAxis)) merged.yAxis = { ...axisStyle, ...option.yAxis };
  return <ReactECharts option={merged} style={{ height }} notMerge lazyUpdate />;
}

/** Period filter used across dashboard: mode (days/months/years) + range + MTU select */
export function PeriodFilter({ value, onChange, showMtu = true, showMode = true }) {
  const { t } = useTranslation();
  const [mtus, setMtus] = useState([]);
  useEffect(() => { if (showMtu) get("/api/map/mtus").then(setMtus).catch(() => {}); }, [showMtu]);
  const picker = value.mode === "months" ? "month" : value.mode === "years" ? "year" : undefined;
  const onRange = (r) => {
    if (!r) return;
    let [s, e] = r;
    if (value.mode === "months") { s = s.startOf("month"); e = e.endOf("month"); }
    if (value.mode === "years") { s = s.startOf("year"); e = e.endOf("year"); }
    if (e.isAfter(dayjs())) e = dayjs();
    onChange({ ...value, start: s.format("YYYY-MM-DD"), end: e.format("YYYY-MM-DD") });
  };
  const setMode = (mode) => {
    const today = dayjs();
    const start = mode === "days" ? today.startOf("month") : mode === "months" ? today.startOf("year") : today.subtract(1, "year").startOf("year");
    onChange({ ...value, mode, start: start.format("YYYY-MM-DD"), end: today.format("YYYY-MM-DD") });
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {showMtu && (
        <Select allowClear placeholder={t("dash.searchMtu")} style={{ width: 200 }} value={value.mtu}
          onChange={(mtu) => onChange({ ...value, mtu })} options={mtus.map((m) => ({ value: m.id, label: `${m.short} MTU` }))} />
      )}
      <DatePicker.RangePicker picker={picker} value={[dayjs(value.start), dayjs(value.end)]} onChange={onRange} allowClear={false}
        disabledDate={(d) => d.isAfter(dayjs())} placeholder={[t("common.startDate"), t("common.endDate")]} />
      {showMode && (
        <Segmented value={value.mode} onChange={setMode}
          options={[{ value: "days", label: t("common.days") }, { value: "months", label: t("common.months") }, { value: "years", label: t("common.years") }]} />
      )}
    </div>
  );
}

export const defaultPeriod = () => ({ mode: "days", start: dayjs().startOf("month").format("YYYY-MM-DD"), end: dayjs().format("YYYY-MM-DD"), mtu: undefined });

export function useFetch(url, params, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    get(url, params).then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), ...deps]);
  return state;
}

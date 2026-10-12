/* Station tabs fed by the MTU reporting API (through our backend): indicators, finance, wagon supply requests. */
import { DatePicker, Progress, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus, PackageMinus, Coins, Weight } from "lucide-react";
import { Chart, Loader, NoData, StatCard, useFetch } from "../../components/ui";
import { fmt, date } from "../../utils";

const WAGON_TYPES = ["kr", "pl", "pv", "chs", "zer", "sem", "fit", "pr"];

/** Shared states: not configured / not mapped / source down. Returns null when data is usable. */
export function LiveState({ data, error }) {
  const { t } = useTranslation();
  if (error) return <div className="rv-rec-empty"><b>{t("traffic2.errTitle")}</b><span className="rv-muted">{t("traffic2.errText")}</span></div>;
  if (data && data.source !== "api") {
    const nc = data.reason === "not_configured";
    return (
      <div className="rv-rec-empty">
        <b>{t(nc ? "traffic2.notConfigured" : "traffic2.notMapped")}</b>
        <span className="rv-muted">{t(nc ? "traffic2.notConfiguredText" : "traffic2.notMappedText")}</span>
      </div>
    );
  }
  return null;
}

export function SourceLine({ data, extra }) {
  const { t } = useTranslation();
  if (data?.source !== "api") return null;
  return (
    <div className="rv-source">
      {t("traffic2.source")} · {t("traffic2.apiStation")}: <b>{data.apiStation}</b>
      {data.match === "partial" && <span> ({t("traffic2.autoMatched")})</span>}
      {" · "}{t("traffic2.reported", { n: data.reported })}{extra}
    </div>
  );
}

const diffCell = (v, digits = 0) => (v == null ? "—" : <b style={{ color: v >= 0 ? "#16a34a" : "#ef4444" }}>{v > 0 ? "+" : ""}{fmt(v, digits)}</b>);

/* ---------- Ko'rsatkichlar ---------- */
export function IndicatorsTab({ st }) {
  const { t } = useTranslation();
  const [ym, setYm] = useState(dayjs());
  const { data, loading, error } = useFetch(`/api/stations/${st.id}/indicators`, { year: ym.year(), month: ym.month() + 1 });
  const y = ym.year();
  const digits = (r) => (r.key === "statWeight" || r.key === "workingPark" ? 1 : 0);
  const items = data?.items || [];
  const shown = items.filter((r) => r.available);
  const state = <LiveState data={data} error={error} />;
  return (
    <div className="rv-grid">
      <div className="rv-card">
        <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t("station.tabs.indicators")}</h3>
            {data?.source === "api" && <span className="rv-muted" style={{ fontSize: 12 }}>{t("live.ytd", { from: date(data.from), to: date(data.to) })}</span>}
          </div>
          <DatePicker picker="month" value={ym} onChange={(v) => v && setYm(v)} allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs()) || d.isBefore(dayjs("2025-01-01"))} />
        </div>
        <Loader loading={loading} height={300}>
          {state || (
            <>
              <Table rowKey="category" dataSource={items} pagination={false} scroll={{ x: 900 }}
                rowClassName={(r) => (r.available ? "" : "rv-row-na")}
                columns={[
                  { title: t("indicators.type"), render: (r) => (
                    <span><b>{t(`indicators.c${r.category}`)}</b>
                      {r.key === "workingPark" && <Tag style={{ marginLeft: 6 }}>{t("traffic2.avgTag")}</Tag>}
                      {r.key === "statWeight" && <span className="rv-muted" style={{ fontSize: 12 }}> · {t("station.fin.tPerV")}</span>}
                      {!r.available && <Tag style={{ marginLeft: 6 }}>{t("live.notInSource")}</Tag>}
                    </span>) },
                  { title: t("indicators.prev", { year: y - 1 }), dataIndex: "prevReport", render: (v, r) => (v == null ? "—" : fmt(v, digits(r))) },
                  { title: t("indicators.plan", { year: y }), dataIndex: "plan", render: () => <span className="rv-muted" title={t("live.noPlan")}>—</span> },
                  { title: t("indicators.report", { year: y }), dataIndex: "report", render: (v, r) => (v == null ? "—" : <b>{fmt(v, digits(r))}</b>) },
                  { title: t("indicators.diffPrev"), dataIndex: "diffPrev", render: (v, r) => diffCell(v, digits(r)) },
                ]} />
              <SourceLine data={data} extra={<span> · {t("live.noPlan")}</span>} />
            </>
          )}
        </Loader>
      </div>
      {!state && shown.length > 0 && (
        <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          {shown.map((r) => {
            const pct = r.prevReport ? Math.round(((r.report ?? 0) / r.prevReport) * 100) : null;
            return (
              <div key={r.key} className="rv-card rv-ind-card">
                <span className="lbl">{t(`indicators.c${r.category}`)}</span>
                <b className="val">{r.report == null ? "—" : fmt(r.report, digits(r))}</b>
                <span className="rv-muted" style={{ fontSize: 12 }}>{y - 1}: {r.prevReport == null ? "—" : fmt(r.prevReport, digits(r))}</span>
                {pct != null && <Progress percent={Math.min(pct, 200) / 2} showInfo={false} strokeColor={pct >= 100 ? "#16a34a" : "#f59e0b"} size="small" />}
                {pct != null && <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? "#16a34a" : "#d97706" }}>{t("live.vsPrev", { pct })}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Moliyaviy ko'rsatkichlar ---------- */
function useMonthRange() {
  const [r, setR] = useState([dayjs().startOf("month"), dayjs()]);
  const picker = (
    <DatePicker.RangePicker value={r} allowClear={false} onChange={(v) => v && setR(v)}
      disabledDate={(d) => d.isAfter(dayjs()) || d.isBefore(dayjs("2025-01-01"))} />
  );
  return [{ start: r[0].format("YYYY-MM-DD"), end: r[1].format("YYYY-MM-DD") }, picker, r];
}

export function FinanceTab({ st }) {
  const { t } = useTranslation();
  const [params, picker, r] = useMonthRange();
  const { data, loading, error } = useFetch(`/api/stations/${st.id}/finance`, params);
  const state = <LiveState data={data} error={error} />;
  const split = (obj) => (
    <div className="rv-split">
      {[["total", "#6366f1", t("common.total")], ["sng", "#f59e0b", t("live.ofWhichSng")]].map(([k, c, label]) => (
        <div key={k}><span><i style={{ background: c }} />{label}{k === "sng" && <Tag style={{ marginLeft: 6 }} title={t("live.sngHint")}>{t("live.tbd")}</Tag>}</span>
          <b>{fmt(obj[k])} {t("common.pcs")}</b></div>
      ))}
    </div>
  );
  return (
    <div className="rv-grid">
      <div className="rv-toolbar" style={{ margin: 0, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{r[0].format("DD.MM.YYYY")} — {r[1].format("DD.MM.YYYY")}</h3>{picker}
      </div>
      <Loader loading={loading} height={300}>
        {state ? <div className="rv-card">{state}</div> : data && (
          <div className="rv-grid">
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <StatCard label={t("station.fin.loadedTotal")} value={`${fmt(data.loaded.total)} ${t("common.pcs")}`} icon={PackagePlus} color="#0d9488" />
              <StatCard label={t("station.fin.unloadedTotal")} value={`${fmt(data.unloaded.total)} ${t("common.pcs")}`} icon={PackageMinus} color="#0ea5e9" />
              <StatCard label={`${t("live.income")} (UZS)`} value={fmt(data.income)} icon={Coins} color="#16a34a"
                sub={t("live.incomeDays", { n: data.incomeDays })} />
              <StatCard label={t("station.fin.mass")} value={`${fmt(data.loadedMass)} t`} icon={Weight} color="#6366f1"
                sub={data.statLoad != null ? `${t("station.fin.statLoad")}: ${data.statLoad} ${t("station.fin.tPerV")}` : undefined} />
            </div>
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
              <div className="rv-card"><h3>{t("station.fin.loaded")}</h3>{split(data.loaded)}</div>
              <div className="rv-card"><h3>{t("station.fin.unloaded")}</h3>{split(data.unloaded)}</div>
            </div>
            <div className="rv-card">
              <h3>{t("live.incomeByDay")} (UZS)</h3>
              {data.incomeDays ? (
                <Chart height={240} option={{
                  tooltip: { trigger: "axis", valueFormatter: (v) => `${fmt(v)} UZS` }, grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
                  xAxis: { type: "category", data: data.incomeDaily.map((d) => d.day.slice(5)) }, yAxis: { type: "value" },
                  series: [{ type: "bar", barMaxWidth: 22, itemStyle: { color: "#16a34a", borderRadius: [5, 5, 0, 0] }, data: data.incomeDaily.map((d) => d.income) }],
                }} />
              ) : <NoData />}
              <div className="rv-source">{t("live.incomeNote")}</div>
            </div>
            <SourceLine data={data} extra={<span> · {t("live.missingFin")}</span>} />
          </div>
        )}
      </Loader>
    </div>
  );
}

/* ---------- wagon supply requests (shown under Harakat) ---------- */
export function WagonRequests({ st }) {
  const { t } = useTranslation();
  const [params, picker] = useMonthRange();
  const { data, loading, error } = useFetch(`/api/stations/${st.id}/wagon-requests`, params);
  const state = <LiveState data={data} error={error} />;
  const rows = (data?.types || []).filter((r) => r.requested || r.done);
  return (
    <div className="rv-card">
      <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{t("live.requests")}</h3>{picker}
      </div>
      <Loader loading={loading} height={200}>
        {state || (data && (
          <>
            {data.totals.requested > 0 && (
              <div className="rv-traffic-kpis">
                <div style={{ borderLeftColor: "#0d9488" }}><span>{t("live.requested")}</span><b>{fmt(data.totals.requested)}</b></div>
                <div style={{ borderLeftColor: "#f59e0b" }}><span>{t("live.done")}</span><b>{fmt(data.totals.done)}</b></div>
                <div style={{ borderLeftColor: "#6366f1" }}><span>{t("live.fulfilment")}</span><b>{data.totals.pct == null ? "—" : `${data.totals.pct}%`}</b></div>
              </div>
            )}
            {rows.length ? (
              <Table rowKey="type" size="small" pagination={false} dataSource={rows} scroll={{ x: 560 }}
                columns={[
                  { title: t("live.wagonType"), dataIndex: "type", render: (v) => <b>{t(`live.wagons.${v}`)}</b> },
                  { title: t("live.requested"), dataIndex: "requested", render: (v) => fmt(v) },
                  { title: t("live.done"), dataIndex: "done", render: (v) => fmt(v) },
                  { title: t("live.fulfilment"), dataIndex: "pct", width: 220, render: (v) => (v == null ? "—" : (
                    <Progress percent={Math.min(v, 100)} format={() => `${v}%`} size="small" strokeColor={v >= 90 ? "#16a34a" : v >= 50 ? "#f59e0b" : "#ef4444"} />)) },
                ]} />
            ) : <NoData />}
            {data.notes?.length > 0 && (
              <details className="rv-notes">
                <summary>{t("live.notes", { n: data.notes.length })}</summary>
                <ul>
                  {data.notes.map((n, i) => (
                    <li key={i}><span className="when">{date(n.day)} · {n.shift === "noch" ? t("live.night") : t("live.day")}</span><span className="txt">{n.text}</span>{n.by && <span className="by">{n.by}</span>}</li>
                  ))}
                </ul>
              </details>
            )}
            <SourceLine data={data} />
          </>
        ))}
      </Loader>
    </div>
  );
}

export { WAGON_TYPES };

import { DatePicker, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { PackagePlus, PackageMinus, Coins, Siren, Monitor, Wifi, WifiOff, Maximize } from "lucide-react";
import { PanoGallery } from "./StationMedia";
import { Chart, Loader, NoData, StatCard, useFetch } from "../../components/ui";
import CameraPlayer from "../../components/CameraPlayer";
import { fmt, money, date } from "../../utils";

function useRange() {
  const [r, setR] = useState([dayjs().startOf("month"), dayjs()]);
  const picker = <DatePicker.RangePicker value={r} onChange={(v) => v && setR(v)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs())} />;
  return [{ start: r[0].format("YYYY-MM-DD"), end: r[1].format("YYYY-MM-DD") }, picker, r];
}

export function IncomeTab({ st }) {
  const { t } = useTranslation();
  const [params, picker] = useRange();
  const { data, loading } = useFetch(`/api/stations/${st.id}/income`, params);
  const sum = (k) => (data || []).reduce((a, r) => a + r[k], 0);
  return (
    <div className="rv-grid">
      <div className="rv-toolbar" style={{ margin: 0 }}>{picker}</div>
      <Loader loading={loading}>
        {data?.length ? (
          <>
            <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <StatCard label={t("station.fin.income")} value={money(sum("income"))} icon={Coins} color="#16a34a" sub={t("common.uzs")} />
              <StatCard label={t("station.fin.expense")} value={money(sum("expense"))} icon={Siren} color="#ef4444" sub={t("common.uzs")} />
              <StatCard label={t("station.fin.roadFee")} value={money(sum("roadFee"))} icon={Coins} color="#6366f1" sub={t("common.uzs")} />
            </div>
            <div className="rv-card">
              <h3>{t("station.fin.dynamics")}</h3>
              <Chart height={340} option={{
                xAxis: { type: "category", data: data.map((r) => dayjs(r.day).format("DD.MM")) },
                yAxis: { type: "value", axisLabel: { formatter: (v) => `${fmt(v / 1e6)}m` } },
                tooltip: { trigger: "axis", valueFormatter: (v) => `${fmt(v)} UZS` },
                series: [
                  { name: t("station.fin.income"), type: "bar", stack: "a", data: data.map((r) => r.income), itemStyle: { color: "#16a34a" } },
                  { name: t("station.fin.expense"), type: "bar", stack: "b", data: data.map((r) => r.expense), itemStyle: { color: "#ef4444" } },
                  { name: t("station.fin.roadFee"), type: "line", smooth: true, data: data.map((r) => r.roadFee), itemStyle: { color: "#6366f1" } },
                ],
              }} />
            </div>
          </>
        ) : <div className="rv-card"><NoData /></div>}
      </Loader>
    </div>
  );
}

export function FinanceView({ data, t }) {
  const bar = (obj, keys, color) => ({
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true }, legend: { show: false },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${fmt(v)} UZS` },
    xAxis: { type: "value", axisLabel: { formatter: (v) => `${fmt(v / 1e6)}m` } },
    yAxis: { type: "category", data: keys.map((k) => t(`station.fin.${k}`)), axisTick: { show: false } },
    series: [{ type: "bar", data: keys.map((k) => obj[k]), barWidth: 16, itemStyle: { color, borderRadius: 8 }, label: { show: true, position: "right", formatter: (p) => `${fmt(p.value / 1e6, 1)}m` } }],
  });
  const split = (obj, keys) => (
    <div style={{ background: "var(--rv-surface-2)", borderRadius: 12, padding: "4px 12px" }}>
      {keys.map(([k, c]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px dashed var(--rv-border)", fontSize: 13.5 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />{k === "total" ? t("common.total") : t(`station.fin.${k}`)}</span>
          <b>{fmt(obj[k])} {t("common.pcs")}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="rv-grid">
      <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <StatCard label={t("station.fin.loadedTotal")} value={`${fmt(data.loaded.total)} ${t("common.pcs")}`} icon={PackagePlus} color="#0d9488" />
        <StatCard label={t("station.fin.unloadedTotal")} value={`${fmt(data.unloaded.total)} ${t("common.pcs")}`} icon={PackageMinus} color="#0ea5e9" />
        <StatCard label={`${t("station.fin.incomeTotal")} (UZS)`} value={money(data.incomeTotal)} icon={Coins} color="#16a34a" />
        <StatCard label={`${t("station.fin.finesTotal")} (UZS)`} value={money(data.finesTotal)} icon={Siren} color="#ef4444" />
      </div>
      <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <div className="rv-card"><h3>{t("station.fin.loaded")}</h3>{split(data.loaded, [["local", "#0d9488"], ["export", "#f59e0b"], ["total", "#6366f1"]])}</div>
        <div className="rv-card"><h3>{t("station.fin.unloaded")}</h3>{split(data.unloaded, [["local", "#0d9488"], ["import", "#f59e0b"], ["total", "#6366f1"]])}</div>
        <div className="rv-card"><h3>{t("station.fin.income")} (UZS)</h3><Chart height={220} option={bar(data.income, ["podacha", "manyovr", "promivka", "dopSbor"], "#16a34a")} /></div>
        <div className="rv-card"><h3>{t("station.fin.fines")} (UZS)</h3><Chart height={220} option={bar(data.fines, ["emptyVagon", "overload", "notPlan", "notCleaning", "container"], "#ef4444")} /></div>
        <div className="rv-card">
          <h3>{t("station.fin.statLoad")}</h3>
          <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "space-around", height: 180 }}>
            <div style={{ textAlign: "center" }}><div className="rv-muted" style={{ fontSize: 12 }}>{t("station.fin.mass")}</div><div style={{ fontSize: 28, fontWeight: 800 }}>{fmt(data.loadedMass)} t</div></div>
            <div style={{ textAlign: "center" }}><div className="rv-muted" style={{ fontSize: 12 }}>{t("station.fin.statLoad")}</div><div style={{ fontSize: 28, fontWeight: 800, color: "var(--rv-primary)" }}>{data.statLoad}</div><div className="rv-muted">{t("station.fin.tPerV")}</div></div>
          </div>
        </div>
        <div className="rv-card"><h3>{t("station.fin.roadFee")} (UZS)</h3>
          <Chart height={200} option={{ tooltip: { trigger: "item", valueFormatter: (v) => `${fmt(v)} UZS` }, legend: { orient: "vertical", right: 0, top: "middle" },
            series: [{ type: "pie", radius: ["45%", "75%"], center: ["35%", "50%"], label: { show: false }, data: ["local", "export", "import", "smgs"].map((k) => ({ name: t(`station.fin.${k}`), value: data.roadFee[k] })) }] }} />
        </div>
      </div>
    </div>
  );
}

export function FinanceTab({ st }) {
  const { t } = useTranslation();
  const [params, picker, r] = useRange();
  const { data, loading } = useFetch(`/api/stations/${st.id}/finance`, params);
  return (
    <div className="rv-grid">
      <div className="rv-toolbar" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>{r[0].format("DD.MM.YYYY")} — {r[1].format("DD.MM.YYYY")}</h3>{picker}
      </div>
      <Loader loading={loading}>{data && <FinanceView data={data} t={t} />}</Loader>
    </div>
  );
}

export function ComputersTab({ st }) {
  const { t } = useTranslation();
  const { data, loading } = useFetch(`/api/stations/${st.id}/computers`);
  return (
    <Loader loading={loading}>
      {data && (
        <div className="rv-grid">
          <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <StatCard label={t("station.comp.total")} value={data.total} icon={Monitor} />
            <StatCard label={t("station.comp.online")} value={data.online} icon={Wifi} color="#16a34a" />
            <StatCard label={t("station.comp.offline")} value={data.offline} icon={WifiOff} color="#ef4444" />
          </div>
          <div className="rv-card">
            <Table rowKey="id" size="small" dataSource={data.items} scroll={{ x: 1400 }} pagination={{ pageSize: 8 }} locale={{ emptyText: <NoData /> }}
              columns={[
                { title: "#", width: 44, render: (_, __, i) => i + 1 },
                { title: t("common.status"), dataIndex: "online", render: (v) => <Tag color={v ? "green" : "default"}>{v ? t("common.online") : t("common.offline")}</Tag> },
                { title: t("station.comp.company"), dataIndex: "company" }, { title: t("station.comp.model"), dataIndex: "model" },
                { title: t("station.comp.monitor"), dataIndex: "monitor" }, { title: t("station.comp.ups"), dataIndex: "ups" }, { title: t("station.comp.printer"), dataIndex: "printer" },
                { title: t("station.comp.inv"), dataIndex: "inventoryNo" }, { title: t("station.comp.radmin"), dataIndex: "radminId" }, { title: t("station.comp.anydesk"), dataIndex: "anydeskId" },
                { title: t("station.comp.position"), dataIndex: "positionType" }, { title: t("station.comp.entered"), dataIndex: "enteredAt", render: date },
              ]} />
          </div>
        </div>
      )}
    </Loader>
  );
}

export function CamerasTab({ st }) {
  const { t } = useTranslation();
  const { data, loading } = useFetch(`/api/stations/${st.id}/cameras`);
  return (
    <Loader loading={loading}>
      {data?.length ? (
        <div className="rv-cam-grid">{data.map((c) => <CameraPlayer key={c.id} url={c.streamUrl} online={c.online} name={c.name} controls />)}</div>
      ) : <div className="rv-card" style={{ textAlign: "center", padding: 40 }}><NoData /><div className="rv-muted">{t("station.noCamera")}</div></div>}
    </Loader>
  );
}

/** Minimal equirectangular 360° viewer (three.js), drag to look around, wheel to zoom. */
function Panorama({ url }) {
  const el = useRef();
  useEffect(() => {
    const box = el.current;
    const w = box.clientWidth, h = box.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    box.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 1, 1100);
    const geo = new THREE.SphereGeometry(500, 60, 40);
    geo.scale(-1, 1, 1);
    const tex = new THREE.TextureLoader().load(url);
    // keep the canvas sized to its box (fullscreen, window resize)
    const ro = new ResizeObserver(() => {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    });
    ro.observe(box);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));
    let lon = 0, lat = 0, down = null, raf, auto = true;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY, lon, lat }; auto = false; };
    const onMove = (e) => { if (!down) return; lon = (down.x - e.clientX) * 0.15 + down.lon; lat = (e.clientY - down.y) * 0.15 + down.lat; };
    const onUp = () => { down = null; };
    const onWheel = (e) => { e.preventDefault(); camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.05, 30, 95); camera.updateProjectionMatrix(); };
    const c = renderer.domElement;
    c.style.cursor = "grab";
    c.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    c.addEventListener("wheel", onWheel, { passive: false });
    const loop = () => {
      if (auto) lon += 0.03;
      lat = Math.max(-85, Math.min(85, lat));
      const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      renderer.dispose(); geo.dispose(); tex.dispose(); box.removeChild(c);
    };
  }, [url]);
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : el.current?.parentElement.requestFullscreen?.().catch(() => {}));
  return (
    <div className="rv-pano-view">
      <div ref={el} style={{ width: "100%", height: "100%" }} />
      <button type="button" className="fs" onClick={full} aria-label="fullscreen"><Maximize size={16} /></button>
    </div>
  );
}

export function PanoTab({ st, onChange }) {
  return <PanoGallery st={st} onChange={onChange} Viewer={Panorama} />;
}

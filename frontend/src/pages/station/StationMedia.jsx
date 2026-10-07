import { App, AutoComplete, Button, Form, Input, InputNumber, Modal, Popconfirm, Progress, Select, Switch, Tag, Upload } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sun, Moon, Cloud, CloudSun, CloudMoon, CloudFog, CloudRain, CloudSnow, CloudLightning, Wind, ImagePlus, Trash2, ChevronLeft, ChevronRight, Pencil, Radio,
  FolderArchive, Footprints, Maximize,
} from "lucide-react";
import api, { get } from "../../api";
import { useAuth, isAdmin } from "../../store/auth";
import { dateTime } from "../../utils";

/* ---------- upload (admin only) ---------- */
const LIMIT_MB = { photo: 15, pano: 80, tour: 600 };
const ACCEPT = { photo: "image/jpeg,image/png,image/webp", pano: "image/jpeg,image/png,image/webp", tour: ".zip,application/zip" };

/** Button that uploads one image to /api/stations/{id}/media and hands the new media lists to onDone. */
export function MediaUpload({ st, kind, title, onDone, children, icon, ...btn }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [pct, setPct] = useState(null);
  const send = async ({ file }) => {
    const isZip = /\.zip$/i.test(file.name);
    if (kind === "tour" ? !isZip : !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      message.error(kind === "tour" ? t("media.badZip") : t("media.badType")); return;
    }
    if (file.size > LIMIT_MB[kind] * 1024 * 1024) { message.error(t("media.tooLarge", { mb: LIMIT_MB[kind] })); return; }
    if (kind === "pano") {
      // equirectangular 360° images are 2:1; warn (but still allow) for other shapes
      const ratio = await new Promise((res) => { const i = new Image(); i.onload = () => res(i.width / i.height); i.onerror = () => res(2); i.src = URL.createObjectURL(file); });
      if (Math.abs(ratio - 2) > 0.1) message.warning(t("media.notEquirect"));
    }
    const fd = new FormData();
    fd.append("kind", kind);
    if (title) fd.append("title", title);
    fd.append("file", file);
    setPct(0);
    try {
      const { data } = await api.post(`/api/stations/${st.id}/media`, fd, { onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)) });
      message.success(t("media.uploaded"));
      onDone(data);
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = { too_large: t("media.tooLarge", { mb: LIMIT_MB[kind] }), type: kind === "tour" ? t("media.badZip") : t("media.badType"),
        bad_zip: t("media.badZip"), no_index: t("media.noIndex") }[d];
      message.error(msg || t("common.error"));
    } finally { setPct(null); }
  };
  return (
    <Upload accept={ACCEPT[kind]} showUploadList={false} customRequest={send} disabled={pct !== null}>
      {pct !== null
        ? <div style={{ width: 170 }}><Progress percent={pct} size="small" status="active" format={(p) => (p === 100 ? t("media.unpacking") : `${p}%`)} /></div>
        : <Button icon={icon || <ImagePlus size={15} />} {...btn}>{children}</Button>}
    </Upload>
  );
}

async function removeMedia(st, id) {
  const { data } = await api.delete(`/api/stations/${st.id}/media/${id}`);
  return data;
}

/* ---------- photo hero ---------- */
export function PhotoHero({ st, onChange, fallback }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [i, setI] = useState(0);
  const photos = st.photos || [];
  const cur = photos[Math.min(i, photos.length - 1)];
  const apply = (media, last) => { onChange({ ...st, ...media }); setI(last ? media.photos.length - 1 : 0); };
  return (
    <div className="rv-photo-hero">
      {cur ? <img src={cur.url} alt={cur.title || st.name} className="rv-hero-img" style={{ objectFit: "cover", display: "block" }} /> : fallback}
      {photos.length > 1 && (
        <>
          <button className="nav prev" onClick={() => setI((i - 1 + photos.length) % photos.length)} aria-label={t("media.prev")}><ChevronLeft size={18} /></button>
          <button className="nav next" onClick={() => setI((i + 1) % photos.length)} aria-label={t("media.next")}><ChevronRight size={18} /></button>
          <div className="dots">{photos.map((p, k) => <i key={p.url} className={k === i ? "on" : ""} />)}</div>
        </>
      )}
      {admin && (
        <div className="tools">
          <MediaUpload st={st} kind="photo" size="small" onDone={(m) => apply(m, true)}>{t("media.addPhoto")}</MediaUpload>
          {cur?.id && (
            <Popconfirm title={t("media.deletePhoto")} okButtonProps={{ danger: true }} onConfirm={async () => apply(await removeMedia(st, cur.id), false)}>
              <Button size="small" danger icon={<Trash2 size={14} />} aria-label={t("common.delete")} />
            </Popconfirm>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- live weather ---------- */
const WICON = { clear: [Sun, Moon], partly: [CloudSun, CloudMoon], cloudy: [Cloud, Cloud], fog: [CloudFog, CloudFog], rain: [CloudRain, CloudRain], snow: [CloudSnow, CloudSnow], storm: [CloudLightning, CloudLightning], wind: [Wind, Wind] };

export function WeatherCard({ st }) {
  const { t } = useTranslation();
  const [w, setW] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => get(`/api/stations/${st.id}/weather`).then((d) => alive && setW(d)).catch(() => {});
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [st.id]);
  const [Day, Night] = WICON[w?.condition] || WICON.clear;
  const Icon = w && !w.isDay ? Night : Day;
  return (
    <div className="rv-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>{t("station.weather")}</h3>
          {w && (w.live
            ? <span className="rv-live-chip"><Radio size={12} />{t("weather.live")}</span>
            : <Tag>{t("weather.estimate")}</Tag>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, minHeight: 64 }}>
          {w ? (
            <>
              <Icon size={48} color={w.isDay ? "#f59e0b" : "#818cf8"} />
              <div><div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{w.temp > 0 ? "+" : ""}{w.temp}°C</div><div className="rv-muted">{t(`weather.${w.condition}`)}</div></div>
            </>
          ) : <span className="rv-muted">{t("common.loading")}</span>}
        </div>
      </div>
      {w && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13 }}>
          <span className="rv-muted">{t("weather.humidity")}: <b style={{ color: "var(--rv-text)" }}>{w.humidity}%</b></span>
          <span className="rv-muted">{t("weather.windSpeed")}: <b style={{ color: "var(--rv-text)" }}>{w.wind}</b></span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Tag color={st.isActive ? "green" : "default"}>{st.isActive ? t("map.active") : t("map.passive")}</Tag>
        {w?.live && <span className="rv-muted" style={{ fontSize: 11 }}>{w.source} · {dateTime(w.observedAt)}</span>}
      </div>
    </div>
  );
}

/* ---------- edit general info (admin only) ---------- */
const SUGGEST = {
  pointType: ["Ajratilgan", "To'xtash punkti"],
  stationRole: ["Yo'lovchi", "Yuk", "Oraliq", "Saralash", "Uchastka"],
  stationClass: ["Stansiya", "Bekat", "Razyezd", "Post"],
  category: ["Oliy", "Birinchi", "Ikkinchi", "Uchinchi", "To'rtinchi", "Beshinchi"],
};

export function StationEditButton({ st, onChange }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isAdmin(user)) return null;
  const opCodeNames = t("opCodes", { returnObjects: true }) || {};
  const save = async (v) => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/api/stations/${st.id}`, v);
      onChange({ ...st, ...data });
      message.success(t("map.edit.saved"));
      setOpen(false);
    } catch { message.error(t("common.error")); } finally { setBusy(false); }
  };
  const txt = (name, label, extra = {}) => (
    <Form.Item name={name} label={label} {...extra}>
      {SUGGEST[name] ? <AutoComplete options={SUGGEST[name].map((x) => ({ value: x }))} filterOption={false} /> : <Input />}
    </Form.Item>
  );
  const sw = (name, label) => <Form.Item name={name} label={label} valuePropName="checked"><Switch /></Form.Item>;
  return (
    <>
      <Button size="small" icon={<Pencil size={14} />} onClick={() => setOpen(true)}>{t("station.edit.button")}</Button>
      <Modal open={open} title={`${t("station.edit.title")}: ${st.name}`} onCancel={() => setOpen(false)} footer={null} width={760} destroyOnHidden>
        <Form layout="vertical" requiredMark={false} onFinish={save} initialValues={{
          esrCode: st.esrCode, roadCode: st.roadCode, networkMark: st.networkMark, country: st.country, road: st.road,
          pointType: st.pointType, stationRole: st.stationRole, stationClass: st.stationClass, category: st.category,
          cargoOperations: st.cargoOperations, transitPoint: st.transitPoint, isOperator: st.isOperator, isActive: st.isActive,
          inn: st.inn, lat: st.lat, lng: st.lng, leader: { ...st.leader }, corpLeader: st.corpLeader, opCodes: st.opCodes,
        }}>
          <div className="rv-edit-section">{t("station.general")}</div>
          <div className="rv-form-grid">
            {txt("roadCode", t("station.f.roadCode"))}
            {txt("networkMark", t("station.f.networkMark"))}
            {txt("esrCode", t("station.f.esr"), { rules: [{ required: true, whitespace: true }] })}
            {txt("country", t("station.f.country"))}
            {txt("road", t("station.f.road"))}
            {txt("stationClass", t("station.f.stationClass"))}
            {txt("stationRole", t("station.f.stationRole"))}
            {txt("category", t("station.f.category"))}
            {txt("pointType", t("station.f.pointType"))}
            {txt("inn", t("station.f.inn"))}
            <Form.Item name="lat" label={t("station.f.lat")}><InputNumber min={-90} max={90} step={0.0001} precision={6} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="lng" label={t("station.f.lng")}><InputNumber min={-180} max={180} step={0.0001} precision={6} style={{ width: "100%" }} /></Form.Item>
          </div>
          <div className="rv-form-grid four">
            {sw("transitPoint", t("station.f.transit"))}
            {sw("cargoOperations", t("station.f.cargo"))}
            {sw("isOperator", t("station.f.operator"))}
            {sw("isActive", t("map.active"))}
          </div>
          <div className="rv-edit-section">{t("station.contact")}</div>
          <div className="rv-form-grid">
            <Form.Item name={["leader", "fullName"]} label={t("station.leader")}><Input /></Form.Item>
            <Form.Item name={["leader", "phone"]} label={t("station.edit.phone")}><Input /></Form.Item>
            <Form.Item name={["leader", "email"]} label="E-mail" rules={[{ type: "email" }]}><Input /></Form.Item>
            <Form.Item name="corpLeader" label={t("station.corpLeader")}><Input /></Form.Item>
          </div>
          <div className="rv-edit-section">{t("station.codes")}</div>
          <Form.Item name="opCodes">
            <Select mode="tags" tokenSeparators={[","]} optionFilterProp="label"
              options={Object.entries(opCodeNames).map(([k, v]) => ({ value: k, label: `${k} — ${v}` }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>{t("common.save")}</Button>
        </Form>
      </Modal>
    </>
  );
}

/* ---------- 360° panoramas ---------- */
export function PanoGallery({ st, onChange, Viewer }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const panos = st.panoramas || [];
  const [sel, setSel] = useState(0);
  const [title, setTitle] = useState("");
  const cur = panos[Math.min(sel, panos.length - 1)];
  const apply = (media, last) => { onChange({ ...st, ...media }); setSel(last ? media.panoramas.length - 1 : 0); };
  return (
    <div className="rv-grid">
      {(panos.length > 0 || admin) && (
        <div className="rv-pano-bar">
          <div className="list">
            {panos.map((p, k) => (
              <button key={p.url} className={`rv-pill ${k === sel ? "active" : ""}`} onClick={() => setSel(k)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {p.type === "tour" && <Footprints size={13} />}{p.title || `360° #${k + 1}`}
              </button>
            ))}
          </div>
          {admin && (
            <div className="add">
              <Input size="small" placeholder={t("media.panoTitle")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} style={{ width: 180 }} />
              <MediaUpload st={st} kind="pano" title={title} type="primary" size="small" onDone={(m) => { setTitle(""); apply(m, true); }}>{t("media.addPano")}</MediaUpload>
              <MediaUpload st={st} kind="tour" title={title} size="small" icon={<FolderArchive size={15} />} onDone={(m) => { setTitle(""); apply(m, true); }}>{t("media.addTour")}</MediaUpload>
              {cur?.id && (
                <Popconfirm title={t("media.deletePano")} okButtonProps={{ danger: true }} onConfirm={async () => apply(await removeMedia(st, cur.id), false)}>
                  <Button size="small" danger icon={<Trash2 size={14} />} aria-label={t("common.delete")} />
                </Popconfirm>
              )}
            </div>
          )}
        </div>
      )}
      {cur ? (cur.type === "tour" ? <TourFrame key={cur.url} url={cur.url} title={cur.title || st.name} /> : <Viewer key={cur.url} url={cur.url} />) : (
        <div className="rv-card" style={{ textAlign: "center", padding: 40 }}>
          <div className="rv-muted">{t("station.no360")}</div>
          {admin && <div className="rv-muted" style={{ fontSize: 12, marginTop: 6 }}>{t("media.panoHint")}</div>}
        </div>
      )}
    </div>
  );
}

/** A whole virtual tour (Pano2VR, krpano…) in a sandboxed frame: it runs in an opaque origin and cannot reach the app. */
function TourFrame({ url, title }) {
  const { t } = useTranslation();
  const full = (e) => {
    const box = e.currentTarget.parentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen?.().catch(() => {});
  };
  return (
    <div className="rv-pano-view">
      <iframe src={url} title={title} sandbox="allow-scripts allow-pointer-lock allow-popups"
        allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking" allowFullScreen loading="lazy"
        style={{ border: 0, width: "100%", height: "100%", display: "block" }} />
      <button type="button" className="fs" onClick={full} aria-label={t("common.fullscreen")} title={t("common.fullscreen")}><Maximize size={16} /></button>
    </div>
  );
}

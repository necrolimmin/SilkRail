import { AutoComplete, Button, Form, InputNumber, Modal, Select, Slider, Switch, App, Progress, Popconfirm } from "antd";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, Popup, useMapEvents } from "react-leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Layers, SlidersHorizontal, Flag, Plus, Minus, Maximize, Crosshair, Search, TrainFront, Fuel, Route, MapPin, Landmark,
  TriangleAlert, Zap, Cable, Ruler, Milestone, BarChart3, X, Pencil, MapPinPlus, Trash2, Move, ChevronUp, BookOpen,
} from "lucide-react";
import { get } from "../api";
import api from "../api";
import { store, dateTime } from "../utils";
import { BASEMAPS, ICONS, ClusterLayer, MapRefBridge, trainIcon, kmIcon, markerIcon, markerDefaultColor, IconPreview, MARKER_GROUPS, MARKER_COLORS, LABELLED_KINDS, OBJ_COLORS } from "./map/layers";
import MapLegend from "./map/Legend";
import uzb from "./map/uzb.json";
import StationModal from "./station/StationModal";
import CameraPlayer from "../components/CameraPlayer";
import RailTrack from "../components/RailTrack";
import { useAuth } from "../store/auth";
import { Input } from "antd";

const UZ_BOUNDS = [[37.1, 55.9], [45.6, 73.2]];
const DEFAULT_LAYERS = { trains: false, fuel: false, markers: true, borders: true, warnings: false, electric: false, optic: false, km: false, pickets: false };
// editable object kind -> data key / list endpoint
const KIND_DATA = { station: "stations", company: "companies", camera: "cameras", crossing: "crossings", warning: "warnings", marker: "markers" };
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function MapEvents({ onChange, onClick }) {
  const idle = useRef(null);
  // html.rv-moving pauses decorative animations and backdrop blur while the map is dragged or zoomed
  const moving = () => { clearTimeout(idle.current); document.documentElement.classList.add("rv-moving"); };
  const stopped = () => { clearTimeout(idle.current); idle.current = setTimeout(() => document.documentElement.classList.remove("rv-moving"), 180); };
  const map = useMapEvents({
    movestart: moving, zoomstart: moving,
    moveend: () => { stopped(); onChange(map); }, zoomend: () => onChange(map), click: (e) => onClick?.(e.latlng),
  });
  useEffect(() => { onChange(map); }, [map, onChange]);
  useEffect(() => () => { clearTimeout(idle.current); document.documentElement.classList.remove("rv-moving"); }, []);
  return null;
}

export default function MapPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [map, setMap] = useState(null);
  const [view, setView] = useState({ zoom: 6, bbox: null });
  const [basemap, setBasemap] = useState(store.get("rv_basemap", "base"));
  const [bmOpen, setBmOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const [objects, setObjects] = useState(store.get("rv_objects", ["stations"]));
  const [layers, setLayers] = useState({ ...DEFAULT_LAYERS, ...store.get("rv_layers", {}) });
  const [brightness, setBrightness] = useState(100);
  const [mtuId, setMtuId] = useState();
  const [divide, setDivide] = useState(false);
  const [showMtuStats, setShowMtuStats] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchOpts, setSearchOpts] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [kmCfg, setKmCfg] = useState({ selected: false, sections: false, all: false });
  const [data, setData] = useState({ stations: [], companies: [], cameras: [], crossings: [], warnings: [], mtus: [], lines: null, works: [], km: [], trains: [], markers: [] });
  const [stationId, setStationId] = useState(null);
  const [camera, setCamera] = useState(null);
  const [repairTypes, setRepairTypes] = useState([]);
  const [lineList, setLineList] = useState([]);
  const [addMode, setAddMode] = useState(null); // null | "station" | "marker"
  const [newSt, setNewSt] = useState(null); // {lat, lng, mode}
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null); // {kind, id, name, ...}
  const [showCustom, setShowCustom] = useState(store.get("rv_custom_markers", true));
  // sliding indicator under the open dock section (same idea as the header)
  const dockRef = useRef(null);
  const [dockOpen, setDockOpen] = useState(false); // hidden at the bottom until the arrow is pressed
  const toggleDock = () => { setDockOpen((o) => !o); setPanel(null); };
  const [dockInd, setDockInd] = useState(null);
  useEffect(() => {
    const place = () => {
      const b = dockRef.current?.querySelector(".rv-dock-btn.active");
      setDockInd(b ? { left: b.offsetLeft, width: b.offsetWidth, edit: b.classList.contains("edit") } : null);
    };
    const raf = requestAnimationFrame(place);
    // buttons change width when their counter appears or the language changes — follow them
    const ro = new ResizeObserver(place);
    dockRef.current?.querySelectorAll(".rv-dock-btn").forEach((el) => ro.observe(el));
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("resize", place); };
  }, [panel, dockOpen]);
  const { user } = useAuth();
  const canEdit = ["superadmin", "admin"].includes(user?.role);
  const reload = async (kind) => patch({ [KIND_DATA[kind]]: await get(`/api/map/${KIND_DATA[kind]}`) });
  const saveStation = async (v) => {
    try {
      const r = await api.post("/api/map/stations", { ...v, lat: newSt.lat, lng: newSt.lng });
      message.success(`${v.name}: ${t("map.stationAdded")} (${Math.round(r.data.snappedKm * 1000)} m)`);
      setNewSt(null); setAddMode(null);
      reload("station");
    } catch (e) { message.error(e.response?.data?.detail === "too_far_from_track" ? t("map.tooFar") : t("common.error")); }
  };
  const saveMarker = async (v) => {
    try {
      await api.post("/api/map/markers", { ...v, lat: newSt.lat, lng: newSt.lng });
      message.success(t("map.edit.markerAdded"));
      setNewSt(null); setAddMode(null);
      reload("marker");
    } catch { message.error(t("common.error")); }
  };
  const moveObject = async (it, ll, revert) => {
    const { kind, id, name } = it.edit;
    const lat = +ll.lat.toFixed(6), lng = +ll.lng.toFixed(6);
    try {
      await api.patch(`/api/map/objects/${kind}/${id}`, { lat, lng });
      setData((d) => ({ ...d, [KIND_DATA[kind]]: d[KIND_DATA[kind]].map((x) => (x.id === id ? { ...x, lat, lng } : x)) }));
      message.success(`${name}: ${t("map.edit.moved")}`);
    } catch { revert?.(); message.error(t("common.error")); }
  };
  const saveEdit = async (v) => {
    try {
      await api.patch(`/api/map/objects/${editing.kind}/${editing.id}`, v);
      message.success(t("map.edit.saved"));
      reload(editing.kind);
      if (v.lat !== editing.lat || v.lng !== editing.lng) map?.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
      setEditing(null);
    } catch { message.error(t("common.error")); }
  };
  const deleteEdited = async () => {
    try {
      await api.delete(`/api/map/objects/${editing.kind}/${editing.id}`);
      message.success(t("map.edit.deleted"));
      reload(editing.kind);
      setEditing(null);
    } catch { message.error(t("common.error")); }
  };

  useEffect(() => { store.set("rv_basemap", basemap); }, [basemap]);
  useEffect(() => { store.set("rv_objects", objects); }, [objects]);
  useEffect(() => { store.set("rv_layers", layers); }, [layers]);
  useEffect(() => { store.set("rv_custom_markers", showCustom); }, [showCustom]);

  const patch = (p) => setData((d) => ({ ...d, ...p }));
  useEffect(() => {
    Promise.all([get("/api/map/stations"), get("/api/map/companies"), get("/api/map/cameras"), get("/api/map/crossings"),
      get("/api/map/warnings"), get("/api/map/mtus"), get("/api/map/works"), get("/api/map/repair-types"), get("/api/map/line-list"), get("/api/map/markers")])
      .then(([stations, companies, cameras, crossings, warnings, mtus, works, rt, ll, markers]) => { patch({ stations, companies, cameras, crossings, warnings, mtus, works, markers }); setRepairTypes(rt); setLineList(ll); })
      .catch(() => message.error(t("common.error")));
  }, []); // eslint-disable-line
  useEffect(() => { get("/api/map/lines", { divideByMtu: divide }).then((lines) => patch({ lines })); }, [divide]);

  // live trains
  useEffect(() => {
    if (!layers.trains) return;
    const load = () => get("/api/map/trains").then((trains) => patch({ trains }));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [layers.trains]);

  // km marks / pickets depend on zoom
  const showKm = layers.km || kmCfg.all;
  useEffect(() => {
    if (!showKm || !view.bbox) { patch({ km: [] }); return; }
    const params = view.zoom >= 15 && layers.pickets ? { pickets: true, bbox: view.bbox } : view.zoom >= 11 ? { bbox: view.bbox } : {};
    get("/api/map/km-marks", params).then((km) => patch({ km }));
  }, [showKm, layers.pickets, !!view.bbox, view.zoom >= 11 ? view.bbox : "overview"]); // eslint-disable-line

  const onView = useCallback((m) => {
    const b = m.getBounds();
    setView({ zoom: m.getZoom(), bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(3)).join(",") });
  }, []);

  const inMtu = useCallback((s) => !mtuId || s.mtuId === mtuId, [mtuId]);
  const stationById = useMemo(() => Object.fromEntries(data.stations.map((s) => [s.id, s])), [data.stations]);

  const markerItems = useMemo(() => {
    if (!layers.markers) return [];
    const items = [];
    const has = (k) => objects.includes("all") || objects.includes(k);
    if (has("stations")) data.stations.filter(inMtu).forEach((s) => items.push({
      lat: s.lat, lng: s.lng, onClick: () => setStationId(s.id), edit: { kind: "station", id: s.id, name: s.name, esr: s.code },
      type: s.isHub ? "hub" : !s.isActive ? "inactive" : s.kind === "halt" ? "halt" : s.kind === "yard" ? "yard" : "station",
      icon: s.isHub ? ICONS.hub : !s.isActive ? ICONS.stationOff : s.kind === "halt" ? ICONS.halt : s.kind === "yard" ? ICONS.yard : ICONS.station,
      label: esc(s.name), tooltip: `<b>${esc(s.name)}</b><br/>ESR ${esc(s.code)}`,
    }));
    const compOk = (c) => !mtuId || stationById[c.stationId]?.mtuId === mtuId;
    const compPopup = (c) => `<b>${esc(c.name)}</b><div style="margin-top:6px;font-size:12px">${t("station.f.inn")}: ${esc(c.inn)}<br/>${t("station.roads.leader")}: ${esc(c.leader)}<br/>${esc(c.phone)}</div>`;
    const compEdit = (c) => ({ kind: "company", id: c.id, name: c.name });
    if (has("companies")) data.companies.filter((c) => (c.kind === "fuel" || c.kind === "industrial") && compOk(c)).forEach((c) => items.push({ lat: c.lat, lng: c.lng, type: c.kind === "fuel" ? "fuel" : "company", icon: c.kind === "fuel" ? ICONS.fuel : ICONS.company, popup: compPopup(c), tooltip: esc(c.name), edit: compEdit(c) }));
    if (has("other")) data.companies.filter((c) => (c.kind === "depot" || c.kind === "other") && compOk(c)).forEach((c) => items.push({ lat: c.lat, lng: c.lng, type: "depot", icon: c.kind === "depot" ? ICONS.depot : ICONS.other, popup: compPopup(c), tooltip: esc(c.name), edit: compEdit(c) }));
    if (has("cameras")) data.cameras.filter((c) => !mtuId || stationById[c.stationId]?.mtuId === mtuId).forEach((c) => items.push({ lat: c.lat, lng: c.lng, type: "camera", icon: c.online ? ICONS.camera : ICONS.cameraOff, tooltip: esc(c.name), onClick: () => setCamera(c), edit: { kind: "camera", id: c.id, name: c.name } }));
    if (has("crossings")) data.crossings.forEach((c) => items.push({
      lat: c.lat, lng: c.lng, type: c.isProtected ? "crossingOk" : "crossingNo", icon: c.isProtected ? ICONS.crossingOk : ICONS.crossingNo, edit: { kind: "crossing", id: c.id, name: c.name },
      popup: `<b>${esc(c.name)}</b><div style="font-size:12px;margin-top:4px">${c.km} km · ${c.isProtected ? t("map.protected") : t("map.unprotected")}</div>`,
    }));
    if (showCustom) data.markers.forEach((x) => items.push({
      lat: x.lat, lng: x.lng, type: OBJ_COLORS[x.kind] ? x.kind : "marker", icon: markerIcon(x.kind, x.color),
      ...(LABELLED_KINDS.includes(x.kind) ? { label: esc(x.name) } : { tooltip: esc(x.name) }),
      popup: `<b>${esc(x.name)}</b>${x.note ? `<div style="margin-top:6px;font-size:12px;white-space:pre-wrap">${esc(x.note)}</div>` : ""}`,
      edit: { kind: "marker", id: x.id, name: x.name, markerKind: x.kind, color: x.color, note: x.note },
    }));
    return items;
  }, [data, objects, layers.markers, inMtu, mtuId, stationById, showCustom, t]);

  const fuelItems = useMemo(() => (layers.fuel ? data.companies.filter((c) => c.kind === "fuel") : []), [layers.fuel, data.companies]);
  const selectedMtu = data.mtus.find((m) => m.id === mtuId);

  const selectMtu = (id) => {
    setMtuId(id);
    const m = data.mtus.find((x) => x.id === id);
    if (m && map) map.flyToBounds([[m.bbox[0], m.bbox[1]], [m.bbox[2], m.bbox[3]]], { padding: [60, 60], duration: 0.8 });
    if (!id && map) map.flyToBounds(UZ_BOUNDS, { duration: 0.8 });
  };

  const lineStyle = (f) => {
    const p = f.properties;
    return { color: divide && p.color ? p.color : basemap === "dark" || basemap === "satellite" ? "#5eead4" : "#0b3b4a", weight: 3.2, opacity: 0.9 };
  };

  const addWork = async (v) => {
    await api.post("/api/map/works", v);
    message.success(t("map.workAdded"));
    patch({ works: await get("/api/map/works") });
  };

  const toggleObj = (k) => setObjects((o) => (k === "all" ? (o.includes("all") ? ["stations"] : ["all"]) : o.includes(k) ? o.filter((x) => x !== k && x !== "all") : [...o.filter((x) => x !== "all"), k]));
  const L_ICONS = { trains: TrainFront, fuel: Fuel, markers: MapPin, borders: Landmark, warnings: TriangleAlert, electric: Zap, optic: Cable, km: Ruler, pickets: Milestone };
  const bm = BASEMAPS[basemap];

  return (
    <div className={`rv-map ${view.zoom < 12 ? "zoom-lo" : ""} ${brightness !== 100 ? "dim" : ""}`} style={brightness !== 100 ? { "--map-b": brightness / 100 } : undefined}>
      <MapContainer bounds={UZ_BOUNDS} zoomControl={false} minZoom={5} maxZoom={18} preferCanvas>
        <MapRefBridge onReady={setMap} />
        <MapEvents onChange={onView} onClick={(ll) => addMode && setNewSt({ lat: ll.lat, lng: ll.lng, mode: addMode })} />
        <TileLayer key={basemap} url={bm.url} attribution={bm.attr} maxNativeZoom={bm.maxNative || 19} maxZoom={18} />
        {bm.labels && <TileLayer key={`${basemap}-labels`} url={bm.labels} maxNativeZoom={bm.maxNative || 19} maxZoom={18} />}
        {layers.borders && <GeoJSON key={`b-${basemap}`} data={uzb} interactive={false} smoothFactor={1.5}
          style={{ color: basemap === "dark" || basemap === "satellite" ? "#5eead4" : "#0d9488", weight: 2, opacity: 0.9, fillColor: "#14b8a6", fillOpacity: 0.04, lineJoin: "round" }} />}
        {layers.borders && divide && data.mtus.map((m) => (
          <Polyline key={m.id} positions={[[m.bbox[0], m.bbox[1]], [m.bbox[0], m.bbox[3]], [m.bbox[2], m.bbox[3]], [m.bbox[2], m.bbox[1]], [m.bbox[0], m.bbox[1]]]}
            pathOptions={{ color: m.color, weight: 1.5, dashArray: "4 6" }} />
        ))}
        {/* the basemap already draws the tracks; our own line overlay is shown only when colouring by MTU */}
        {divide && data.lines && <GeoJSON key={`l-${divide}-${basemap}`} data={data.lines} style={lineStyle} attribution="Rail data © OpenStreetMap contributors"
          onEachFeature={(f, l) => l.bindTooltip(f.properties.title, { sticky: true })} />}
        {layers.electric && data.lines && <GeoJSON key={`e-${divide}`} data={{ ...data.lines, features: data.lines.features.filter((f) => f.properties.electrified) }} style={{ color: "#f59e0b", weight: 7, opacity: 0.35 }} />}
        {layers.optic && data.lines && <GeoJSON key={`o-${divide}`} data={{ ...data.lines, features: data.lines.features.filter((f) => f.properties.optic) }} style={{ color: "#a855f7", weight: 2, dashArray: "2 6", opacity: 0.95 }} />}
        {(kmCfg.selected || kmCfg.sections) && data.works.filter((w) => w.path.length > 1).map((w) => (
          <Polyline key={w.id} positions={w.path} pathOptions={{ color: "#ef4444", weight: kmCfg.selected ? 9 : 6, opacity: 0.75 }}>
            <Tooltip sticky>{w.repairType}: {w.kmStart}–{w.kmEnd} km</Tooltip>
          </Polyline>
        ))}
        <ClusterLayer items={markerItems} showLabels={view.zoom >= 12} editable={canEdit && editMode} onEdit={(it) => setEditing({ ...it.edit, lat: it.lat, lng: it.lng })} onMove={moveObject} />
        {fuelItems.map((c) => <Marker key={`f${c.id}`} position={[c.lat, c.lng]} icon={ICONS.fuel}><Popup><b>{c.name}</b><br />{c.leader}<br />{c.phone}</Popup></Marker>)}
        {layers.warnings && data.warnings.map((w) => {
          const edit = { kind: "warning", id: w.id, name: w.title, lat: w.lat, lng: w.lng };
          return canEdit && editMode
            ? <Marker key={`w${w.id}-e`} position={[w.lat, w.lng]} icon={ICONS.warning[w.level]} draggable
                eventHandlers={{ click: () => setEditing(edit), dragend: (e) => moveObject({ edit }, e.target.getLatLng(), () => e.target.setLatLng([w.lat, w.lng])) }} />
            : <Marker key={`w${w.id}`} position={[w.lat, w.lng]} icon={ICONS.warning[w.level]}><Popup><b>{w.title}</b><br />{dateTime(w.createdAt)}</Popup></Marker>;
        })}
        {layers.trains && data.trains.map((tr) => (
          <Marker key={tr.id} position={[tr.lat, tr.lng]} icon={trainIcon(tr.number, tr.heading)}>
            <Popup><b>{t("map.train")} №{tr.number}</b><br />{tr.line}<br />{t("map.speed")}: {tr.speed} km/h · {t("map.wagons")}: {tr.wagons}</Popup>
          </Marker>
        ))}
        {showKm && view.zoom >= 8 && data.km.map((k, i) => <Marker key={`k${i}`} position={[k.lat, k.lng]} icon={kmIcon(k.km)} interactive={false} />)}
      </MapContainer>

      {/* MTU stats card */}
      {selectedMtu && showMtuStats && (
        <div className="rv-mtu-card rv-card" style={{ boxShadow: "var(--rv-shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ color: selectedMtu.color }}>{selectedMtu.short} MTU</b>
            <X size={16} style={{ cursor: "pointer" }} onClick={() => setShowMtuStats(false)} />
          </div>
          <div className="rv-muted" style={{ fontSize: 12, marginBottom: 12 }}>{selectedMtu.name}</div>
          {[[t("map.mtuStats.totalStations"), `${selectedMtu.totalStations} (${selectedMtu.activeStations} ${t("map.mtuStats.active")})`],
            [t("map.mtuStats.corporations"), selectedMtu.corporations], [t("map.mtuStats.railwayLength"), `${selectedMtu.railwayLength} km`],
            [t("map.mtuStats.code"), selectedMtu.code]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--rv-border)", fontSize: 13 }}><span className="rv-muted">{k}</span><b>{v}</b></div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12 }} className="rv-muted">{t("map.mtuStats.utilization")}</div>
          <Progress percent={selectedMtu.utilization} strokeColor={selectedMtu.color} />
        </div>
      )}

      {/* search */}
      {searchOpen && (
        <div className="rv-search">
          <AutoComplete autoFocus style={{ width: "100%" }} size="large" placeholder={t("map.searchPh")} options={searchOpts} value={searchText} onChange={setSearchText}
            onSearch={(q) => (q.length > 1 ? get("/api/map/search", { q }).then((r) => setSearchOpts(r.map((x) => ({ value: `${x.type}:${x.id}`, label: <span>{x.name} <span className="rv-muted">{x.code || ""}</span></span>, item: x })))) : setSearchOpts([]))}
            onSelect={(_, o) => { setSearchText(o.item.name); map?.flyTo([o.item.lat, o.item.lng], 13, { duration: 0.8 }); if (o.item.type === "station") setStationId(o.item.id); }} />
        </div>
      )}

      {/* right controls */}
      {/* right controls: a railway signal mast in the palette colours; zoom level shown on a small board */}
      <div className="rv-map-controls">
        <div className="rv-ctrl-group">
          <button onClick={() => map?.zoomIn()} aria-label={t("map.zoomIn")} title={t("map.zoomIn")}><Plus size={18} /></button>
          <div className="rv-zoom-board" title={t("map.zoomLevel")}>{String(view.zoom).padStart(2, "0")}</div>
          <button onClick={() => map?.zoomOut()} aria-label={t("map.zoomOut")} title={t("map.zoomOut")}><Minus size={18} /></button>
        </div>
        <div className="rv-ctrl-group">
          <button className={selectedMtu && showMtuStats ? "active" : ""} onClick={() => { setShowMtuStats((s) => !s); if (!mtuId) { setDockOpen(true); setPanel("settings"); } }} title={t("map.mtuStats.show")} aria-label={t("map.mtuStats.show")}><BarChart3 size={18} /></button>
          <button onClick={() => map?.flyToBounds(UZ_BOUNDS, { duration: 0.8 })} title={t("map.fitAll")} aria-label={t("map.fitAll")}><Crosshair size={18} /></button>
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())} title={t("common.fullscreen")} aria-label={t("common.fullscreen")}><Maximize size={18} /></button>
          <button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((s) => !s)} title={t("common.search")} aria-label={t("common.search")}><Search size={18} /></button>
        </div>
      </div>

      {/* basemap switcher */}
      <div className="rv-basemap">
        {bmOpen && (
          <div className="rv-basemap-panel">
            {Object.entries(BASEMAPS).map(([k, v]) => (
              <div key={k} className={`rv-basemap-opt ${basemap === k ? "active" : ""}`} onClick={() => { setBasemap(k); setBmOpen(false); }}>
                <div className="thumb" style={{ backgroundImage: `url(${v.thumb})` }} />{t(`map.${k}`)}
              </div>
            ))}
          </div>
        )}
        <button className="rv-basemap-btn" style={{ backgroundImage: `url(${bm.thumb})`, backgroundSize: "cover" }} onClick={() => setBmOpen((o) => !o)}>
          <span><Layers size={11} style={{ verticalAlign: -1 }} /> {t("map.layers")}</span>
        </button>
      </div>

      {/* bottom dock + popovers */}
      {panel === "objects" && (
        <div className="rv-popover" style={{ width: 300 }}>
          {[["stations", t("map.stations")], ["companies", t("map.companies")], ["cameras", t("map.cameras")], ["crossings", t("map.crossings")], ["other", t("map.other")], ["all", t("map.all")]].map(([k, l]) => (
            <div key={k} className="rv-layer-row" style={{ cursor: "pointer", justifyContent: "space-between" }} onClick={() => toggleObj(k)}>
              <b style={{ fontSize: 13.5 }}>{l}</b>
              <Switch size="small" checked={objects.includes(k) || (objects.includes("all") && k !== "all") || (k === "all" && objects.includes("all"))} />
            </div>
          ))}
          <div className="rv-layer-row" style={{ cursor: "pointer", justifyContent: "space-between" }} onClick={() => setShowCustom((v) => !v)}>
            <b style={{ fontSize: 13.5 }}>{t("map.edit.customMarkers")} ({data.markers.length})</b>
            <Switch size="small" checked={showCustom} />
          </div>
        </div>
      )}
      {panel === "settings" && (
        <div className="rv-popover">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{t("map.selectMtu")}</div>
          <Select allowClear style={{ width: "100%" }} placeholder={t("common.select")} value={mtuId} onChange={selectMtu}
            options={data.mtus.map((m) => ({ value: m.id, label: <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: m.color, marginRight: 8 }} />{m.name}</span> }))} />
          <div className="rv-layer-row" style={{ marginTop: 6 }}>
            <div className="ic"><Route size={20} /></div>
            <div style={{ flex: 1 }}><div className="t">{t("map.mtuStats.divide")}</div><div className="d">{t("map.mtuStats.divideLines")}</div></div>
            <Switch size="small" checked={divide} onChange={setDivide} />
          </div>
          <div style={{ padding: "4px 10px" }}><span className="rv-muted" style={{ fontSize: 12 }}>{t("map.brightness")}</span><Slider min={50} max={130} value={brightness} onChange={setBrightness} /></div>
          <div style={{ borderTop: "1px solid var(--rv-border)", margin: "6px 0" }} />
          {Object.keys(DEFAULT_LAYERS).map((k) => {
            const Icon = L_ICONS[k];
            const [title, desc] = t(`map.layer.${k}`);
            return (
              <div key={k} className="rv-layer-row">
                <div className="ic"><Icon size={20} /></div>
                <div style={{ flex: 1 }}><div className="t">{title}</div><div className="d">{desc}</div></div>
                <Switch size="small" checked={layers[k]} onChange={(v) => setLayers((l) => ({ ...l, [k]: v }))} />
              </div>
            );
          })}
        </div>
      )}
      {panel === "legend" && (
        <div className="rv-popover rv-legend-pop">
          <div className="rv-edit-head">
            <div><b>{t("map.legend.title")}</b><span>{t("map.legend.hint")}</span></div>
            <X size={16} style={{ cursor: "pointer" }} onClick={() => setPanel(null)} />
          </div>
          <MapLegend />
        </div>
      )}
      {panel === "km" && (
        <div className="rv-popover">
          {[["selected", t("map.showSelected")], ["sections", t("map.showSections")], ["all", t("map.showAllKm")]].map(([k, l]) => (
            <div key={k} className="rv-layer-row" style={{ justifyContent: "space-between" }}><b style={{ fontSize: 13 }}>{l}</b><Switch size="small" checked={kmCfg[k]} onChange={(v) => setKmCfg((c) => ({ ...c, [k]: v }))} /></div>
          ))}
          <div style={{ borderTop: "1px solid var(--rv-border)", margin: "8px 0 12px" }} />
          <Form layout="vertical" size="middle" onFinish={addWork} initialValues={{ picketStart: 1, picketEnd: 10 }} requiredMark={false}>
            <Form.Item name="line" label={t("map.selectLine")} rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={lineList.map((l) => ({ value: l.id, label: `${l.title} · ${l.lengthKm} km` }))} />
            </Form.Item>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Form.Item name="kmStart" label={t("map.kmStart")} rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="kmEnd" label={t("map.kmEnd")} rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="picketStart" label={t("map.picketStart")}><InputNumber min={1} max={10} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="picketEnd" label={t("map.picketEnd")}><InputNumber min={1} max={10} style={{ width: "100%" }} /></Form.Item>
            </div>
            <Form.Item name="repairType" label={t("map.repairType")} rules={[{ required: true }]}><Select options={repairTypes.map((r) => ({ value: r, label: r }))} /></Form.Item>
            <Button type="primary" htmlType="submit" block>{t("map.addWork")}</Button>
          </Form>
        </div>
      )}
      {panel === "edit" && canEdit && (
        <div className="rv-popover rv-edit-panel">
          <div className="rv-edit-head">
            <div><b>{t("map.edit.title")}</b><span>{t("map.edit.panelHint")}</span></div>
            <X size={16} style={{ cursor: "pointer" }} onClick={() => setPanel(null)} />
          </div>
          <button type="button" className={`rv-edit-mode ${editMode ? "on" : ""}`} onClick={() => setEditMode((e) => !e)} aria-pressed={editMode}>
            <span className="ic"><Move size={18} /></span>
            <span className="txt"><b>{t("map.edit.mode")}</b><span>{t("map.edit.modeHint")}</span></span>
            <Switch size="small" checked={editMode} tabIndex={-1} />
          </button>
          <div className="rv-edit-tiles">
            {[["station", Plus, t("map.addStation"), t("map.edit.addStationHint")], ["marker", MapPinPlus, t("map.edit.addMarker"), t("map.edit.addMarkerHint")]].map(([k, Icon, title, hint]) => (
              <button key={k} type="button" className={`rv-edit-tile ${addMode === k ? "on" : ""}`}
                onClick={() => { setAddMode((a) => (a === k ? null : k)); if (addMode !== k) setPanel(null); }}>
                <span className="ic"><Icon size={20} /></span><b>{title}</b><span>{hint}</span>
              </button>
            ))}
          </div>
          <div className="rv-edit-foot">
            <span>{t("map.edit.customMarkers")}: <b>{data.markers.length}</b></span>
            <span>{t("map.stations")}: <b>{data.stations.length}</b></span>
          </div>
        </div>
      )}
      <div className={`rv-dock-wrap ${dockOpen ? "open" : ""}`}>
      <button type="button" className="rv-dock-tab" onClick={toggleDock} aria-expanded={dockOpen}
        aria-label={dockOpen ? t("map.dockHide") : t("map.dockShow")} title={dockOpen ? t("map.dockHide") : t("map.dockShow")}>
        <ChevronUp size={18} />
        {!dockOpen && (editMode || addMode) && <i className="live" />}
      </button>
      <div className="rv-map-dock" ref={dockRef} aria-hidden={!dockOpen} inert={!dockOpen}>
        <span className={`rv-dock-ind ${dockInd ? "on" : ""} ${dockInd?.edit ? "edit" : ""}`}
          style={dockInd ? { transform: `translateX(${dockInd.left}px)`, width: dockInd.width } : undefined} />
        {[
          ["objects", Layers, t("map.objects"), objects.includes("all") ? 5 : objects.length],
          ["settings", SlidersHorizontal, t("map.settings"), Object.keys(DEFAULT_LAYERS).filter((k) => layers[k]).length],
          ["km", Flag, t("map.kmMarks"), Object.values(kmCfg).filter(Boolean).length],
          ["legend", BookOpen, t("map.legend.short"), 0],
        ].map(([k, Icon, l, n]) => (
          <button key={k} className={`rv-dock-btn ${panel === k ? "active" : ""}`} onClick={() => setPanel((p) => (p === k ? null : k))} aria-pressed={panel === k}>
            <span className="ic"><Icon size={17} /></span><span className="lbl">{l}</span>{n > 0 && <em>{n}</em>}
          </button>
        ))}
        {canEdit && (
          <>
            <i className="sep" />
            <button className={`rv-dock-btn edit ${panel === "edit" ? "active" : ""}`} onClick={() => setPanel((p) => (p === "edit" ? null : "edit"))} aria-pressed={panel === "edit"} title={t("map.edit.title")}>
              <span className="ic"><Pencil size={16} /></span><span className="lbl">{t("map.edit.short")}</span>
              {(editMode || addMode) && <i className="live" />}
            </button>
          </>
        )}
        <RailTrack kind="caravan" />
      </div>
      </div>

      {(addMode || (canEdit && editMode)) && (
        <div className="rv-card" style={{ position: "absolute", top: 86, left: "50%", transform: "translateX(-50%)", zIndex: 950, padding: "8px 14px", fontWeight: 700, maxWidth: "calc(100% - 32px)" }}>
          {addMode
            ? <>{t("map.clickMap")} <a onClick={() => setAddMode(null)} style={{ marginLeft: 8 }}>{t("common.cancel")}</a></>
            : <><Pencil size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{t("map.edit.banner")} <a onClick={() => setEditMode(false)} style={{ marginLeft: 8 }}>{t("map.edit.done")}</a></>}
        </div>
      )}
      <Modal open={newSt?.mode === "marker"} title={t("map.edit.addMarker")} onCancel={() => setNewSt(null)} footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={saveMarker} requiredMark={false}
          initialValues={{ kind: "point", color: markerDefaultColor("point"), lat: newSt && +newSt.lat.toFixed(6), lng: newSt && +newSt.lng.toFixed(6) }}>
          <Form.Item name="name" label={t("common.name")} rules={[{ required: true, whitespace: true }]}><Input autoFocus maxLength={160} /></Form.Item>
          <MarkerFields t={t} />
          <CoordFields t={t} />
          <Button type="primary" htmlType="submit" block>{t("common.save")}</Button>
        </Form>
      </Modal>
      <Modal open={!!editing} title={editing && `${t("map.edit.title")}: ${t(`map.edit.kinds.${editing.kind}`)}`} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing && (
          <Form layout="vertical" onFinish={saveEdit} requiredMark={false}
            initialValues={{ name: editing.name, esr: editing.esr, kind: editing.markerKind, color: editing.color, note: editing.note, lat: editing.lat, lng: editing.lng }}>
            <Form.Item name="name" label={t("common.name")} rules={[{ required: true, whitespace: true }]}><Input autoFocus maxLength={160} /></Form.Item>
            {editing.kind === "station" && <Form.Item name="esr" label={t("station.f.esr")}><Input maxLength={16} /></Form.Item>}
            {editing.kind === "marker" && <MarkerFields t={t} />}
            <CoordFields t={t} />
            <div style={{ display: "flex", gap: 8 }}>
              <Popconfirm title={editing.kind === "station" ? t("map.edit.deleteStation") : t("map.edit.deleteConfirm")} onConfirm={deleteEdited} okButtonProps={{ danger: true }}>
                <Button danger icon={<Trash2 size={15} />}>{t("common.delete")}</Button>
              </Popconfirm>
              <Button type="primary" htmlType="submit" style={{ flex: 1 }}>{t("common.save")}</Button>
            </div>
          </Form>
        )}
      </Modal>
      <Modal open={newSt?.mode === "station"} title={t("map.addStation")} onCancel={() => setNewSt(null)} footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={saveStation} initialValues={{ kind: "station", snap: true }} requiredMark={false}>
          <Form.Item name="name" label={t("common.name")} rules={[{ required: true }]}><Input autoFocus /></Form.Item>
          <Form.Item name="esr" label={t("station.f.esr")}><Input maxLength={6} /></Form.Item>
          <Form.Item name="kind" label={t("common.status")}><Select options={[{ value: "station", label: t("map.legend.station") }, { value: "halt", label: t("map.legend.halt") }, { value: "yard", label: t("map.legend.yard") }]} /></Form.Item>
          <Form.Item name="snap" valuePropName="checked"><Switch /></Form.Item>
          <div className="rv-muted" style={{ fontSize: 12, marginTop: -16, marginBottom: 12 }}>{t("map.snapHint")} · {newSt?.lat.toFixed(5)}, {newSt?.lng.toFixed(5)}</div>
          <Button type="primary" htmlType="submit" block>{t("common.save")}</Button>
        </Form>
      </Modal>
      <StationModal id={stationId} onClose={() => setStationId(null)} />
      <Modal open={!!camera} onCancel={() => setCamera(null)} footer={null} width={760} title={camera?.name} destroyOnHidden>
        {camera && <CameraPlayer url={camera.streamUrl} online={camera.online} name={camera.name} controls />}
      </Modal>
    </div>
  );
}

function MarkerFields({ t }) {
  const form = Form.useFormInstance();
  const color = Form.useWatch("color", form);
  const option = (k) => ({ value: k, label: t(`map.edit.markerKinds.${k}`) });
  const preview = (k, scale) => (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <IconPreview icon={markerIcon(k, color || markerDefaultColor(k))} box={40} scale={scale} />{t(`map.edit.markerKinds.${k}`)}
    </span>
  );
  return (
    <>
      <Form.Item name="kind" label={t("map.edit.icon")}>
        <Select listHeight={340} labelRender={({ value }) => preview(value, 0.55)} optionRender={(o) => preview(o.value, 0.9)} onChange={(k) => form.setFieldValue("color", markerDefaultColor(k))}
          options={[
            { label: t("map.edit.groupMap"), options: MARKER_GROUPS.map.map(option) },
            { label: t("map.edit.groupExtra"), options: MARKER_GROUPS.extra.map(option) },
          ]} />
      </Form.Item>
      <Form.Item name="color" label={t("map.edit.color")}><ColorSwatches /></Form.Item>
      <Form.Item name="note" label={t("map.edit.note")}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
    </>
  );
}

function ColorSwatches({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {MARKER_COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange?.(c)}
          style={{ width: 26, height: 26, borderRadius: 8, background: c, cursor: "pointer", border: value === c ? "3px solid var(--rv-text, #0f172a)" : "2px solid transparent", boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }} />
      ))}
    </div>
  );
}

/** Latitude / longitude inputs; pasting "41.3111, 69.2797" into either field fills both. */
function CoordFields({ t }) {
  const form = Form.useFormInstance();
  const onPaste = (e) => {
    const m = e.clipboardData.getData("text").match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return;
    e.preventDefault();
    form.setFieldsValue({ lat: +m[1], lng: +m[2] });
  };
  const num = { style: { width: "100%" }, step: 0.0001, precision: 6, onPaste };
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Form.Item name="lat" label={t("map.edit.lat")} rules={[{ required: true }]}><InputNumber min={-90} max={90} {...num} /></Form.Item>
        <Form.Item name="lng" label={t("map.edit.lng")} rules={[{ required: true }]}><InputNumber min={-180} max={180} {...num} /></Form.Item>
      </div>
      <div className="rv-muted" style={{ fontSize: 12, marginTop: -12, marginBottom: 14 }}>{t("map.edit.coordsHint")}</div>
    </>
  );
}

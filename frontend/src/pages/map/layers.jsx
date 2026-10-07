import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { TrainFront, Factory, Fuel, Cctv, TriangleAlert, ShieldCheck, ShieldAlert, Warehouse, Container, MapPin, Flag, Building2, Info } from "lucide-react";

/** Static preview of a Leaflet divIcon (for pickers / legends). */
export function IconPreview({ icon, box = 40, scale = 1 }) {
  const [w, h] = icon.options.iconSize;
  return (
    <span style={{ width: box * scale, height: box * scale, display: "inline-grid", placeItems: "center", flexShrink: 0 }}>
      <span style={{ width: box, height: box, display: "grid", placeItems: "center", transform: `scale(${scale})` }}>
        <span style={{ width: w, height: h, display: "grid", placeItems: "start center" }} dangerouslySetInnerHTML={{ __html: icon.options.html }} />
      </span>
    </span>
  );
}

const svg = (Icon, size = 14, color = "#fff", sw = 2.3) => renderToStaticMarkup(<Icon size={size} color={color} strokeWidth={sw} />);

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export const BASEMAPS = {
  base: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap", thumb: "https://a.tile.openstreetmap.org/5/22/12.png" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/12/22" },
  hybrid: { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attr: "© Esri", labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, thumb: `${ESRI}/World_Imagery/MapServer/tile/5/12/22` },
  // Esri Dark Gray Canvas: no API key needed (CARTO dark tiles now require one); native tiles go up to z16
  dark: { url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attr: "© Esri, HERE, Garmin, © OpenStreetMap contributors", maxNative: 16, thumb: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/5/12/22` },
};

/* ---- colour system for map objects ---- */
export const OBJ_COLORS = {
  station: "#0d9488", hub: "#0e7490", halt: "#f59e0b", yard: "#8b5cf6", inactive: "#94a3b8",
  fuel: "#f97316", company: "#6366f1", depot: "#0ea5e9", camera: "#ec4899", crossingOk: "#16a34a", crossingNo: "#dc2626", marker: "#2563eb",
};

const div = (html, size, anchor) => L.divIcon({ className: "rv-ico", iconSize: size, iconAnchor: anchor || [size[0] / 2, size[1] / 2], html });

/** Teardrop pin with gradient body + icon */
const pin = (Icon, color, size = 32) => div(
  `<div class="rv-pin2" style="--c:${color};width:${size}px;height:${size}px"><i>${svg(Icon, size * 0.46)}</i></div>`,
  [size, size + 6], [size / 2, size + 4],
);

export const ICONS = {
  // metro-map style station: white core, coloured ring
  station: div(`<div class="rv-st" style="--c:${OBJ_COLORS.station}"></div>`, [16, 16]),
  stationOff: div(`<div class="rv-st" style="--c:${OBJ_COLORS.inactive}"></div>`, [16, 16]),
  halt: div(`<div class="rv-st rv-st-halt" style="--c:${OBJ_COLORS.halt}"></div>`, [12, 12]),
  yard: div(`<div class="rv-st rv-st-yard" style="--c:${OBJ_COLORS.yard}"></div>`, [16, 16]),
  hub: div(`<div class="rv-hub"><i>${svg(TrainFront, 16)}</i></div>`, [34, 34]),
  fuel: pin(Fuel, OBJ_COLORS.fuel),
  company: pin(Factory, OBJ_COLORS.company),
  depot: pin(Warehouse, OBJ_COLORS.depot),
  other: pin(Container, OBJ_COLORS.depot),
  camera: div(`<div class="rv-cam-ico on" style="--c:${OBJ_COLORS.camera}"><i>${svg(Cctv, 14)}</i></div>`, [28, 28]),
  cameraOff: div(`<div class="rv-cam-ico" style="--c:${OBJ_COLORS.inactive}"><i>${svg(Cctv, 14)}</i></div>`, [28, 28]),
  crossingOk: div(`<div class="rv-xing" style="--c:${OBJ_COLORS.crossingOk}">${svg(ShieldCheck, 13)}</div>`, [22, 22]),
  crossingNo: div(`<div class="rv-xing" style="--c:${OBJ_COLORS.crossingNo}">${svg(ShieldAlert, 13)}</div>`, [22, 22]),
  warning: Object.fromEntries(["low", "mid", "high"].map((lvl, i) => [lvl, div(
    `<div class="rv-warn ${lvl}" style="--c:${["#eab308", "#f97316", "#dc2626"][i]}">${svg(TriangleAlert, 15)}</div>`, [30, 30])])),
};

/* ---- custom admin markers: same visual language as the built-in map objects, recoloured ---- */
const MARKER_BUILDERS = {
  // styles used by the map itself
  station: (c) => div(`<div class="rv-st" style="--c:${c}"></div>`, [16, 16]),
  hub: (c) => div(`<div class="rv-hub" style="background:linear-gradient(145deg,color-mix(in srgb,${c} 70%,#fff),${c})"><i>${svg(TrainFront, 16)}</i></div>`, [34, 34]),
  halt: (c) => div(`<div class="rv-st rv-st-halt" style="--c:${c}"></div>`, [12, 12]),
  yard: (c) => div(`<div class="rv-st rv-st-yard" style="--c:${c}"></div>`, [16, 16]),
  fuel: (c) => pin(Fuel, c),
  company: (c) => pin(Factory, c),
  depot: (c) => pin(Warehouse, c),
  other: (c) => pin(Container, c),
  camera: (c) => div(`<div class="rv-cam-ico" style="--c:${c}"><i>${svg(Cctv, 14)}</i></div>`, [28, 28]),
  crossingOk: (c) => div(`<div class="rv-xing" style="--c:${c}">${svg(ShieldCheck, 13)}</div>`, [22, 22]),
  crossingNo: (c) => div(`<div class="rv-xing" style="--c:${c}">${svg(ShieldAlert, 13)}</div>`, [22, 22]),
  warning: (c) => div(`<div class="rv-warn" style="--c:${c}">${svg(TriangleAlert, 15)}</div>`, [30, 30]),
  // extra
  point: (c) => pin(MapPin, c),
  flag: (c) => pin(Flag, c),
  building: (c) => pin(Building2, c),
  alert: (c) => pin(TriangleAlert, c),
  info: (c) => pin(Info, c),
};
export const MARKER_GROUPS = {
  map: ["station", "hub", "halt", "yard", "fuel", "company", "depot", "other", "camera", "crossingOk", "crossingNo", "warning"],
  extra: ["point", "flag", "building", "alert", "info"],
};
export const MARKER_COLORS = ["#2563eb", "#0d9488", "#0e7490", "#16a34a", "#f59e0b", "#f97316", "#dc2626", "#ec4899", "#8b5cf6", "#6366f1", "#0ea5e9", "#475569"];
/** colour a kind has on the map by default */
export const markerDefaultColor = (kind) => ({ other: OBJ_COLORS.depot, warning: "#f97316" })[kind] || OBJ_COLORS[kind] || MARKER_COLORS[0];
/** kinds that look like stations get a permanent name label, like real stations */
export const LABELLED_KINDS = ["station", "hub", "halt", "yard"];
const markerIconCache = {};
export function markerIcon(kind, color) {
  const k = `${kind}|${color}`;
  return markerIconCache[k] || (markerIconCache[k] = (MARKER_BUILDERS[kind] || MARKER_BUILDERS.point)(color || markerDefaultColor(kind)));
}

export function trainIcon(num, heading) {
  return div(`<div class="rv-train">${svg(TrainFront, 12, "#fbbf24")}<span>${num}</span><b>${heading === "←" ? "◂" : "▸"}</b></div>`, [74, 22]);
}
export function kmIcon(km) {
  return div(`<div class="rv-km">${km}</div>`, [36, 16]);
}

/** Imperative marker-cluster layer: items = [{lat,lng,icon,type,onClick,tooltip,label,popup}]
 *  editable: clustering off, markers draggable, click -> onEdit(item), drop -> onMove(item, latlng) */
export function ClusterLayer({ items, visible = true, editable = false, showLabels = true, onEdit, onMove }) {
  const map = useMap();
  const ref = useRef(null);
  const cb = useRef({});
  useEffect(() => { cb.current = { onEdit, onMove }; });
  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true, disableClusteringAtZoom: editable ? 0 : 11,
      // add markers in small batches so toggling object groups never freezes the page
      chunkedLoading: true, chunkInterval: 80, chunkDelay: 16,
      iconCreateFunction: (c) => {
        const kids = c.getAllChildMarkers();
        const n = kids.length;
        const cnt = {};
        kids.forEach((k) => { const t = k.options.rvType || "station"; cnt[t] = (cnt[t] || 0) + 1; });
        // ring of segments = share of each object type, separated by small gaps like a station clock face
        const parts = Object.entries(cnt);
        const gap = parts.length > 1 ? 4 : 0;
        let acc = 0;
        const stops = parts.map(([t, v]) => {
          const from = (acc / n) * 360; acc += v;
          const to = (acc / n) * 360;
          const col = OBJ_COLORS[t] || OBJ_COLORS.station;
          const a = from + gap / 2, z = Math.max(a, to - gap / 2);
          return gap ? `transparent ${from}deg ${a}deg, ${col} ${a}deg ${z}deg, transparent ${z}deg ${to}deg` : `${col} 0deg 360deg`;
        }).join(",");
        const s = n < 10 ? 38 : n < 50 ? 46 : n < 150 ? 54 : 62;
        const cls = n >= 100 ? "rv-cl2 big" : "rv-cl2";
        return L.divIcon({
          className: "rv-ico", iconSize: [s, s],
          html: `<div class="${cls}" style="--s:${s}px"><i class="ring" style="background:conic-gradient(${stops})"></i><span class="core"><b>${n}</b></span></div>`,
        });
      },
    });
    ref.current = group;
    map.addLayer(group);
    return () => { map.removeLayer(group); };
  }, [map, editable]);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.clearLayers();
    if (!visible) return;
    const ms = items.map((it) => {
      const canEdit = editable && it.edit;
      const mk = L.marker([it.lat, it.lng], { icon: it.icon, rvType: it.type, riseOnHover: true, draggable: canEdit, autoPan: canEdit });
      // permanent name labels only where they are readable (zoom ≥ 12); further out the name shows on hover
      if (it.label && showLabels) mk.bindTooltip(it.label, { permanent: true, direction: "right", offset: [10, 0], className: "rv-label" });
      else if (it.label) mk.bindTooltip(it.tooltip || it.label, { direction: "top", offset: [0, -10], className: "rv-tip" });
      else if (it.tooltip) mk.bindTooltip(it.tooltip, { direction: "top", offset: [0, -16], className: "rv-tip" });
      if (canEdit) {
        mk.on("click", () => cb.current.onEdit?.(it));
        mk.on("dragend", () => cb.current.onMove?.(it, mk.getLatLng(), () => mk.setLatLng([it.lat, it.lng])));
        return mk;
      }
      if (it.popup) mk.bindPopup(it.popup, { maxWidth: 360 });
      if (it.onClick) mk.on("click", it.onClick);
      return mk;
    });
    g.addLayers(ms);
  }, [items, visible, editable, showLabels]);
  return null;
}

export function MapRefBridge({ onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

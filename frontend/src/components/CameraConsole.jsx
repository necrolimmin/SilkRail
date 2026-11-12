import { Button, Input, Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cctv, Eye, EyeOff, Maximize, Search, Video, VideoOff, X } from "lucide-react";
import CameraPlayer from "./CameraPlayer";
import { Loader, NoData, useFetch } from "./ui";
import { store } from "../utils";

/** Language codes Argus's player understands. */
const ARGUS_LANG = { uz: "uz-Latn", ru: "ru", en: "en" };

/** How many cameras may play at once: every open camera is a live video stream from the camera server. */
const MAX_OPEN = 9;

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  // all stations are in Uzbekistan: the time a camera's picture is taken in
  return <span className="clock">{now.toLocaleTimeString("ru-RU", { timeZone: "Asia/Tashkent" })}</span>;
}

function Tile({ cam, showStation, onClose, tools }) {
  const { t } = useTranslation();
  const box = useRef();
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen?.());
  return (
    <figure className="rv-tile" ref={box}>
      <figcaption>
        <Video size={15} className="ic" aria-hidden />
        <span className="nm">
          <b>{cam.name}</b>
          {showStation && cam.station && <span>{cam.station}</span>}
        </span>
        {tools}
        <Tooltip title={t("console.fullscreen")}><button type="button" onClick={full} aria-label={t("console.fullscreen")}><Maximize size={15} /></button></Tooltip>
        <Tooltip title={t("console.close")}><button type="button" onClick={onClose} aria-label={t("console.close")}><X size={16} /></button></Tooltip>
      </figcaption>
      <CameraPlayer url={cam.streamUrl} embedUrl={cam.embedUrl} online={cam.online} name={cam.name} controls />
    </figure>
  );
}

/**
 * A surveillance console: the list of cameras on the left, the cameras the viewer opened on the right.
 * Only opened cameras play, so a station with many cameras does not load the browser or the camera server.
 * The choice is remembered per `storageKey`.
 * cameras: [{ id, name, online, streamUrl, embedUrl, station?, stationId? }]
 */
export default function CameraConsole({ cameras, storageKey, defaultOpen = 0, initialOpen, groupByStation = false, tools, headerExtra }) {
  const { t } = useTranslation();
  const ids = useMemo(() => new Set(cameras.map((c) => String(c.id))), [cameras]);
  const [open, setOpen] = useState(() => {
    const first = initialOpen?.length ? initialOpen.map(String)
      : store.get(storageKey, null) ?? cameras.filter((c) => c.online).slice(0, defaultOpen).map((c) => String(c.id));
    return first.filter((id) => ids.has(id)).slice(0, MAX_OPEN);
  });
  const [q, setQ] = useState("");
  useEffect(() => { if (!initialOpen?.length) store.set(storageKey, open); }, [open, storageKey, initialOpen]);

  const shownOpen = open.filter((id) => ids.has(id));
  const full = shownOpen.length >= MAX_OPEN;
  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.length >= MAX_OPEN ? o : [...o, id]));
  const byId = useMemo(() => Object.fromEntries(cameras.map((c) => [String(c.id), c])), [cameras]);
  const online = cameras.filter((c) => c.online).length;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cameras.filter((c) => !s || `${c.name} ${c.station || ""}`.toLowerCase().includes(s));
  }, [cameras, q]);
  const groups = useMemo(() => {
    if (!groupByStation) return [[null, filtered]];
    const m = new Map();
    filtered.forEach((c) => { const k = c.station || "—"; m.set(k, [...(m.get(k) || []), c]); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupByStation]);

  const openMany = (list) => setOpen((o) => [...o, ...list.filter((c) => c.online).map((c) => String(c.id)).filter((id) => !o.includes(id))].slice(0, MAX_OPEN));
  const cols = shownOpen.length <= 1 ? 1 : shownOpen.length <= 4 ? 2 : 3;

  return (
    <div className="rv-console">
      <aside className="rv-console-list">
        <div className="head">
          <b>{t("console.cameras")}</b>
          <span className="rv-muted">{t("console.state", { online, off: cameras.length - online })}</span>
        </div>
        {cameras.length > 6 && <Input size="small" allowClear prefix={<Search size={13} />} placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="rows">
          {groups.map(([station, list]) => (
            <div key={station || "all"} className="grp">
              {station && (
                <div className="st">
                  <span>{station}</span>
                  <button type="button" onClick={() => openMany(list)} disabled={full}>{t("console.openStation")}</button>
                </div>
              )}
              {list.map((c) => {
                const id = String(c.id);
                const on = shownOpen.includes(id);
                const blocked = !c.online || (!on && full);
                return (
                  <button key={id} type="button" className={`row ${on ? "open" : ""}`} aria-pressed={on} disabled={blocked && !on}
                    onClick={() => toggle(id)} title={!c.online ? t("console.noSignal") : !on && full ? t("console.limit", { n: MAX_OPEN }) : undefined}>
                    <i className={c.online ? "on" : ""} aria-hidden />
                    <span className="nm">{c.name}</span>
                    {c.online ? (on ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden className="dim" />) : <span className="ns">{t("console.noSignal")}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="foot">
          <Button size="small" onClick={() => openMany(filtered)} disabled={full || !online}>{t("console.openAll")}</Button>
          <Button size="small" onClick={() => setOpen([])} disabled={!shownOpen.length}>{t("console.closeAll")}</Button>
        </div>
      </aside>

      <section className="rv-console-wall">
        <div className="bar">
          <Cctv size={16} className="ic" aria-hidden />
          <span>{t("console.opened", { n: shownOpen.length, total: cameras.length })}</span>
          {full && <span className="warn">{t("console.limit", { n: MAX_OPEN })}</span>}
          <span style={{ flex: 1 }} />
          {headerExtra}
          <Clock />
        </div>
        {shownOpen.length ? (
          <div className="tiles" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {shownOpen.map((id) => (
              <Tile key={id} cam={byId[id]} showStation={groupByStation} onClose={() => toggle(id)} tools={tools?.(byId[id])} />
            ))}
          </div>
        ) : (
          <div className="idle">
            {online ? <Video size={30} aria-hidden /> : <VideoOff size={30} aria-hidden />}
            <b>{online ? t("console.pickTitle") : t("console.noneOnline")}</b>
            <span>{online ? t("console.pickText") : t("console.noneOnlineText")}</span>
          </div>
        )}
      </section>
    </div>
  );
}

/** One station's cameras, with `focus` opened (used from the map). Rights are checked by the station's camera tab. */
export function StationCameraConsole({ stationId, focus }) {
  const { t, i18n } = useTranslation();
  const { data, loading, error } = useFetch(`/api/stations/${stationId}/cameras`, { lang: ARGUS_LANG[i18n.language] || "ru" });
  return (
    <Loader loading={loading} height={260}>
      {error ? <div className="rv-muted" style={{ padding: 30, textAlign: "center" }}>{t(error.response?.status === 403 ? "console.noAccess" : "common.error")}</div>
        : data?.length ? <CameraConsole cameras={data} storageKey={`rv_cams_st_${stationId}`} initialOpen={focus ? [focus] : undefined} defaultOpen={1} />
        : <NoData />}
    </Loader>
  );
}

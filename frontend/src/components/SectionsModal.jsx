import { App, Button, Input, Modal, Popconfirm, Switch, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import api, { get } from "../api";
import { useAuth } from "../store/auth";
import { DEFAULT_LAYOUT, TAB_ICONS, groupTitle } from "../pages/station/tabKeys";

const COLORS = ["#0d9488", "#6366f1", "#0ea5e9", "#d97706", "#64748b", "#16a34a", "#db2777", "#dc2626", "#7c3aed", "#0891b2"];
const copy = (x) => JSON.parse(JSON.stringify(x));

/**
 * Admin editor of the station card's sections, for everyone: order of the sections, their groups (name, colour,
 * order), and which sections regular users see. Sections are dragged with the mouse or moved with the arrows;
 * an arrow at the edge of a group moves the section into the neighbouring group.
 */
export default function SectionsModal({ open, onClose }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { refreshUser } = useAuth();
  const [hidden, setHidden] = useState(null);
  const [groups, setGroups] = useState(null);
  const [drag, setDrag] = useState(null); // key of the section being dragged
  const [over, setOver] = useState(null); // where it would land: { g, i }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHidden(null);
    setGroups(null);
    get("/api/admin/station-tabs")
      .then((d) => { setHidden(d.hidden); setGroups(copy(d.layout || DEFAULT_LAYOUT)); })
      .catch(() => { message.error(t("common.error")); onClose(); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k, on) => setHidden((h) => (on ? h.filter((x) => x !== k) : [...h, k]));
  const setGroup = (gi, patch) => setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  /** Puts section `key` into group `gi` at position `i` (taking it out of wherever it is). */
  const place = (key, gi, i) => setGroups((gs) => {
    const next = copy(gs);
    const from = next.findIndex((g) => g.tabs.includes(key));
    const fi = next[from].tabs.indexOf(key);
    next[from].tabs.splice(fi, 1);
    next[gi].tabs.splice(from === gi && fi < i ? i - 1 : i, 0, key);
    return next;
  });
  const step = (key, dir) => {
    const gi = groups.findIndex((g) => g.tabs.includes(key));
    const i = groups[gi].tabs.indexOf(key);
    if (dir < 0 && i > 0) place(key, gi, i - 1);
    else if (dir > 0 && i < groups[gi].tabs.length - 1) place(key, gi, i + 2);
    else if (dir < 0 && gi > 0) place(key, gi - 1, groups[gi - 1].tabs.length); // to the end of the group above
    else if (dir > 0 && gi < groups.length - 1) place(key, gi + 1, 0); // to the start of the group below
  };
  const moveGroup = (gi, dir) => setGroups((gs) => {
    const next = [...gs];
    [next[gi], next[gi + dir]] = [next[gi + dir], next[gi]];
    return next;
  });
  const addGroup = () => setGroups((gs) => [...gs, { id: `g${Date.now().toString(36)}`, color: COLORS[gs.length % COLORS.length], title: "", tabs: [] }]);
  const removeGroup = (gi) => setGroups((gs) => gs.filter((_, i) => i !== gi));

  const drop = (e, gi, i) => {
    e.preventDefault();
    if (drag) place(drag, gi, i);
    setDrag(null);
    setOver(null);
  };
  const empty = groups?.some((g) => !g.tabs.length);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/api/admin/station-tabs", { hidden, layout: groups.filter((g) => g.tabs.length) });
      await refreshUser();
      message.success(t("sections.saved"));
      onClose();
    } catch { message.error(t("common.error")); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} title={t("sections.title")} destroyOnHidden>
      <p className="rv-muted" style={{ marginTop: 0 }}>{t("sections.layoutHint")}</p>
      {groups && hidden && (
        <div className="rv-sections">
          {groups.map((g, gi) => (
            <div key={g.id} className={`grp ${drag && over?.g === gi && over.i === g.tabs.length ? "drop-end" : ""}`} style={{ "--g": g.color }}
              onDragOver={(e) => { if (drag) { e.preventDefault(); if (over?.g !== gi) setOver({ g: gi, i: g.tabs.length }); } }}
              onDrop={(e) => drop(e, gi, g.tabs.length)}>
              <div className="ghead">
                <Input size="small" variant="borderless" className="gname" value={g.title || ""} maxLength={32}
                  placeholder={groupTitle(t, { ...g, title: null })} aria-label={t("sections.groupName")}
                  onChange={(e) => setGroup(gi, { title: e.target.value })} />
                <div className="swatches" role="radiogroup" aria-label={t("sections.color")}>
                  {COLORS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={g.color === c} aria-label={c} className={g.color === c ? "on" : ""}
                      style={{ background: c }} onClick={() => setGroup(gi, { color: c })} />
                  ))}
                </div>
                <Tooltip title={t("sections.groupUp")}><Button size="small" type="text" icon={<ArrowUp size={14} />} disabled={gi === 0} onClick={() => moveGroup(gi, -1)} aria-label={t("sections.groupUp")} /></Tooltip>
                <Tooltip title={t("sections.groupDown")}><Button size="small" type="text" icon={<ArrowDown size={14} />} disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} aria-label={t("sections.groupDown")} /></Tooltip>
                <Tooltip title={g.tabs.length ? t("sections.deleteNotEmpty") : t("sections.deleteGroup")}>
                  <Button size="small" type="text" danger icon={<Trash2 size={14} />} disabled={!!g.tabs.length} onClick={() => removeGroup(gi)} aria-label={t("sections.deleteGroup")} />
                </Tooltip>
              </div>
              {g.tabs.map((k, i) => {
                const on = !hidden.includes(k);
                const Icon = TAB_ICONS[k];
                const flat = groups.flatMap((x) => x.tabs);
                return (
                  <div key={k} className={`row ${on ? "" : "off"} ${drag === k ? "dragging" : ""} ${drag && over?.g === gi && over.i === i ? "drop-before" : ""}`}
                    draggable onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); if (over?.g !== gi || over.i !== i) setOver({ g: gi, i }); } }}
                    onDrop={(e) => { e.stopPropagation(); drop(e, gi, i); }}>
                    <GripVertical size={15} className="grip" aria-hidden />
                    {Icon && <Icon size={15} className="ic" aria-hidden />}
                    <span className="nm">{t(`station.tabs.${k}`)}</span>
                    <em>{on ? t("sections.forAll") : t("sections.adminsOnly")}</em>
                    <Switch size="small" checked={on} onChange={(v) => toggle(k, v)} aria-label={t(`station.tabs.${k}`)} />
                    <span className="arrows">
                      <button type="button" disabled={flat[0] === k} onClick={() => step(k, -1)} aria-label={t("sections.up")} title={t("sections.up")}><ArrowUp size={13} /></button>
                      <button type="button" disabled={flat[flat.length - 1] === k} onClick={() => step(k, 1)} aria-label={t("sections.down")} title={t("sections.down")}><ArrowDown size={13} /></button>
                    </span>
                  </div>
                );
              })}
              {!g.tabs.length && <div className="hole">{t("sections.emptyGroup")}</div>}
            </div>
          ))}
          <div className="gtools">
            <Button icon={<Plus size={15} />} onClick={addGroup} disabled={groups.length >= 12}>{t("sections.addGroup")}</Button>
            <Popconfirm title={t("sections.resetConfirm")} onConfirm={() => setGroups(copy(DEFAULT_LAYOUT))}>
              <Button type="text" icon={<RotateCcw size={14} />}>{t("sections.reset")}</Button>
            </Popconfirm>
          </div>
        </div>
      )}
      <p className="rv-muted" style={{ fontSize: 12 }}>{t("sections.exception")}</p>
      {empty && <p style={{ fontSize: 12, color: "#d97706" }}>{t("sections.emptyDropped")}</p>}
      <Button type="primary" block loading={busy} disabled={!groups} onClick={save}>{t("common.save")}</Button>
    </Modal>
  );
}

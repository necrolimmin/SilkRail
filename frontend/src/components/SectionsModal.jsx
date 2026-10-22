import { App, Button, Modal, Switch } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import api, { get } from "../api";
import { useAuth } from "../store/auth";
import { TAB_GROUPS } from "../pages/station/tabKeys";

/** Admin switchboard: which station-card sections are visible to regular users (off = admins only). */
export default function SectionsModal({ open, onClose }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { refreshUser } = useAuth();
  const [hidden, setHidden] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHidden(null);
    get("/api/admin/station-tabs").then((d) => setHidden(d.hidden)).catch(() => { message.error(t("common.error")); onClose(); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k, on) => setHidden((h) => (on ? h.filter((x) => x !== k) : [...h, k]));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/api/admin/station-tabs", { hidden });
      await refreshUser();
      message.success(t("sections.saved"));
      onClose();
    } catch { message.error(t("common.error")); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={560} title={t("sections.title")} destroyOnHidden>
      <p className="rv-muted" style={{ marginTop: 0 }}>{t("sections.hint")}</p>
      {hidden && (
        <div className="rv-sections">
          {TAB_GROUPS.map(([g, color, keys]) => (
            <div key={g} className="grp" style={{ "--g": color }}>
              <div className="cap">{t(`station.groups.${g}`)}</div>
              {keys.map((k) => {
                const on = !hidden.includes(k);
                return (
                  <label key={k} className={on ? "" : "off"}>
                    {on ? <Eye size={15} /> : <EyeOff size={15} />}
                    <span>{t(`station.tabs.${k}`)}</span>
                    <em>{on ? t("sections.forAll") : t("sections.adminsOnly")}</em>
                    <Switch size="small" checked={on} onChange={(v) => toggle(k, v)} aria-label={t(`station.tabs.${k}`)} />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="rv-muted" style={{ fontSize: 12 }}>{t("sections.exception")}</p>
      <Button type="primary" block loading={busy} disabled={!hidden} onClick={save}>{t("common.save")}</Button>
    </Modal>
  );
}

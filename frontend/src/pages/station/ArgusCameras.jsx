import { Alert, App, Button, Checkbox, Form, Input, Modal, Popconfirm, Spin, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import api, { get } from "../../api";
import { useAuth, isAdmin } from "../../store/auth";

/**
 * Admins only: attach cameras of the Argus video system to this station.
 * The first time, Argus's address and an API key are asked for (the key is kept on the server and never
 * comes back to the browser); after that, the cameras the key opens are ticked per station.
 */
export function ArgusCamerasButton({ st, onChange }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAdmin(user)) return null;
  return (
    <>
      <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>{t("argus.button")}</Button>
      {open && <ArgusModal st={st} onClose={() => setOpen(false)} onChange={onChange} />}
    </>
  );
}

/** Admins only: the pencil on an added camera. Its name here can differ from Argus; it can be taken off the station. */
export function ArgusCameraEdit({ cam, onChange }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isAdmin(user)) return null;

  const run = async (request, done) => {
    setBusy(true);
    try {
      await request();
      message.success(t(done));
      setOpen(false);
      onChange?.();
    } catch { message.error(t("common.error")); } finally { setBusy(false); }
  };
  const save = () => run(() => api.patch(`/api/argus/cameras/${cam.argusId}`, { title: title.trim() }), "argus.renamed");
  const remove = () => run(() => api.delete(`/api/argus/cameras/${cam.argusId}`), "argus.removed");

  return (
    <>
      <button type="button" className="rv-cam-edit" title={t("argus.editBtn")} aria-label={t("argus.editBtn")}
        onClick={() => { setTitle(cam.title || ""); setOpen(true); }}>
        <Pencil size={14} />
      </button>
      <Modal
        open={open}
        title={t("argus.editTitle")}
        onCancel={() => setOpen(false)}
        width={460}
        destroyOnHidden
        footer={[
          <Popconfirm key="d" title={t("argus.removeConfirm")} okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger icon={<Trash2 size={14} />} style={{ float: "left" }} disabled={busy}>{t("argus.remove")}</Button>
          </Popconfirm>,
          <Button key="c" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>,
          <Button key="s" type="primary" loading={busy} onClick={save}>{t("common.save")}</Button>,
        ]}
      >
        <Form layout="vertical" onFinish={save}>
          <Form.Item label={t("argus.name")} extra={t("argus.nameHint", { name: cam.argusName })} style={{ marginBottom: 0 }}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cam.argusName} maxLength={200} autoFocus allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ArgusModal({ st, onClose, onChange }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [state, setState] = useState(null); // { connected, url } from the server
  const [setup, setSetup] = useState(false); // the address-and-key form is shown
  const [cams, setCams] = useState(null);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const errText = (e) => t(`argus.err.${e.response?.data?.detail}`, { defaultValue: t("common.error") });

  const loadCams = () => {
    setCams(null);
    setError("");
    get("/api/argus/cameras")
      .then((rows) => { setCams(rows); setPicked(rows.filter((c) => c.stationId === st.id).map((c) => c.id)); })
      .catch((e) => { setCams([]); setError(errText(e)); });
  };

  useEffect(() => {
    get("/api/argus").then((s) => {
      setState(s);
      if (s.connected) loadCams(); else setSetup(true);
    }).catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (v) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.put("/api/argus", { url: v.url.trim(), key: (v.key || "").trim() });
      setState(data);
      setSetup(false);
      message.success(t("argus.connected", { count: data.cameras }));
      loadCams();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete("/api/argus");
      setState(data);
      setCams(null);
      setSetup(true);
      onChange?.();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/argus/stations/${st.id}`, { ids: picked });
      message.success(t("argus.saved"));
      onChange?.();
      onClose();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (cams || []).filter((c) => !s || `${c.name} ${c.unit}`.toLowerCase().includes(s));
  }, [cams, q]);
  const toggle = (id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  return (
    <Modal
      open
      title={t("argus.title", { station: st.name })}
      onCancel={onClose}
      width={620}
      destroyOnHidden
      footer={setup ? null : [
        <Button key="c" onClick={onClose}>{t("common.cancel")}</Button>,
        <Button key="s" type="primary" loading={busy} disabled={!cams} onClick={save}>{t("common.save")}</Button>,
      ]}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      {!state && !error && <div style={{ display: "grid", placeItems: "center", height: 120 }}><Spin /></div>}

      {state && setup && (
        <Form layout="vertical" onFinish={connect} initialValues={{ url: state.url }} requiredMark={false}>
          <p className="rv-muted" style={{ marginTop: 0 }}>{t("argus.setupLead")}</p>
          <Form.Item name="url" label={t("argus.url")} rules={[{ required: true, message: t("argus.urlRequired") }]}>
            <Input placeholder="https://argus.example.uz" autoComplete="off" />
          </Form.Item>
          <Form.Item name="key" label={t("argus.key")} extra={state.connected ? t("argus.keyKeep") : t("argus.keyHint")}
            rules={[{ required: !state.connected, message: t("argus.keyRequired") }]}>
            <Input.Password placeholder="argus_…" autoComplete="new-password" />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {state.connected && <Button onClick={() => { setSetup(false); setError(""); }}>{t("common.cancel")}</Button>}
            <Button type="primary" htmlType="submit" loading={busy} icon={<Link2 size={15} />}>{t("argus.connect")}</Button>
          </div>
        </Form>
      )}

      {state && !setup && (
        <>
          <div className="rv-argus-conn">
            <span className="rv-muted">{t("argus.connectedTo")}</span> <b>{state.url}</b>
            <span style={{ flex: 1 }} />
            <Button size="small" type="link" onClick={() => { setSetup(true); setError(""); }}>{t("argus.change")}</Button>
            <Popconfirm title={t("argus.disconnectConfirm")} okButtonProps={{ danger: true }} onConfirm={disconnect}>
              <Button size="small" type="link" danger>{t("argus.disconnect")}</Button>
            </Popconfirm>
          </div>
          {!cams ? <div style={{ display: "grid", placeItems: "center", height: 120 }}><Spin /></div> : cams.length === 0 ? (
            !error && <p className="rv-muted">{t("argus.noCameras")}</p>
          ) : (
            <>
              <Input allowClear prefix={<Search size={14} />} placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
              <div className="rv-argus-list">
                {shown.map((c) => {
                  const elsewhere = c.stationId && c.stationId !== st.id;
                  return (
                    <label key={c.id} className="rv-argus-row">
                      <Checkbox checked={picked.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                      <span className="nm">
                        <b>{c.name}</b>
                        <span className="rv-muted">{c.unit}</span>
                      </span>
                      {elsewhere && <Tag color="gold" title={t("argus.willMove")}>{c.station}</Tag>}
                      <Tag color={c.online ? "green" : "default"}>{c.online ? t("common.online") : t("common.offline")}</Tag>
                    </label>
                  );
                })}
              </div>
              <p className="rv-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{t("argus.pickHint", { count: picked.length })}</p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

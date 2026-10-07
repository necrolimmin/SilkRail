import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Table, Upload } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileUp, FileText, Map as MapIcon, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import api from "../../api";
import { Chart, Loader, NoData, useFetch } from "../../components/ui";
import { useAuth, isAdmin } from "../../store/auth";
import { fmt, date } from "../../utils";

const DOCS = [["cad_doc", FileText, "station.cad.docs"], ["scheme", MapIcon, "station.cad.scheme"]];
const AREA_COLORS = ["#0d9488", "#f59e0b", "#94a3b8"];

/* ---------- the two PDF documents: admin uploads, everyone downloads ---------- */
function DocTile({ st, kind, Icon, label, doc, admin, onChange }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null);
  const download = async () => {
    setBusy("down");
    try {
      const r = await api.get(doc.url, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${st.name} — ${t(label)}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { message.error(t("common.error")); } finally { setBusy(null); }
  };
  const upload = async ({ file }) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { message.error(t("cadastre.pdfOnly")); return; }
    if (file.size > 40 * 1024 * 1024) { message.error(t("media.tooLarge", { mb: 40 })); return; }
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    setBusy("up");
    try { await api.post(`/api/stations/${st.id}/media`, fd); message.success(t("media.uploaded")); onChange(); }
    catch (e) { message.error(e.response?.data?.detail === "type" ? t("cadastre.pdfOnly") : t("common.error")); }
    finally { setBusy(null); }
  };
  const remove = async () => {
    try { await api.delete(`/api/stations/${st.id}/media/${doc.id}`); message.success(t("map.edit.deleted")); onChange(); }
    catch { message.error(t("common.error")); }
  };
  return (
    <div className={`rv-doc-tile ${doc ? "has" : ""}`}>
      <span className="ic"><Icon size={20} /></span>
      <div className="txt">
        <b>{t(label)}</b>
        <span>{doc ? `${doc.title || "PDF"} · ${date(doc.uploadedAt)}` : t("cadastre.notUploaded")}</span>
      </div>
      <div className="act">
        {doc && <Button type="primary" icon={<Download size={15} />} loading={busy === "down"} onClick={download}>{t("common.download")}</Button>}
        {admin && (
          <Upload accept="application/pdf,.pdf" showUploadList={false} customRequest={upload} disabled={!!busy}>
            <Button icon={<FileUp size={15} />} loading={busy === "up"}>{doc ? t("cadastre.replace") : t("cadastre.uploadPdf")}</Button>
          </Upload>
        )}
        {admin && doc && (
          <Popconfirm title={t("cadastre.deleteDoc")} okButtonProps={{ danger: true }} onConfirm={remove}>
            <Button danger icon={<Trash2 size={14} />} aria-label={t("common.delete")} />
          </Popconfirm>
        )}
      </div>
    </div>
  );
}

/* ---------- edit form ---------- */
function CadastreModal({ st, c, open, onClose, onSaved }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const save = async (v) => {
    setBusy(true);
    try {
      await api.put(`/api/stations/${st.id}/cadastre`, { ...v, compiledAt: v.compiledAt.format("YYYY-MM-DD"), buildings: v.buildings || [] });
      message.success(t("map.edit.saved"));
      onSaved();
    } catch (e) {
      message.error(t(`cadastre.err.${e.response?.data?.detail}`, { defaultValue: t("common.error") }));
    } finally { setBusy(false); }
  };
  const num = { style: { width: "100%" }, min: 0, precision: 2 };
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden title={`${t("cadastre.editTitle")}: ${st.name}`}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={save}
        onFinishFailed={({ errorFields }) => message.error(errorFields.map((f) => f.errors[0]).find(Boolean) || t("cadastre.err.fix"))}
        initialValues={c ? {
        ...c, compiledAt: c.compiledAt ? dayjs(c.compiledAt) : dayjs(), landArea: c.landArea ?? c.m2Total,
      } : { compiledAt: dayjs(), landArea: 0, m2Legal: 0, m2InUse: 0, buildings: [] }}>
        <div className="rv-edit-section">{t("station.cad.general")}</div>
        <div className="rv-form-grid">
          <Form.Item name="compiledAt" label={t("station.cad.compiled")} rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="passportNo" label={t("station.cad.passport")}><Input maxLength={32} /></Form.Item>
          <Form.Item name="parcelNo" label={t("station.cad.parcel")}><Input maxLength={32} placeholder="11:13:89:01:2983" /></Form.Item>
          <Form.Item name="location" label={t("station.cad.location")}><Input maxLength={200} /></Form.Item>
        </div>
        <div className="rv-edit-section">{t("station.cad.land")}</div>
        <div className="rv-form-grid">
          <Form.Item name="objectName" label={t("station.cad.object")}><Input maxLength={160} /></Form.Item>
          <Form.Item name="category" label={t("station.cad.category")}><Input maxLength={64} /></Form.Item>
          <Form.Item name="subcategory" label={t("station.cad.subcategory")}><Input maxLength={64} /></Form.Item>
          <Form.Item name="useType" label={t("station.cad.use")}><Input maxLength={64} /></Form.Item>
          <Form.Item name="servitude" label={t("station.cad.servitude")}><Input maxLength={200} /></Form.Item>
        </div>
        <div className="rv-edit-section">{t("station.cad.area")} (m²)</div>
        <div className="rv-form-grid">
          <Form.Item name="landArea" label={t("cadastre.total")} rules={[{ required: true }]}><InputNumber {...num} /></Form.Item>
          <Form.Item name="m2Legal" label={t("cadastre.legal")} dependencies={["landArea"]} extra={t("cadastre.legalHint")}
            rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v == null || v <= (getFieldValue("landArea") ?? 0) ? Promise.resolve() : Promise.reject(new Error(t("cadastre.err.legal_gt_total")))) })]}>
            <InputNumber {...num} />
          </Form.Item>
          <Form.Item name="m2InUse" label={t("cadastre.inUse")} dependencies={["m2Legal"]} extra={t("cadastre.inUseHint")}
            rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v == null || v <= (getFieldValue("m2Legal") ?? 0) ? Promise.resolve() : Promise.reject(new Error(t("cadastre.err.inuse_gt_legal")))) })]}>
            <InputNumber {...num} />
          </Form.Item>
        </div>
        <div className="rv-edit-section">{t("station.cad.buildings")}</div>
        <Form.List name="buildings">
          {(fields, { add, remove }) => (
            <div style={{ display: "grid", gap: 6 }}>
              {fields.length > 0 && (
                <div className="rv-bld-row head">
                  <span>{t("station.cad.bname")}</span><span>{t("station.cad.bno")}</span><span>{t("station.cad.floors")}</span>
                  <span>{t("station.cad.footprint")}</span><span>{t("station.cad.totalArea")}</span><span>{t("station.cad.usableArea")}</span><span />
                </div>
              )}
              {fields.map(({ key, name }) => (
                <div className="rv-bld-row" key={key}>
                  <Form.Item name={[name, "name"]} rules={[{ required: true, whitespace: true, message: "" }]} noStyle><Input placeholder={t("station.cad.bname")} /></Form.Item>
                  <Form.Item name={[name, "cadastre_no"]} noStyle><Input placeholder="10:11:17:01:634" /></Form.Item>
                  <Form.Item name={[name, "floors"]} noStyle><InputNumber min={0} max={200} precision={0} style={{ width: "100%" }} /></Form.Item>
                  <Form.Item name={[name, "footprint"]} noStyle><InputNumber {...num} /></Form.Item>
                  <Form.Item name={[name, "total"]} noStyle><InputNumber {...num} /></Form.Item>
                  <Form.Item name={[name, "usable"]} dependencies={[["buildings", name, "total"]]} noStyle
                    rules={[({ getFieldValue }) => ({ validator: (_, v) => {
                      const tot = getFieldValue(["buildings", name, "total"]);
                      return v == null || tot == null || v <= tot ? Promise.resolve() : Promise.reject(new Error(t("cadastre.err.usable_gt_total")));
                    } })]}>
                    <InputNumber {...num} />
                  </Form.Item>
                  <Button danger type="text" icon={<Trash2 size={14} />} onClick={() => remove(name)} aria-label={t("common.delete")} />
                </div>
              ))}
              <Button type="dashed" icon={<Plus size={15} />} onClick={() => add({ floors: 1 })}>{t("cadastre.addBuilding")}</Button>
            </div>
          )}
        </Form.List>
        <Button type="primary" htmlType="submit" block loading={busy} style={{ marginTop: 18 }}>{t("common.save")}</Button>
      </Form>
    </Modal>
  );
}

/* ---------- tab ---------- */
export function CadastreTab({ st }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [ver, setVer] = useState(0);
  const [editing, setEditing] = useState(false);
  const reload = () => setVer((x) => x + 1);
  const { data, loading } = useFetch(`/api/stations/${st.id}/cadastre`, undefined, [ver]);
  if (!data && loading) return <Loader loading />;
  const c = data?.cadastre;
  const docs = data?.docs || {};

  // land splits without overlap: in use ⊂ registered ⊂ total (clamped, so older inconsistent data still draws sanely)
  const total = Math.max(0, c?.landArea ?? c?.m2Total ?? 0);
  const legal = Math.min(Math.max(0, c?.m2Legal || 0), total);
  const inUse = Math.min(Math.max(0, c?.m2InUse || 0), legal);
  const parts = [[t("cadastre.inUse"), inUse], [t("cadastre.legalIdle"), legal - inUse], [t("cadastre.unregistered"), total - legal]];
  const inconsistent = c && ((c.m2Legal || 0) > total || (c.m2InUse || 0) > (c.m2Legal || 0) || (c.buildings || []).some((b) => b.usable > b.total));
  const pct = (v) => (total ? `${Math.round((v / total) * 100)}%` : "—");
  const row = (k, v) => <div style={{ padding: "8px 0", borderBottom: "1px dashed var(--rv-border)" }}><div className="rv-muted" style={{ fontSize: 11.5 }}>{k}</div><b style={{ fontSize: 13.5 }}>{v || t("common.notExist")}</b></div>;

  return (
    <div className="rv-grid">
      <div className="rv-card">
        <div className="rv-toolbar" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{t("cadastre.docsTitle")}</h3>
          {admin && c && <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>{t("station.edit.button")}</Button>}
        </div>
        <div className="rv-doc-grid">
          {DOCS.map(([kind, Icon, label]) => <DocTile key={kind} st={st} kind={kind} Icon={Icon} label={label} doc={docs[kind]} admin={admin} onChange={reload} />)}
        </div>
      </div>

      {!c ? (
        <div className="rv-card">
          <div className="rv-rec-empty">
            <FileText size={28} />
            <b>{t("cadastre.emptyTitle")}</b>
            <span className="rv-muted">{admin ? t("cadastre.emptyAdmin") : t("records.staff.emptyViewer")}</span>
            {admin && <Button type="primary" icon={<Plus size={15} />} onClick={() => setEditing(true)} style={{ marginTop: 6 }}>{t("cadastre.create")}</Button>}
          </div>
        </div>
      ) : (
        <>
          {inconsistent && admin && (
            <div className="rv-warn-bar"><TriangleAlert size={16} />{t("cadastre.inconsistent")}<a onClick={() => setEditing(true)}>{t("station.edit.button")}</a></div>
          )}
          <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            <div className="rv-card" style={{ background: "linear-gradient(150deg,var(--rv-primary),var(--rv-primary-2))", color: "#fff", border: 0 }}>
              <h3 style={{ color: "#fff" }}>{t("station.cad.general")}</h3>
              {[[t("station.cad.compiled"), date(c.compiledAt)], [t("station.cad.passport"), c.passportNo], [t("station.cad.parcel"), c.parcelNo], [t("station.cad.location"), c.location]].map(([k, v]) => (
                <div key={k} style={{ background: "rgba(255,255,255,.12)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}><div style={{ fontSize: 11.5, opacity: .8 }}>{k}</div><b>{v || "—"}</b></div>
              ))}
            </div>
            <div className="rv-card">
              <h3>{t("station.cad.land")}</h3>
              {row(t("station.cad.object"), c.objectName)}{row(t("station.cad.category"), c.category)}{row(t("station.cad.subcategory"), c.subcategory)}
              {row(t("station.cad.use"), c.useType)}{row(t("station.cad.landArea"), fmt(total, 2))}{row(t("station.cad.servitude"), c.servitude)}
            </div>
            <div className="rv-card">
              <h3>{t("station.cad.area")}</h3>
              {total > 0 ? (
                <>
                  <Chart height={200} option={{
                    tooltip: { trigger: "item", formatter: (p) => `${p.name}: ${fmt(p.value, 2)} m² (${p.percent}%)` }, legend: { show: false }, color: AREA_COLORS,
                    series: [{ type: "pie", radius: ["52%", "80%"], center: ["50%", "50%"], avoidLabelOverlap: false,
                      label: { show: true, position: "center", formatter: () => `${fmt(total, 0)} m²`, fontWeight: 800, fontSize: 16 },
                      emphasis: { label: { show: true } },
                      data: parts.map(([name, value]) => ({ name, value: +value.toFixed(2) })).filter((d) => d.value > 0) }],
                  }} />
                  <div className="rv-area-legend">
                    {parts.map(([name, v], i) => (
                      <div key={name}><i style={{ background: AREA_COLORS[i] }} /><span>{name}</span><b>{fmt(v, 0)} m²</b><em>{pct(v)}</em></div>
                    ))}
                  </div>
                </>
              ) : <NoData />}
            </div>
          </div>
          <div className="rv-card">
            <h3>{t("station.cad.buildings")}</h3>
            {c.buildings.length ? (
              <Table rowKey={(b, i) => `${b.cadastre_no}-${i}`} size="small" pagination={false} dataSource={c.buildings} scroll={{ x: 700 }}
                summary={(rows) => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}><b>{t("common.total")}</b></Table.Summary.Cell>
                    {["footprint", "total", "usable"].map((k, i) => <Table.Summary.Cell key={k} index={3 + i}><b>{fmt(rows.reduce((a, r) => a + (r[k] || 0), 0), 1)}</b></Table.Summary.Cell>)}
                  </Table.Summary.Row>
                )}
                columns={[{ title: t("station.cad.bname"), dataIndex: "name" }, { title: t("station.cad.bno"), dataIndex: "cadastre_no", render: (v) => v || "—" }, { title: t("station.cad.floors"), dataIndex: "floors", render: (v) => v ?? "—" },
                  { title: t("station.cad.footprint"), dataIndex: "footprint", render: (v) => fmt(v, 1) }, { title: t("station.cad.totalArea"), dataIndex: "total", render: (v) => fmt(v, 1) },
                  { title: t("station.cad.usableArea"), dataIndex: "usable", render: (v, r) => <span style={r.usable > r.total ? { color: "var(--rv-danger)", fontWeight: 700 } : undefined}>{fmt(v, 1)}</span> }]} />
            ) : <NoData />}
          </div>
        </>
      )}
      <CadastreModal st={st} c={c} open={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
    </div>
  );
}

import { App, AutoComplete, Button, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Popconfirm, Popover, Radio, Select, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, GraduationCap, Cake, UserPlus, Pencil, Trash2, Rows3, GitBranch, FileCheck2, FileX2, Ellipsis, X } from "lucide-react";
import api from "../../api";
import { Chart, Loader, NoData, StatCard, useFetch } from "../../components/ui";
import { useAuth, isAdmin } from "../../store/auth";
import { date, fmt } from "../../utils";
import { ExcelTools } from "./RecordTools";
import PersonAvatar from "../../components/PersonAvatar";

const EDU = ["higher", "second", "special", "secondary"];
const EDU_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#ec4899"];
const POSITIONS = ["Stansiya boshlig'i", "Stansiya boshlig'i o'rinbosari", "Stansiya navbatchisi", "Yuk xazinachisi", "Tovar kassiri",
  "Manyovr dispetcheri", "Signalchi", "Poezdlar tuzuvchisi", "Vagon ko'ruvchi", "Yo'l montyori", "Elektromexanik", "Operator", "Hisobchi"];
const CONTRACTS = ["Asosiy", "Ortiqcha ish o'rni", "O'rindoshlik", "Muddatli"];
// parks every station card shows, even before any tracks are entered
const BASE_PARKS = ["Saralash parki", "Jo'natish parki", "Qabul qilish parki"];

/* ---------- staff ---------- */
function WorkerModal({ st, worker, onClose, onSaved }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const isNew = !worker?.id;
  const save = async (v) => {
    setBusy(true);
    const body = { ...v, birthDate: v.birthDate.format("YYYY-MM-DD"), hiredDate: v.hiredDate.format("YYYY-MM-DD") };
    try {
      if (isNew) await api.post(`/api/stations/${st.id}/workers`, body);
      else await api.put(`/api/stations/${st.id}/workers/${worker.id}`, body);
      message.success(t("map.edit.saved"));
      onSaved();
    } catch (e) {
      message.error(e.response?.data?.detail === "hired_before_birth" ? t("records.err.hired_before_birth") : t("common.error"));
    } finally { setBusy(false); }
  };
  return (
    <Modal open={!!worker} onCancel={onClose} footer={null} destroyOnHidden width={620}
      title={isNew ? t("records.staff.add") : `${t("records.staff.edit")}: ${worker?.fullName}`}>
      {worker && (
        <Form layout="vertical" requiredMark={false} onFinish={save} initialValues={isNew
          ? { gender: "M", education: "higher", contractType: "Asosiy" }
          : { ...worker, birthDate: dayjs(worker.birthDate), hiredDate: dayjs(worker.hiredDate) }}>
          <Form.Item name="fullName" label={t("station.f.fullName")} rules={[{ required: true, whitespace: true }]}><Input maxLength={128} autoFocus /></Form.Item>
          <div className="rv-form-grid">
            <Form.Item name="position" label={t("station.staff.position")} rules={[{ required: true, whitespace: true }]}>
              <AutoComplete options={POSITIONS.map((p) => ({ value: p }))} filterOption={(q, o) => o.value.toLowerCase().includes(q.toLowerCase())} />
            </Form.Item>
            <Form.Item name="gender" label={t("records.staff.gender")}>
              <Radio.Group optionType="button" options={[{ value: "M", label: t("station.staff.male") }, { value: "F", label: t("station.staff.female") }]} />
            </Form.Item>
            <Form.Item name="birthDate" label={t("station.staff.birth")} rules={[{ required: true }]}>
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} disabledDate={(d) => d.isAfter(dayjs())} />
            </Form.Item>
            <Form.Item name="hiredDate" label={t("station.staff.hired")} rules={[{ required: true }]}>
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} disabledDate={(d) => d.isAfter(dayjs().add(1, "year"))} />
            </Form.Item>
            <Form.Item name="education" label={t("station.staff.eduTitle")}>
              <Select options={EDU.map((k) => ({ value: k, label: t(`station.staff.${k}`) }))} />
            </Form.Item>
            <Form.Item name="contractType" label={t("station.staff.contract")}>
              <AutoComplete options={CONTRACTS.map((c) => ({ value: c }))} />
            </Form.Item>
            <Form.Item name="phone" label={t("station.f.phone")}><Input maxLength={32} placeholder="+998 __ ___ __ __" /></Form.Item>
          </div>
          <Button type="primary" htmlType="submit" block loading={busy}>{t("common.save")}</Button>
        </Form>
      )}
    </Modal>
  );
}

function RatesEdit({ st, value, onSaved }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value);
  const save = async () => {
    try { await api.put(`/api/stations/${st.id}/staff-rates`, { rates: v ?? 0 }); setOpen(false); onSaved(); }
    catch { message.error(t("common.error")); }
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); setV(value); }} trigger="click" title={t("station.staff.rates")}
      content={<div style={{ display: "flex", gap: 6 }}><InputNumber min={0} max={100000} value={v} onChange={setV} autoFocus /><Button type="primary" onClick={save}>{t("common.save")}</Button></div>}>
      <Button type="text" size="small" icon={<Pencil size={13} />} aria-label={t("records.staff.editRates")} />
    </Popover>
  );
}

export function StaffTab({ st }) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [selected, setSelected] = useState([]);
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [ver, setVer] = useState(0);
  const [editing, setEditing] = useState(null);
  const reload = () => setVer((x) => x + 1);
  const { data, loading } = useFetch(`/api/stations/${st.id}/workers`, { q, page, size: 10 }, [ver]);
  const s = data?.stats;
  const empty = s && s.total === 0;
  const removeAll = async () => {
    try { const { data: r } = await api.delete(`/api/stations/${st.id}/workers`); message.success(t("records.staff.deletedAll", { n: r.deleted })); setSelected([]); setPage(1); reload(); }
    catch { message.error(t("common.error")); }
  };
  const removeSelected = async () => {
    try {
      const { data: r } = await api.post(`/api/stations/${st.id}/workers/delete`, { ids: selected });
      message.success(t("records.staff.deletedAll", { n: r.deleted })); setSelected([]); setPage(1); reload();
    } catch { message.error(t("common.error")); }
  };
  const confirmAll = () => modal.confirm({
    title: t("records.staff.deleteAllTitle"), content: t("records.staff.deleteAllText", { n: s.total }),
    okText: t("records.staff.deleteAllOk", { n: s.total }), okButtonProps: { danger: true }, cancelText: t("common.cancel"), onOk: removeAll,
  });
  const remove = async (w) => {
    try { await api.delete(`/api/stations/${st.id}/workers/${w.id}`); message.success(t("map.edit.deleted")); reload(); }
    catch { message.error(t("common.error")); }
  };
  const tools = admin && (
    <div className="rv-rec-tools">
      <Button type="primary" icon={<UserPlus size={15} />} onClick={() => setEditing({})}>{t("records.staff.add")}</Button>
      <ExcelTools st={st} kind="workers" onImported={() => { setPage(1); reload(); }} />
      {s?.total > 0 && (
        <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [
          { key: "all", danger: true, icon: <Trash2 size={14} />, label: t("records.staff.deleteAllN", { n: s.total }), onClick: confirmAll },
        ] }}>
          <Button icon={<Ellipsis size={16} />} aria-label={t("records.staff.more")} title={t("records.staff.more")} />
        </Dropdown>
      )}
    </div>
  );
  return (
    <Loader loading={!data && loading}>
      {s && (
        <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", marginBottom: 14 }}>
          <div className="rv-card">
            <StatCard label={t("station.staff.total")} value={`${s.total} ${t("common.pcs")}`} icon={Users} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {[[t("station.staff.male"), s.male, "#0ea5e9"], [t("station.staff.female"), s.female, "#ec4899"]].map(([k, v, c]) => (
                <div key={k} style={{ flex: 1, borderLeft: `3px solid ${c}`, paddingLeft: 8 }}><div className="rv-muted" style={{ fontSize: 11.5 }}>{k}</div><b>{v}</b></div>
              ))}
              <div style={{ flex: 1, borderLeft: "3px solid #f59e0b", paddingLeft: 8 }}>
                <div className="rv-muted" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 2 }}>
                  {t("station.staff.rates")}{admin && <RatesEdit st={st} value={s.rates} onSaved={reload} />}
                </div>
                <b>{s.rates}</b>
                {s.rates > 0 && <span className="rv-muted" style={{ fontSize: 11, marginLeft: 6 }}>{Math.round((s.total / s.rates) * 100)}%</span>}
              </div>
            </div>
          </div>
          <div className="rv-card">
            <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}><GraduationCap size={18} />{t("station.staff.eduTitle")}</h3>
            {empty ? <NoData /> : (
              <Chart height={130} option={{
                tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" }, legend: { show: false }, color: EDU_COLORS,
                series: [{ type: "pie", radius: ["55%", "85%"], center: ["26%", "50%"], label: { show: false }, avoidLabelOverlap: true,
                  data: EDU.map((k) => ({ name: t(`station.staff.${k}`), value: s.edu[k] })).filter((d) => d.value > 0) }],
                graphic: [{ type: "group", left: "52%", top: "middle", children: EDU.map((k, i) => ({
                  type: "group", top: i * 24, children: [
                    { type: "circle", shape: { cx: 5, cy: 7, r: 5 }, style: { fill: EDU_COLORS[i] } },
                    { type: "text", left: 16, style: { text: `${t(`station.staff.${k}`)}: ${s.edu[k]}`, fill: "#64748b", font: "600 12px Manrope" } },
                  ] })) }],
              }} />
            )}
          </div>
          <div className="rv-card">
            <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}><Cake size={18} />{t("station.staff.ageTitle")}</h3>
            {empty ? <NoData /> : (() => {
              const groups = ["under31", "from32to45", "over46"];
              const max = Math.max(1, ...groups.map((k) => s.age[k]));
              return (
                <div className="rv-hbars">
                  {groups.map((k) => (
                    <div key={k} className="row" title={`${t(`station.staff.${k}`)}: ${s.age[k]}`}>
                      <span className="lbl">{t(`station.staff.${k}`)}</span>
                      <span className="track"><i style={{ width: `${(s.age[k] / max) * 100}%` }} /></span>
                      <b>{s.age[k]}</b>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      <div className="rv-card">
        <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t("station.staff.list")}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {tools}
            <Input.Search allowClear placeholder={t("common.search")} style={{ width: 240 }} onSearch={(v) => { setQ(v); setPage(1); }} />
          </div>
        </div>
        {empty && !q ? (
          <div className="rv-rec-empty">
            <Users size={28} />
            <b>{t("records.staff.emptyTitle")}</b>
            <span className="rv-muted">{admin ? t("records.staff.emptyAdmin") : t("records.staff.emptyViewer")}</span>
          </div>
        ) : (
          <>
          {admin && selected.length > 0 && (
            <div className="rv-sel-bar" role="status">
              <b>{t("records.staff.selected", { n: selected.length })}</b>
              <Popconfirm title={t("records.staff.deleteSelected", { n: selected.length })} okButtonProps={{ danger: true }} onConfirm={removeSelected}>
                <Button size="small" danger type="primary" icon={<Trash2 size={13} />}>{t("common.delete")}</Button>
              </Popconfirm>
              <Button size="small" type="text" icon={<X size={14} />} onClick={() => setSelected([])}>{t("common.cancel")}</Button>
            </div>
          )}
          <Table rowKey="id" loading={loading} dataSource={data?.items} size="middle" scroll={{ x: 1000 }} rowClassName="rv-row-actions"
            rowSelection={admin ? { selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true, columnWidth: 40 } : undefined}
            pagination={{ current: page, total: data?.total, pageSize: 10, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
            columns={[
              { title: "#", width: 50, render: (_, __, i) => (page - 1) * 10 + i + 1 },
              { title: t("station.f.fullName"), render: (r) => <span style={{ display: "flex", gap: 10, alignItems: "center" }}><PersonAvatar gender={r.gender} size={36} title={r.gender === "F" ? t("station.staff.female") : t("station.staff.male")} /><b>{r.fullName}</b></span> },
              { title: t("station.staff.position"), dataIndex: "position" },
              { title: t("station.staff.eduTitle"), dataIndex: "education", render: (v) => <Tag color={EDU_COLORS[EDU.indexOf(v)]}>{t(`station.staff.${v}`)}</Tag> },
              { title: t("station.staff.birth"), dataIndex: "birthDate", render: date },
              { title: t("station.staff.hired"), dataIndex: "hiredDate", render: date },
              { title: t("station.staff.contract"), dataIndex: "contractType", render: (v) => <Tag>{v}</Tag> },
              { title: t("station.f.phone"), dataIndex: "phone", render: (v) => v || "—" },
              ...(admin ? [{
                title: "", key: "act", width: 72, fixed: "right", render: (r) => (
                  <div className="rv-row-btns">
                    <button type="button" onClick={() => setEditing(r)} aria-label={t("records.staff.edit")} title={t("records.staff.edit")}><Pencil size={14} /></button>
                    <Popconfirm title={t("records.staff.deleteConfirm")} okButtonProps={{ danger: true }} onConfirm={() => remove(r)}>
                      <button type="button" className="del" aria-label={t("common.delete")} title={t("common.delete")}><Trash2 size={14} /></button>
                    </Popconfirm>
                  </div>
                ) }] : []),
            ]} />
          </>
        )}
      </div>
      <WorkerModal st={st} worker={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </Loader>
  );
}

/* ---------- parks and tracks ---------- */
export function TechTab({ st }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [ver, setVer] = useState(0);
  const { data, loading } = useFetch(`/api/stations/${st.id}/tech`, undefined, [ver]);
  const parks = [...BASE_PARKS, ...Object.keys(data?.parks || {}).filter((p) => !BASE_PARKS.includes(p))];
  const [park, setPark] = useState(BASE_PARKS[0]);
  const rows = data?.parks?.[park] || [];
  const yn = (b) => (b ? <Tag color="green">{t("common.yes")}</Tag> : <Tag>{t("common.no")}</Tag>);
  const cap = rows.reduce((a, r) => a + (r.wagonCapacity || 0), 0);
  const reload = () => setVer((x) => x + 1);
  const del = async (url, params) => {
    try { await api.delete(url, { params }); message.success(t("map.edit.deleted")); reload(); }
    catch { message.error(t("common.error")); }
  };
  return (
    <Loader loading={!data && loading}>
      <div className="rv-card">
        <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{t("station.tech.title")}</h3>
          {admin && <div className="rv-rec-tools"><ExcelTools st={st} kind="tracks" onImported={() => setVer((x) => x + 1)} /></div>}
        </div>
        <div className="rv-park-pills" role="tablist">
          {parks.map((p) => {
            const n = data?.parks?.[p]?.length || 0;
            return (
              <button key={p} type="button" role="tab" aria-selected={park === p} className={park === p ? "on" : ""} onClick={() => setPark(p)}>
                {p}{n > 0 && <em>{n}</em>}
              </button>
            );
          })}
        </div>
        {rows.length > 0 && (
          <div className="rv-rec-summary" style={{ alignItems: "center" }}>
            <span>{t("records.tracks.count", { n: rows.length })}</span><span>{t("records.tracks.capacity", { n: cap })}</span>
            {admin && (
              <Popconfirm title={t("records.tracks.clearConfirm", { park, n: rows.length })} okButtonProps={{ danger: true }}
                onConfirm={() => del(`/api/stations/${st.id}/tracks`, { park })}>
                <Button size="small" danger type="text" icon={<Trash2 size={13} />} style={{ marginLeft: "auto" }}>{t("records.tracks.clear")}</Button>
              </Popconfirm>
            )}
          </div>
        )}
        {rows.length ? (
          <Table rowKey="id" size="small" pagination={false} dataSource={rows} scroll={{ x: 1100 }} bordered
            columns={[
              { title: "#", width: 44, render: (_, __, i) => i + 1 },
              { title: t("station.tech.track"), dataIndex: "trackNo", width: 80 },
              { title: t("station.tech.purpose"), dataIndex: "purpose" },
              { title: t("station.tech.arrows"), children: [{ title: t("common.from"), dataIndex: "from", render: (v) => v || "—" }, { title: t("common.to"), dataIndex: "to", render: (v) => v || "—" }] },
              { title: t("station.tech.length"), children: [{ title: t("station.tech.total"), dataIndex: "lengthTotal" }, { title: t("station.tech.usable"), dataIndex: "usableLength" }] },
              { title: t("station.tech.capacity"), dataIndex: "wagonCapacity" },
              { title: t("station.tech.devices"), children: [
                { title: t("station.tech.insulation"), dataIndex: "insulation" },
                { title: t("station.tech.contact"), dataIndex: "contactNetwork", render: yn },
                { title: t("station.tech.alns"), dataIndex: "alns", render: yn },
              ] },
              ...(admin ? [{
                title: "", key: "del", width: 52, fixed: "right", align: "center", render: (r) => (
                  <Popconfirm title={t("records.tracks.deleteConfirm", { no: r.trackNo })} okButtonProps={{ danger: true }}
                    onConfirm={() => del(`/api/stations/${st.id}/tracks/${r.id}`)}>
                    <Button size="small" danger icon={<Trash2 size={13} />} aria-label={t("common.delete")} />
                  </Popconfirm>
                ) }] : []),
            ]} />
        ) : (
          <div className="rv-rec-empty">
            <Rows3 size={28} />
            <b>{t("records.tracks.emptyPark", { park })}</b>
            <span className="rv-muted">{admin ? t("records.tracks.emptyAdmin") : t("records.staff.emptyViewer")}</span>
          </div>
        )}
      </div>
    </Loader>
  );
}

/* ---------- access roads (Excel round-trip, like parks and tracks) ---------- */
export function RoadsTab({ st }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [ver, setVer] = useState(0);
  const reload = () => setVer((x) => x + 1);
  const { data, loading } = useFetch(`/api/stations/${st.id}/access-roads`, undefined, [ver]);
  const rows = data || [];
  const yn = (b) => (b ? <FileCheck2 size={18} color="#16a34a" /> : <FileX2 size={18} color="#ef4444" />);
  const dash = (v) => (v || v === 0 ? v : "—");
  const del = async (url) => {
    try { await api.delete(url); message.success(t("map.edit.deleted")); reload(); }
    catch { message.error(t("common.error")); }
  };
  const active = rows.filter((r) => !r.canceled);
  return (
    <div className="rv-card">
      <div className="rv-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{t("station.tabs.roads")}</h3>
        {admin && <div className="rv-rec-tools"><ExcelTools st={st} kind="roads" onImported={reload} /></div>}
      </div>
      {rows.length > 0 && (
        <div className="rv-rec-summary" style={{ alignItems: "center" }}>
          <span>{t("records.roads.count", { n: rows.length, active: active.length })}</span>
          <span>{t("records.roads.length", { n: fmt(active.reduce((a, r) => a + (r.length.total || 0), 0), 1) })}</span>
          {admin && (
            <Popconfirm title={t("records.roads.clearConfirm", { n: rows.length })} okButtonProps={{ danger: true }} onConfirm={() => del(`/api/stations/${st.id}/roads`)}>
              <Button size="small" danger type="text" icon={<Trash2 size={13} />} style={{ marginLeft: "auto" }}>{t("records.roads.clear")}</Button>
            </Popconfirm>
          )}
        </div>
      )}
      {!data && loading ? <Loader loading /> : rows.length ? (
        <Table rowKey="id" dataSource={rows} bordered size="small" scroll={{ x: 2300 }} pagination={false}
          columns={[
            { title: "#", width: 44, fixed: "left", render: (_, __, i) => i + 1 },
            { title: t("station.roads.owner"), dataIndex: "owner", fixed: "left", width: 220, render: (v, r) => <span><b>{v}</b>{r.canceled && <Tag color="red" style={{ marginLeft: 6 }}>{t("station.roads.canceled")}</Tag>}</span> },
            { title: t("station.roads.inn"), dataIndex: "inn", render: dash },
            { title: t("station.roads.leader"), children: [{ title: t("station.f.fullName"), dataIndex: "leader", render: dash }, { title: t("station.f.email"), dataIndex: "email", render: dash }, { title: t("station.f.phone"), dataIndex: "phone", render: dash }] },
            { title: t("station.roads.distance"), dataIndex: "distanceKm", render: (v) => fmt(v, 2) },
            { title: t("station.roads.length"), children: [{ title: t("common.total"), render: (r) => fmt(r.length.total, 1) }, { title: "T1", render: (r) => fmt(r.length.t1, 1) }, { title: "T2", render: (r) => fmt(r.length.t2, 1) }] },
            { title: t("station.roads.contract"), children: [
              { title: t("station.roads.signed"), render: (r) => date(r.contract.date) }, { title: t("station.roads.start"), render: (r) => date(r.contract.start) },
              { title: t("station.roads.end"), render: (r) => date(r.contract.end) }, { title: t("station.roads.form"), render: (r) => dash(r.contract.type) }] },
            { title: t("station.roads.passport"), dataIndex: "hasTechPassport", render: yn, align: "center" },
            { title: t("station.roads.instruction"), dataIndex: "hasInstruction", render: yn, align: "center" },
            { title: t("station.roads.junction"), dataIndex: "junction", render: dash },
            { title: t("station.roads.cargoPeriod"), children: [{ title: t("station.roads.load"), render: (r) => fmt(r.cargoPeriod.load, 1) }, { title: t("station.roads.unload"), render: (r) => fmt(r.cargoPeriod.unload, 1) }, { title: t("station.roads.oper2"), render: (r) => fmt(r.cargoPeriod.oper2, 1) }] },
            { title: t("station.roads.front"), dataIndex: "front", render: (v) => v || "—" },
            { title: t("station.roads.atOnce"), dataIndex: "wagonsAtOnce", render: (v) => v || "—" },
            { title: t("station.roads.created"), dataIndex: "createdYear", render: (v) => v || "—" },
            ...(admin ? [{
              title: "", key: "del", width: 52, fixed: "right", align: "center", render: (r) => (
                <Popconfirm title={t("records.roads.deleteConfirm", { owner: r.owner })} okButtonProps={{ danger: true }} onConfirm={() => del(`/api/stations/${st.id}/roads/${r.id}`)}>
                  <Button size="small" danger icon={<Trash2 size={13} />} aria-label={t("common.delete")} />
                </Popconfirm>
              ) }] : []),
          ]} />
      ) : (
        <div className="rv-rec-empty">
          <GitBranch size={28} />
          <b>{t("records.roads.emptyTitle")}</b>
          <span className="rv-muted">{admin ? t("records.roads.emptyAdmin") : t("records.staff.emptyViewer")}</span>
        </div>
      )}
    </div>
  );
}

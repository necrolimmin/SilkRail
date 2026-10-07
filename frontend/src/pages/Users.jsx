import { App, Button, Checkbox, Form, Input, Modal, Popconfirm, Radio, Select, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import api, { get } from "../api";
import { PAGE_PATHS, useAuth } from "../store/auth";
import { STATION_TAB_KEYS, WIP_TABS } from "./station/tabKeys";
import { dateTime } from "../utils";

const PAGES = Object.keys(PAGE_PATHS);
const ADMIN_ROLES = ["superadmin", "admin"];
const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{7,}$/;

export default function Users() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {} = new user, row = edit
  const [form] = Form.useForm();
  const role = Form.useWatch("role", form);
  const access = Form.useWatch("access", form);
  const tabsAccess = Form.useWatch("tabsAccess", form);
  const pagesPicked = Form.useWatch("pages", form);

  const load = () => { setLoading(true); get("/api/admin/users").then(setRows).catch(() => message.error(t("common.error"))).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line

  const pageName = (p) => t(`nav.${p}`);
  const roles = ["superadmin", "admin", "moderator", "viewer"].filter((r) => r !== "superadmin" || me.role === "superadmin");

  const open = (row) => {
    setEditing(row || {});
    form.setFieldsValue(row
      ? { username: row.username, fullName: row.fullName, role: row.role, password: "", access: row.restricted ? "some" : "all", pages: row.pages,
          tabsAccess: row.tabsRestricted ? "some" : "all", stationTabs: row.stationTabs }
      : { username: "", fullName: "", role: "viewer", password: "", access: "some", pages: ["map"], tabsAccess: "all", stationTabs: ["home"] });
  };

  const submit = async (v) => {
    const isNew = !editing.id;
    const restricted = !ADMIN_ROLES.includes(v.role) && v.access === "some";
    const tabsRestricted = !ADMIN_ROLES.includes(v.role) && v.tabsAccess === "some";
    const body = {
      fullName: v.fullName, role: v.role, password: v.password || undefined,
      ...(tabsRestricted ? { stationTabs: v.stationTabs } : { allStationTabs: true }),
    };
    try {
      if (isNew) await api.post("/api/admin/users", { ...body, username: v.username, pages: restricted ? v.pages : null, stationTabs: tabsRestricted ? v.stationTabs : null });
      else await api.patch(`/api/admin/users/${editing.id}`, { ...body, ...(restricted ? { pages: v.pages } : { allPages: true }) });
      message.success(t("users.saved"));
      setEditing(null);
      load();
    } catch (e) {
      const d = e.response?.data?.detail;
      message.error(d === "username_taken" ? t("users.taken") : d === "weak" ? t("forgot.weak") : d === "self" ? t("users.self") : t("common.error"));
    }
  };

  const remove = async (row) => {
    try { await api.delete(`/api/admin/users/${row.id}`); message.success(t("users.deleted")); load(); }
    catch { message.error(t("common.error")); }
  };

  const columns = [
    { title: t("auth.username"), dataIndex: "username", render: (v) => <b>{v}</b> },
    { title: t("users.fullName"), dataIndex: "fullName" },
    { title: t("profile.role"), dataIndex: "role", render: (r) => <Tag color={ADMIN_ROLES.includes(r) ? "geekblue" : "default"}>{t(`users.roles.${r}`)}</Tag> },
    {
      title: t("users.pages"), dataIndex: "pages",
      render: (pages, r) => (r.restricted
        ? (pages.length ? pages.map((p) => <Tag key={p} color="cyan">{pageName(p)}</Tag>) : <span className="rv-muted">{t("users.noPages")}</span>)
        : <Tag color="green">{t("users.allPages")}</Tag>),
    },
    {
      title: t("users.stationTabs"), dataIndex: "stationTabs", responsive: ["lg"],
      render: (tabs, r) => (r.tabsRestricted
        ? <Tag color="cyan" title={tabs.map((k) => t(`station.tabs.${k}`)).join(", ")}>{t("users.tabsCount", { n: tabs.filter((k) => !WIP_TABS.has(k)).length, total: STATION_TAB_KEYS.length - WIP_TABS.size })}</Tag>
        : <Tag color="green">{t("users.allTabs")}</Tag>),
    },
    { title: t("users.created"), dataIndex: "createdAt", render: dateTime, responsive: ["md"] },
    {
      title: t("common.actions"), key: "a", width: 110,
      render: (_, r) => {
        const locked = r.role === "superadmin" && me.role !== "superadmin";
        return (
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="small" icon={<Pencil size={14} />} disabled={locked} onClick={() => open(r)} aria-label={t("users.edit")} />
            <Popconfirm title={t("users.deleteConfirm")} onConfirm={() => remove(r)} okButtonProps={{ danger: true }} disabled={locked || r.id === me.id}>
              <Button size="small" danger icon={<Trash2 size={14} />} disabled={locked || r.id === me.id} aria-label={t("common.delete")} />
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  const isNew = editing && !editing.id;
  const adminRole = ADMIN_ROLES.includes(role);

  return (
    <div className="rv-page" style={{ maxWidth: 1100 }}>
      <div className="rv-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <h2 className="rv-title" style={{ margin: 0 }}>{t("users.title")}</h2>
            <div className="rv-muted" style={{ fontSize: 13 }}>{t("users.subtitle")}</div>
          </div>
          <Button type="primary" icon={<UserPlus size={16} />} onClick={() => open(null)}>{t("users.add")}</Button>
        </div>
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={false} scroll={{ x: true }} />
      </div>

      <Modal open={!!editing} title={isNew ? t("users.add") : `${t("users.edit")}: ${editing?.username}`} onCancel={() => setEditing(null)} footer={null} forceRender>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="username" label={t("auth.username")} rules={[{ required: isNew, whitespace: true }]}><Input disabled={!isNew} autoComplete="off" maxLength={64} /></Form.Item>
          <Form.Item name="fullName" label={t("users.fullName")} rules={[{ required: true, whitespace: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="password" label={isNew ? t("auth.password") : t("users.newPassword")} extra={t("forgot.hint")}
            rules={[{ required: isNew }, { validator: (_, v) => (!v || PW_RE.test(v) ? Promise.resolve() : Promise.reject(new Error(t("forgot.weak")))) }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label={t("profile.role")}>
            <Select disabled={editing?.id === me.id} options={roles.map((r) => ({ value: r, label: t(`users.roles.${r}`) }))} />
          </Form.Item>
          {adminRole ? (
            <div className="rv-muted" style={{ fontSize: 13, marginBottom: 16 }}>{t("users.adminAll")}</div>
          ) : (
            <>
              <Form.Item name="access" label={t("users.pages")}>
                <Radio.Group options={[{ value: "all", label: t("users.allPages") }, { value: "some", label: t("users.onlySelected") }]} />
              </Form.Item>
              {access === "some" && (
                <Form.Item name="pages" rules={[{ required: true, type: "array", min: 1, message: t("users.pickPage") }]} style={{ marginTop: -8 }}>
                  <Checkbox.Group style={{ display: "grid", gap: 6 }} options={PAGES.map((p) => ({ value: p, label: pageName(p) }))} />
                </Form.Item>
              )}
              <Form.Item name="tabsAccess" label={t("users.stationTabs")} extra={access === "some" && !(pagesPicked || []).includes("map") ? t("users.tabsNeedMap") : t("users.tabsHint")}>
                <Radio.Group options={[{ value: "all", label: t("users.allTabs") }, { value: "some", label: t("users.onlySelected") }]} />
              </Form.Item>
              {tabsAccess === "some" && (
                <Form.Item name="stationTabs" rules={[{ required: true, type: "array", min: 1, message: t("users.pickTab") }]} style={{ marginTop: -8 }}>
                  <Checkbox.Group className="rv-tab-checks" options={STATION_TAB_KEYS.map((k) => ({
                    value: k, disabled: WIP_TABS.has(k),
                    label: WIP_TABS.has(k) ? <span>{t(`station.tabs.${k}`)} <span className="rv-muted" style={{ fontSize: 11 }}>· {t("wip.badge")}</span></span> : t(`station.tabs.${k}`),
                  }))} />
                </Form.Item>
              )}
            </>
          )}
          <Button type="primary" htmlType="submit" block>{t("common.save")}</Button>
        </Form>
      </Modal>
    </div>
  );
}

import { App, Avatar, Badge, Button, Form, Input, List, Segmented, Table, Tabs } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { KeyRound, History, Mail, UserRound, SunMoon, Languages } from "lucide-react";
import api from "../api";
import { useAuth } from "../store/auth";
import { useFetch } from "../components/ui";
import { dateTime } from "../utils";

export default function Profile() {
  const { t } = useTranslation();
  const { user, theme, setTheme, lang, setLang } = useAuth();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "profile";
  const hist = useFetch(tab === "history" ? "/api/user/login-history" : null);
  const inbox = useFetch(tab === "inbox" ? "/api/user/messages" : null);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const changePw = async (v) => {
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { oldPassword: v.old, newPassword: v.new });
      message.success(t("profile.changed"));
      form.resetFields();
    } catch (e) {
      const d = e.response?.data?.detail;
      message.error(d === "old_wrong" ? t("profile.oldWrong") : d === "same" ? t("profile.same") : t("forgot.weak"));
    } finally { setBusy(false); }
  };

  return (
    <div className="rv-page" style={{ maxWidth: 1000 }}>
      <div className="rv-card" style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 14 }}>
        <Avatar size={72} shape="square" style={{ background: "linear-gradient(135deg,#14b8a6,#0e7490)", borderRadius: 18, fontSize: 30 }}>{user.fullName[0]}</Avatar>
        <div>
          <h2 className="rv-title">{user.fullName}</h2>
          <div className="rv-muted">@{user.username} · {t("profile.role")}: <b>{user.role}</b></div>
        </div>
      </div>
      <div className="rv-card">
        <Tabs activeKey={tab} onChange={(k) => setParams({ tab: k })} items={[
          {
            key: "profile", label: <span style={{ display: "flex", gap: 6, alignItems: "center" }}><UserRound size={15} />{t("profile.profile")}</span>,
            children: (
              <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
                <div><div className="rv-muted" style={{ marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}><SunMoon size={15} />{t("profile.theme")}</div>
                  <Segmented value={theme} onChange={setTheme} options={[{ value: "light", label: t("profile.light") }, { value: "dark", label: t("profile.dark") }]} /></div>
                <div><div className="rv-muted" style={{ marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}><Languages size={15} />{t("profile.lang")}</div>
                  <Segmented value={lang} onChange={setLang} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} /></div>
              </div>
            ),
          },
          {
            key: "password", label: <span style={{ display: "flex", gap: 6, alignItems: "center" }}><KeyRound size={15} />{t("profile.changePassword")}</span>,
            children: (
              <Form form={form} layout="vertical" onFinish={changePw} style={{ maxWidth: 420 }} requiredMark={false}>
                <Form.Item name="old" label={t("profile.oldPassword")} rules={[{ required: true }]}><Input.Password /></Form.Item>
                <Form.Item name="new" label={t("profile.newPassword")} extra={t("forgot.hint")} rules={[{ required: true }, { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{7,}$/, message: t("forgot.weak") }]}><Input.Password /></Form.Item>
                <Form.Item name="confirm" label={t("profile.confirm")} dependencies={["new"]}
                  rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v === getFieldValue("new") ? Promise.resolve() : Promise.reject(t("profile.mismatch"))) })]}><Input.Password /></Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>{t("common.save")}</Button>
              </Form>
            ),
          },
          {
            key: "history", label: <span style={{ display: "flex", gap: 6, alignItems: "center" }}><History size={15} />{t("profile.history")}</span>,
            children: (
              <Table rowKey="id" loading={hist.loading} dataSource={hist.data || []} size="small" pagination={{ pageSize: 10 }}
                columns={[{ title: "#", width: 50, render: (_, __, i) => i + 1 }, { title: t("profile.browser"), dataIndex: "browser" }, { title: t("profile.device"), dataIndex: "device" },
                  { title: t("profile.ip"), dataIndex: "ip" }, { title: t("profile.time"), dataIndex: "at", render: dateTime }]} />
            ),
          },
          {
            key: "inbox", label: <span style={{ display: "flex", gap: 6, alignItems: "center" }}><Mail size={15} />{t("profile.inbox")}</span>,
            children: (
              <List loading={inbox.loading} dataSource={inbox.data || []} renderItem={(m) => (
                <List.Item onClick={() => !m.isRead && api.post(`/api/user/messages/${m.id}/read`)} style={{ cursor: "pointer" }}>
                  <List.Item.Meta avatar={<Badge dot={!m.isRead}><Avatar icon={<Mail size={16} />} /></Badge>} title={m.title} description={<>{m.body}<div className="rv-muted" style={{ fontSize: 12 }}>{dateTime(m.at)}</div></>} />
                </List.Item>
              )} />
            ),
          },
        ]} />
      </div>
    </div>
  );
}

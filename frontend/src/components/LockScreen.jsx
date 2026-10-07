import { Button, Input, App } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LockKeyhole } from "lucide-react";
import api from "../api";
import { useAuth } from "../store/auth";
import { LogoMark } from "./Logo";

export default function LockScreen() {
  const { t } = useTranslation();
  const { user, lock, logout } = useAuth();
  const { message } = App.useApp();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    try { await api.post("/api/auth/unlock", { password: pw }); lock(false); }
    catch { message.error(t("auth.loginError")); }
    finally { setBusy(false); }
  };
  return (
    <div className="rv-lock">
      <div className="rv-card" style={{ width: 360, textAlign: "center", padding: 28 }}>
        <LogoMark size={56} />
        <h2 style={{ margin: "14px 0 4px" }}>{user.fullName}</h2>
        <div className="rv-muted" style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}><LockKeyhole size={14} />{t("profile.locked")}</div>
        <p className="rv-muted" style={{ fontSize: 13 }}>{t("profile.unlockHint")}</p>
        <Input.Password autoFocus size="large" value={pw} onChange={(e) => setPw(e.target.value)} onPressEnter={unlock} placeholder={t("auth.password")} />
        <Button type="primary" block size="large" loading={busy} onClick={unlock} style={{ marginTop: 12 }}>{t("profile.unlock")}</Button>
        <Button type="link" onClick={logout} style={{ marginTop: 6 }}>{t("auth.logout")}</Button>
      </div>
    </div>
  );
}

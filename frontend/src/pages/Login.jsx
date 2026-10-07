import { App, Button, Form, Input, Modal, Segmented, Steps } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, UserRound, KeyRound, Map, LayoutDashboard, ScanLine, Cctv, LogIn } from "lucide-react";
import api from "../api";
import { useAuth } from "../store/auth";
import Logo, { LogoMark } from "../components/Logo";
import PaletteRoute from "../components/PaletteRoute";
import RailTrack from "../components/RailTrack";

function ForgotModal({ open, onClose }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = () => { setStep(0); setToken(""); onClose(); };
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <Modal open={open} onCancel={reset} footer={null} title={t("forgot.title")} destroyOnHidden>
      <Steps size="small" current={step} items={[{ title: "Login" }, { title: "Kod" }, { title: t("forgot.newPassword") }]} style={{ margin: "8px 0 20px" }} />
      {step === 0 && (
        <Form layout="vertical" onFinish={(v) => run(async () => { await api.post("/api/auth/forgot-password/start", v); setUsername(v.username); setStep(1); })}>
          <p className="rv-muted">{t("forgot.step1")} <b>@SilkRailBot</b></p>
          <Form.Item name="username" rules={[{ required: true }]}><Input size="large" prefix={<UserRound size={16} />} placeholder="Login" /></Form.Item>
          <Button htmlType="submit" type="primary" block size="large" loading={busy}>{t("forgot.continue")}</Button>
        </Form>
      )}
      {step === 1 && (
        <Form layout="vertical" onFinish={(v) => run(async () => {
          try { const { data } = await api.post("/api/auth/forgot-password/verify", { username, code: v.code }); setToken(data.token); setStep(2); }
          catch { message.error(t("forgot.codeWrong")); }
        })}>
          <p className="rv-muted">{t("forgot.step2")}</p>
          <Form.Item name="code" rules={[{ required: true, len: 6, message: t("forgot.codeLen") }]}>
            <Input.OTP length={6} size="large" />
          </Form.Item>
          <p className="rv-muted" style={{ fontSize: 12 }}>{t("forgot.devHint")}</p>
          <Button htmlType="submit" type="primary" block size="large" loading={busy}>{t("forgot.verify")}</Button>
          <Button type="link" block onClick={() => setStep(0)}>{t("forgot.back")}</Button>
        </Form>
      )}
      {step === 2 && (
        <Form layout="vertical" onFinish={(v) => run(async () => {
          try { await api.post("/api/auth/forgot-password/reset", { username, token, password: v.password }); message.success(t("forgot.success")); reset(); }
          catch { message.error(t("forgot.weak")); }
        })}>
          <p className="rv-muted">{t("forgot.step3")}</p>
          <Form.Item name="password" label={t("forgot.newPassword")} extra={t("forgot.hint")}
            rules={[{ required: true }, { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{7,}$/, message: t("forgot.weak") }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item name="confirm" label={t("forgot.confirm")} dependencies={["password"]}
            rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v === getFieldValue("password") ? Promise.resolve() : Promise.reject(t("forgot.mismatch"))) })]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button htmlType="submit" type="primary" block size="large" loading={busy}>{t("forgot.submit")}</Button>
        </Form>
      )}
    </Modal>
  );
}

/* Registan silhouette: Ulugbek, Tillya-Kori and Sher-Dor madrasas with portals, domes and minarets */
function Registan() {
  const arch = (x, w, y, h) => `M${x} ${y + h}V${y + w * 0.55}C${x} ${y + w * 0.2} ${x + w * 0.3} ${y + w * 0.05} ${x + w / 2} ${y}C${x + w * 0.7} ${y + w * 0.05} ${x + w} ${y + w * 0.2} ${x + w} ${y + w * 0.55}V${y + h}Z`;
  return (
    <svg className="rv-skyline" viewBox="0 0 600 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g className="mass">
        <rect x="34" y="24" width="12" height="106" rx="2" /><rect x="31" y="18" width="18" height="8" rx="2" />
        <rect x="64" y="46" width="96" height="84" /><ellipse cx="178" cy="70" rx="26" ry="24" /><rect x="152" y="70" width="52" height="60" />
        <rect x="224" y="34" width="112" height="96" /><ellipse cx="366" cy="62" rx="36" ry="34" /><rect x="330" y="62" width="72" height="68" />
        <rect x="360" y="20" width="12" height="10" rx="3" />
        <ellipse cx="428" cy="76" rx="20" ry="19" /><rect x="408" y="76" width="40" height="54" />
        <rect x="444" y="46" width="96" height="84" /><ellipse cx="558" cy="76" rx="20" ry="19" /><rect x="538" y="76" width="40" height="54" />
        <rect x="582" y="24" width="12" height="106" rx="2" /><rect x="579" y="18" width="18" height="8" rx="2" />
      </g>
      <g className="arches">
        <path d={arch(88, 48, 60, 70)} /><path d={arch(250, 60, 48, 82)} /><path d={arch(468, 48, 60, 70)} />
        {[76, 150, 236, 324, 456, 530].map((x) => <path key={x} d={arch(x - 4, 10, 96, 16)} />)}
      </g>
      <circle className="sun" cx="280" cy="80" r="7" />
    </svg>
  );
}

/* a thin route through the app's sections, a light runs along it */
function RouteLine() {
  const { t } = useTranslation();
  const stops = [[Map, t("nav.map")], [LayoutDashboard, t("nav.dashboard")], [ScanLine, t("nav.analytics")], [Cctv, t("nav.cameras")]];
  return (
    <ol className="rv-route-line-h" aria-label={t("login.route")}>
      <i className="runner" aria-hidden="true" />
      {stops.map(([Icon, name], k) => (
        <li key={name} style={{ animationDelay: `${0.15 + k * 0.1}s` }}>
          <span className="stop"><Icon size={14} /></span>
          <span className="nm">{name}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Login() {
  const { t, i18n } = useTranslation();
  const { user, login, setLang } = useAuth();
  const { message } = App.useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [cap, setCap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [form] = Form.useForm();

  const loadCaptcha = useCallback(() => api.get("/api/auth/captcha").then((r) => setCap(r.data)), []);
  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);
  if (user) return <Navigate to={loc.state?.from || "/"} replace />;

  const submit = async (v) => {
    setBusy(true);
    try {
      await login({ ...v, captchaId: cap?.captchaId });
      message.success(t("auth.success"));
      nav(loc.state?.from || "/", { replace: true });
    } catch (e) {
      message.error(e.response?.data?.detail === "captcha" ? t("auth.captchaError") : t("auth.loginError"));
      form.setFieldValue("captcha", "");
      loadCaptcha();
    } finally { setBusy(false); }
  };


  return (
    <div className="rv-login">
      <section className="rv-login-hero">
        <div className="top">
          <Logo size={46} subtitle={t("brand.tagline")} />
          <PaletteRoute />
        </div>
        <div className="mid">
          <h1>{t("auth.hero")}</h1>
          <p>{t("auth.heroText")}</p>
          <RouteLine />
        </div>
        <div className="bottom">
          <Registan />
          <RailTrack kind="neon" />
        </div>
        <div className="copy">© {new Date().getFullYear()} SilkRail</div>
      </section>
      <section className="rv-login-form">
        <div className="inner">
          <div className="bar">
            <span className="mark"><LogoMark size={34} /></span>
            <Segmented size="small" value={i18n.language} onChange={setLang} options={[{ value: "uz", label: "UZ" }, { value: "ru", label: "RU" }, { value: "en", label: "EN" }]} />
          </div>
          <div className="eyebrow">{t("login.eyebrow")}</div>
          <h2>{t("auth.welcome")}</h2>
          <p className="rv-muted" style={{ marginTop: 0, marginBottom: 26 }}>{t("auth.subtitle")}</p>
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
            <Form.Item name="username" label={t("auth.username")} rules={[{ required: true }]}>
              <Input size="large" prefix={<UserRound size={16} />} autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label={t("auth.password")} rules={[{ required: true }]}>
              <Input.Password size="large" prefix={<KeyRound size={16} />} autoComplete="current-password" />
            </Form.Item>
            <Form.Item label={t("auth.captcha")} required>
              <div className="rv-captcha">
                <div className="img">{cap?.image && <img src={cap.image} alt="captcha" style={{ height: 46, display: "block" }} />}</div>
                <Button icon={<RefreshCw size={16} />} onClick={loadCaptcha} aria-label="refresh" />
                <Form.Item name="captcha" noStyle rules={[{ required: true }]}>
                  <Input size="large" maxLength={5} style={{ textTransform: "uppercase" }} />
                </Form.Item>
              </div>
            </Form.Item>
            <div style={{ textAlign: "right", marginTop: -8, marginBottom: 16 }}><a onClick={() => setForgot(true)}>{t("auth.forgot")}</a></div>
            <Button htmlType="submit" type="primary" size="large" block loading={busy} className="rv-login-btn" icon={<LogIn size={17} />} iconPlacement="end">{t("auth.login")}</Button>
          </Form>
          <p className="rv-login-demo">{t("auth.demo")}</p>
        </div>
      </section>
      <ForgotModal open={forgot} onClose={() => setForgot(false)} />
    </div>
  );
}

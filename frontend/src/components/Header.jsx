import { Avatar, Badge, Dropdown } from "antd";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Map, LayoutDashboard, ScanLine, Cctv, UserRound, Mail, Lock, SunMoon, Languages, LogOut, Check, UsersRound, ChevronRight, ToggleRight } from "lucide-react";
import { LogoMark } from "./Logo";
import PaletteRoute from "./PaletteRoute";
import SectionsModal from "./SectionsModal";
import RailTrack from "./RailTrack";
import { useAuth, canSee, homePath, isAdmin } from "../store/auth";
import { get } from "../api";

const LANGS = [["uz", "O'zbekcha"], ["ru", "Русский"], ["en", "English"]];
// Header remounts on every route; keep open state + indicator position for the session so the indicator can slide
const session = { open: false, ind: null };

export default function Header() {
  const { t } = useTranslation();
  const { user, logout, theme, setTheme, setLang, lang, lock } = useAuth();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  const [sections, setSections] = useState(false);
  // collapsed by default; the header slides out from the left edge on the arrow
  const [open, setOpenState] = useState(session.open);
  const setOpen = (v) => setOpenState((o) => (session.open = typeof v === "function" ? v(o) : v));
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // sliding "train" indicator under the active section
  const loc = useLocation();
  const navRef = useRef(null);
  const [ind, setInd] = useState(session.ind);
  useLayoutEffect(() => {
    const place = () => {
      const a = navRef.current?.querySelector("a.active");
      session.ind = a ? { left: a.offsetLeft, width: a.offsetWidth } : null;
      setInd(session.ind);
    };
    // next frame, so the indicator transitions from the previous page's position
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); };
  }, [loc.pathname, lang, open]);
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => { const id = setInterval(() => setNow(dayjs()), 15000); return () => clearInterval(id); }, []);
  useEffect(() => { get("/api/user/messages").then((m) => setUnread(m.filter((x) => !x.isRead).length)).catch(() => {}); }, []);

  const items = [
    { key: "who", disabled: true, label: <div style={{ padding: "4px 0" }}><b>{user.fullName}</b><div className="rv-muted" style={{ fontSize: 12 }}>{user.role}</div></div> },
    { type: "divider" },
    { key: "profile", icon: <UserRound size={16} />, label: t("profile.profile"), onClick: () => nav("/profile") },
    ...(isAdmin(user) ? [
      { key: "users", icon: <UsersRound size={16} />, label: t("users.title"), onClick: () => nav("/users") },
      { key: "sections", icon: <ToggleRight size={16} />, label: t("sections.menu"), onClick: () => setSections(true) },
    ] : []),
    { key: "inbox", icon: <Mail size={16} />, label: <Badge count={unread} size="small" offset={[10, 0]}>{t("profile.inbox")}</Badge>, onClick: () => nav("/profile?tab=inbox") },
    { key: "theme", icon: <SunMoon size={16} />, label: `${t("profile.theme")}: ${theme === "dark" ? t("profile.dark") : t("profile.light")}`, onClick: () => setTheme(theme === "dark" ? "light" : "dark") },
    {
      key: "lang", icon: <Languages size={16} />, label: t("profile.lang"),
      children: LANGS.map(([k, n]) => ({ key: `l-${k}`, label: <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>{n}{lang === k && <Check size={14} />}</span>, onClick: () => setLang(k) })),
    },
    { key: "lock", icon: <Lock size={16} />, label: t("profile.lock"), onClick: () => lock(true) },
    { type: "divider" },
    { key: "out", icon: <LogOut size={16} />, danger: true, label: t("auth.logout"), onClick: () => { logout(); nav("/login"); } },
  ];

  const links = [
    ["/", Map, t("nav.map"), "map"],
    ["/dashboard", LayoutDashboard, t("nav.dashboard"), "dashboard"],
    ["/analytics", ScanLine, t("nav.analytics"), "analytics"],
    ["/cameras", Cctv, t("nav.cameras"), "cameras"],
    ...(isAdmin(user) ? [["/users", UsersRound, t("users.title")]] : []),
  ].filter(([, , , page]) => !page || canSee(user, page));

  return (
    <header className={`rv-header ${open ? "open" : ""}`}>
      <NavLink to={homePath(user)} className="rv-header-brand" aria-label="SilkRail"><LogoMark size={38} /></NavLink>
      {!open && (
        <button type="button" className="rv-header-plate" onClick={() => setOpen(true)} title={t("nav.menu")}>
          <span>Silk</span><b>Rail</b>
        </button>
      )}
      <div className="rv-header-body" aria-hidden={!open} inert={!open}>
        <div className="rv-header-inner">
          <div className="rv-header-word">
            <div className="rv-logo-text"><span>Silk</span><b>Rail</b></div>
            <div className="rv-logo-sub">{t("brand.tagline")}</div>
          </div>
          <i className="rv-hsep" />
          <nav className="rv-nav" ref={navRef}>
            {ind && <span className="rv-nav-ind" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} />}
            {links.map(([to, Icon, label]) => (
              <NavLink key={to} to={to} end={to === "/"} title={label}><Icon size={16} /><span>{label}</span></NavLink>
            ))}
          </nav>
          <i className="rv-hsep" />
          <div className="rv-board" title={t("nav.online")}>
            <i className="led" />
            <div><b>{now.format("HH:mm")}</b><span>{now.format("DD.MM.YYYY")}</span></div>
          </div>
          <PaletteRoute />
          <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
            <button type="button" className="rv-avatar-btn">
              <Badge dot={unread > 0} offset={[-2, 2]}>
                <Avatar shape="square" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#0b2530", fontWeight: 800, borderRadius: 10 }}>{user.fullName?.[0]}</Avatar>
              </Badge>
              <div className="txt"><div className="n">{user.fullName}</div><div className="r">{user.username}</div></div>
            </button>
          </Dropdown>
        </div>
      </div>
      <button type="button" className="rv-header-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? t("common.close") : t("nav.menu")} title={open ? t("common.close") : t("nav.menu")}>
        <ChevronRight size={18} />
        {!open && unread > 0 && <i className="dot" />}
      </button>
      <RailTrack kind="neon" />
      {isAdmin(user) && <SectionsModal open={sections} onClose={() => setSections(false)} />}
    </header>
  );
}

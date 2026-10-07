import { ConfigProvider, App as AntApp, Spin, theme as antTheme } from "antd";
import ruRU from "antd/locale/ru_RU";
import enUS from "antd/locale/en_US";
import uzUZ from "antd/locale/uz_UZ";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import "dayjs/locale/uz-latn";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth, canSee, homePath, isAdmin } from "./store/auth";
import { paletteByKey } from "./palettes";
import Header from "./components/Header";
import LockScreen from "./components/LockScreen";
import Login from "./pages/Login";

const MapPage = lazy(() => import("./pages/MapPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Cameras = lazy(() => import("./pages/Cameras"));
const Profile = lazy(() => import("./pages/Profile"));
const Users = lazy(() => import("./pages/Users"));

/** page: key from PAGE_PATHS the user must be granted; admin: admins only */
function Protected({ children, page, admin }) {
  const { user, ready, locked } = useAuth();
  const loc = useLocation();
  if (!ready) return <div style={{ height: "100%", display: "grid", placeItems: "center" }}><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if ((page && !canSee(user, page)) || (admin && !isAdmin(user))) return <Navigate to={homePath(user)} replace />;
  return (
    <>
      <Header />
      <Suspense fallback={<div style={{ paddingTop: 140, textAlign: "center" }}><Spin /></div>}>{children}</Suspense>
      {locked && <LockScreen />}
    </>
  );
}

function Themed() {
  const { theme, lang, palette } = useAuth();
  dayjs.locale(lang === "ru" ? "ru" : lang === "uz" ? "uz-latn" : "en");
  const dark = theme === "dark";
  return (
    <ConfigProvider
      locale={lang === "ru" ? ruRU : lang === "en" ? enUS : uzUZ}
      theme={{
        algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: paletteByKey(palette).primary[dark ? "dark" : "light"][0], borderRadius: 10, fontFamily: "Manrope, system-ui, sans-serif",
          colorBgContainer: dark ? "#111e2a" : "#ffffff", colorBgElevated: dark ? "#132232" : "#ffffff", colorBorder: dark ? "#1f3347" : "#e2e8ee",
        },
        components: { Table: { headerBg: dark ? "#16263a" : "#f1f6f8", headerColor: dark ? "#b7c7d6" : "#334155", cellPaddingBlock: 11 } },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected page="map"><MapPage /></Protected>} />
            <Route path="/dashboard" element={<Protected page="dashboard"><Dashboard /></Protected>} />
            <Route path="/analytics" element={<Protected page="analytics"><Analytics /></Protected>} />
            <Route path="/cameras" element={<Protected page="cameras"><Cameras /></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="/users" element={<Protected admin><Users /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default function App() {
  return <AuthProvider><Themed /></AuthProvider>;
}

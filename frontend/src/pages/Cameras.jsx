import { useTranslation } from "react-i18next";
import { Cctv, Wifi, WifiOff } from "lucide-react";
import { Loader, NoData, StatCard, useFetch } from "../components/ui";
import CameraConsole from "../components/CameraConsole";

const ARGUS_LANG = { uz: "uz-Latn", ru: "ru", en: "en" };

/** All cameras, grouped by station; the viewer opens the ones to watch (only those play). */
export default function Cameras() {
  const { t, i18n } = useTranslation();
  const { data, loading } = useFetch("/api/cameras", { lang: ARGUS_LANG[i18n.language] || "ru" });
  const online = (data || []).filter((c) => c.online).length;
  return (
    <div className="rv-page">
      <div className="rv-toolbar"><h2 className="rv-title">{t("cameras.title")}</h2></div>
      {data && (
        <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 14 }}>
          <StatCard label={t("cameras.total")} value={data.length} icon={Cctv} />
          <StatCard label={t("cameras.online")} value={online} icon={Wifi} color="#16a34a" />
          <StatCard label={t("cameras.offline")} value={data.length - online} icon={WifiOff} color="#ef4444" />
        </div>
      )}
      <Loader loading={loading}>
        {data?.length ? <CameraConsole cameras={data} storageKey="rv_cams_all" groupByStation />
          : <div className="rv-card"><NoData /></div>}
      </Loader>
    </div>
  );
}

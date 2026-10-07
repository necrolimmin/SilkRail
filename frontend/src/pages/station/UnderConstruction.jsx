import { useTranslation } from "react-i18next";
import { EyeOff } from "lucide-react";

/** Shown to admins in station sections that are still being built (hidden from regular users). */
export default function UnderConstruction({ section }) {
  const { t } = useTranslation();
  return (
    <div className="rv-card rv-wip">
      <svg className="scene" viewBox="0 0 320 120" role="img" aria-label={t("wip.title")}>
        {/* track fading into the distance */}
        <path d="M20 112 128 44M300 112 192 44" className="rail" />
        {[[40, 108, 280], [70, 90, 250], [96, 74, 224], [117, 61, 203], [133, 51, 187]].map(([x1, y, x2]) => (
          <path key={y} d={`M${x1} ${y}H${x2}`} className="sleeper" />
        ))}
        {/* barrier across the track */}
        <rect x="62" y="70" width="196" height="12" rx="3" className="bar" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${72 + i * 28} 70l-10 12h9l10-12z`} className="stripe" />)}
        <rect x="70" y="82" width="6" height="26" rx="2" className="post" /><rect x="244" y="82" width="6" height="26" rx="2" className="post" />
        {/* signal with a blinking lamp */}
        <rect x="272" y="14" width="22" height="46" rx="11" className="signal" />
        <rect x="281" y="60" width="4" height="50" className="post" />
        <circle cx="283" cy="26" r="6" className="lamp" />
        <circle cx="283" cy="46" r="6" className="lamp-off" />
      </svg>
      <div className="eyebrow">{t(`station.tabs.${section}`)}</div>
      <h3>{t("wip.title")}</h3>
      <p>{t("wip.text")}</p>
      <span className="note"><EyeOff size={14} />{t("wip.hidden")}</span>
    </div>
  );
}

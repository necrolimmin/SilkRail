import { useTranslation } from "react-i18next";
import { ICONS, IconPreview } from "./layers";

/** Map legend shown in the bottom dock ("Belgilar"); uses the real marker icons so it always matches the map. */
export default function MapLegend() {
  const { t } = useTranslation();
  const rows = [
    [ICONS.hub, t("map.legend.hub")],
    [ICONS.station, t("map.legend.station")],
    [ICONS.halt, t("map.legend.halt")],
    [ICONS.yard, t("map.legend.yard")],
    [ICONS.stationOff, t("map.passive")],
    [ICONS.fuel, t("map.layer.fuel")[0]],
    [ICONS.company, t("map.companies")],
    [ICONS.depot, t("map.other")],
    [ICONS.camera, t("map.cameras")],
    [ICONS.crossingOk, t("map.protected")],
    [ICONS.crossingNo, t("map.unprotected")],
    [ICONS.warning.mid, t("map.layer.warnings")[0]],
  ];
  return (
    <div className="rv-legend-grid">
      {rows.map(([icon, label]) => (
        <div className="row" key={label}><IconPreview icon={icon} box={40} scale={0.8} /><span>{label}</span></div>
      ))}
    </div>
  );
}

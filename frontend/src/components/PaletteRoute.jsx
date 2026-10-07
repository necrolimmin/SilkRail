import { Dropdown } from "antd";
import { useTranslation } from "react-i18next";
import { TrainFront } from "lucide-react";
import { PALETTES } from "../palettes";
import { useAuth } from "../store/auth";

/** Colour-theme picker drawn as a railway route: every palette is a station, the active one has the train. */
export default function PaletteRoute() {
  const { t } = useTranslation();
  const { palette, setPalette } = useAuth();
  const cur = PALETTES.find((p) => p.key === palette) || PALETTES[0];

  const route = () => (
    <div className="rv-route" role="listbox" aria-label={t("palette.title")}>
      <div className="rv-route-head"><b>{t("palette.title")}</b><span>{t("palette.hint")}</span></div>
      <div className="rv-route-line">
        {PALETTES.map((p) => {
          const on = p.key === palette;
          const b = p.bar;
          return (
            <button key={p.key} type="button" role="option" aria-selected={on} className={`rv-stop ${on ? "on" : ""}`} onClick={() => setPalette(p.key)}
              style={{ "--s-glow": b.glow, "--s-lamp": b.lamp }}>
              <span className="dot">{on && <TrainFront size={12} />}</span>
              <span className="nm"><b>{t(`palette.names.${p.key}`)}</b><span>{p.city}</span></span>
              {/* the carriage: a tiny copy of the bar in this palette */}
              <span className="car" style={{ background: `linear-gradient(135deg, ${b.bg}, ${b.bg2})`, borderColor: `color-mix(in srgb, ${b.glow} 30%, transparent)` }}>
                <i style={{ background: `linear-gradient(135deg, ${b.ind1}, ${b.ind2})` }} />
                <i style={{ background: b.lamp }} />
                <i style={{ background: b.glow }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" popupRender={route}>
      <button type="button" className="rv-pal-btn" title={t("palette.title")} aria-label={t("palette.title")}
        style={{ "--p1": cur.bar.ind1, "--p2": cur.bar.glow, "--p3": cur.bar.lamp }}>
        <span className="disc" />
      </button>
    </Dropdown>
  );
}

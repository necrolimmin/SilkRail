import { useId } from "react";

/* SilkRail mark: a Registan-style pointed arch (ivan) with a track running into it and the sun inside.
   Colours come from the active palette (see palettes.js); fallbacks = default "registon" palette. */
export function LogoMark({ size = 36 }) {
  const id = `rvlogo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const arch = { stroke: "var(--hd-logo-arch, #5eead4)" };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--hd-logo-a, #0b2530)" }} />
          <stop offset="1" style={{ stopColor: "var(--hd-logo-b, #103a46)" }} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${id})`} />
      <path d="M11 41V22.5C11 15 17 10.5 24 7.5 31 10.5 37 15 37 22.5V41" style={arch} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M15.5 41V24C15.5 18.5 19.5 15.5 24 13 28.5 15.5 32.5 18.5 32.5 24V41" style={arch} strokeOpacity=".35" strokeWidth="1.4" />
      <circle cx="24" cy="21.5" r="4.2" style={{ fill: "var(--hd-lamp, #fde68a)" }} />
      <path d="M18 41 22.6 27M30 41 25.4 27" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.3 37.5h11.4M19.6 33.5h8.8M20.8 30h6.4" stroke="#fff" strokeOpacity=".6" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 34, subtitle }) {
  return (
    <div className="rv-logo">
      <LogoMark size={size} />
      <div>
        <div className="rv-logo-text"><span>Silk</span><b>Rail</b></div>
        {subtitle && <div className="rv-logo-sub">{subtitle}</div>}
      </div>
    </div>
  );
}

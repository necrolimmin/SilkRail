import { useId } from "react";

/* Minimal gender avatar: male — short hair, teal; female — long hair, pink. */
const TONES = {
  M: { bg: "#ccfbf1", fg: "#0d9488", hair: "#0f766e" },
  F: { bg: "#fce7f3", fg: "#db2777", hair: "#9d174d" },
};

export default function PersonAvatar({ gender, size = 36, title }) {
  const id = `pa${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const c = TONES[gender] || TONES.M;
  const female = gender === "F";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title} style={{ flexShrink: 0, display: "block" }}>
      <defs><clipPath id={id}><circle cx="20" cy="20" r="20" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="40" fill={c.bg} />
        {female && <path d="M11.2 17.5c0-6.2 3.9-9.9 8.8-9.9s8.8 3.7 8.8 9.9v9.3c-2.2 1.3-5 1.9-8.8 1.9s-6.6-.6-8.8-1.9z" fill={c.hair} />}
        <path d="M6.5 41c1.2-8.3 6.6-12.6 13.5-12.6S32.3 32.7 33.5 41z" fill={c.fg} />
        <circle cx="20" cy="17" r="6.6" fill="#fff" />
        {female
          ? <path d="M13.3 16.6c.3-4.6 3.1-7.3 6.7-7.3 3.3 0 6 2.3 6.6 6.3-2.6-.3-5.1-1.5-6.9-3.6-1.3 2.3-3.4 3.8-6.4 4.6z" fill={c.hair} />
          : <path d="M13.4 16.3c-.2-4.8 2.7-7.9 6.6-7.9 3.8 0 6.8 2.9 6.6 7.9-.9-2.3-2.8-3.7-6.6-3.7s-5.7 1.4-6.6 3.7z" fill={c.hair} />}
      </g>
    </svg>
  );
}

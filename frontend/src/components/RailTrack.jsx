/* Rail track along the bottom edge of the bars with something travelling on it.
   Everything is drawn with palette variables (--hd-glow / --hd-lamp / --hd-ind1), so it recolours with the theme.
     neon    — glowing outline of a high-speed train (header)
     caravan — Silk Road caravan of Bactrian camels in striped silk blankets (bottom dock) */

function NeonTrain() {
  return (
    <svg viewBox="0 0 134 15" width="104" height="12" fill="none">
      <path d="M115 10.4 133 6.8V14z" className="beam" />
      <g className="neon" strokeWidth="1" strokeLinejoin="round">
        <rect x="2.5" y="3.5" width="33" height="8.5" rx="2" className="glow" />
        <rect x="38.5" y="3.5" width="33" height="8.5" rx="2" className="glow" />
        <path d="M74.5 3.5h20c8.5 0 16.3 3.6 22.5 7.6H74.5z" className="glow" />
        <path d="M36 7.5h2.5M72 7.5h2.5" className="glow" />
      </g>
      {[2, 38].map((x) => [0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`${x}-${i}`} x={x + 3.4 + i * 5} y="5.4" width="3" height="2" rx=".5" className="win" />
      )))}
      <path d="M95 5.2c4 .3 7.8 1.3 11 2.8H95z" className="win" />
      {[5, 28, 41, 64, 77, 100].map((x) => <circle key={x} cx={x} cy="13" r="1" className="lamp" />)}
      <circle cx="114.6" cy="10.4" r="1.1" className="lamp" />
    </svg>
  );
}

/* Bactrian camel facing right, 24×14 box */
const CAMEL = "M3 8C3 6 4 5.2 5 5.2 5.4 1.8 8.6 1.4 9.3 4.7 9.9 1.5 13.3 1.7 13.7 5.1 15 5.4 16 5.8 16.8 5L18.5 2.6C19 2 20.5 2 21 2.6L22.2 3.4 21.6 4.2 20 4 18.2 7.6C17.8 8.8 16.5 9.2 15.5 9.2L15.5 13H14.6L14.4 9.6H13.2V13H12.3L12 9.6H7.5V13H6.6L6.3 9.4 5.2 9.2 5 13H4.1L4 8.8C3.5 8.6 3.2 8.4 3 8Z";

function Caravan() {
  return (
    <svg viewBox="0 0 84 15" width="78" height="14" fill="none">
      {/* lead rope between the camels */}
      <path d="M21 5 30 7.4M49 5 58 7.4" className="rope" />
      {[0, 28, 56].map((x, i) => (
        <g key={x} transform={`translate(${x} 1)`}>
          <g className="camel" style={{ animationDelay: `${i * 0.18}s` }}>
            <path d={CAMEL} className="body" />
            {/* striped silk blanket over the flank */}
            <rect x="6.2" y="5.2" width="8" height="2" rx=".5" className={i === 1 ? "bale2" : "bale"} />
            <rect x="6.2" y="6" width="8" height=".45" className={i === 1 ? "bale" : "bale2"} />
            {i === 2 && <circle cx="22.6" cy="6.4" r="1.2" className="lamp" />}
          </g>
        </g>
      ))}
      {/* lantern rope from the leader's muzzle */}
      <path d="M78.4 5.2V6.4" className="rope" />
    </svg>
  );
}

export default function RailTrack({ kind = "neon" }) {
  return (
    <i className={`rv-track ${kind}`} aria-hidden="true">
      {/* the lane is as wide as the track and moves with transform; the train sits just left of it */}
      <span className="rv-lane"><span className="rv-train-run">{kind === "caravan" ? <Caravan /> : <NeonTrain />}</span></span>
    </i>
  );
}

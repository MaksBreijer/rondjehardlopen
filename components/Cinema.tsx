import Logo from "./Logo";

/** Deterministic wobbly closed curve (topographic contour) around a centre. */
function blob(cx: number, cy: number, r: number, k: number, squash = 0.78): string {
  const pts: string[] = [];
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.1 * Math.sin(3 * a + k * 0.7) + 0.06 * Math.sin(5 * a + k * 1.3) + 0.03 * Math.sin(9 * a + k));
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * squash * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const CX = 520;
const CY = 300;
const CONTOURS = Array.from({ length: 16 }, (_, k) => blob(CX, CY, 60 + k * 38, k));
const ROUTE = blob(CX - 20, CY + 10, 235, 4.2, 0.86);

/** Full-bleed dark opening: a topographic map with a route drawing itself and a runner dot. */
export default function Cinema({ onLogo, widget, children }: { onLogo: () => void; widget?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="cine">
      <svg className="cine-art" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="vig" cx="55%" cy="42%" r="70%">
            <stop offset="0" stopColor="#18222b" stopOpacity="0" />
            <stop offset="1" stopColor="#080b0e" stopOpacity=".85" />
          </radialGradient>
        </defs>
        <g fill="none" stroke="#ffffff" strokeOpacity=".075" strokeWidth="1.2">
          {CONTOURS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <path id="route" d={ROUTE} fill="none" stroke="#dff3e6" strokeOpacity=".28" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" className="cine-dash" />
        <path d={ROUTE} fill="none" stroke="#e8f7ee" strokeWidth="3.2" strokeLinecap="round" pathLength="100" className="cine-draw" filter="url(#glow)" />
        <circle r="7" fill="#fff" filter="url(#glow)">
          <animateMotion dur="14s" repeatCount="indefinite" rotate="auto">
            <mpath href="#route" />
          </animateMotion>
        </circle>
        <circle cx={CX + 205} cy={CY + 14} r="9" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
        <rect width="800" height="1000" fill="url(#vig)" />
      </svg>

      <div className="cine-top">
        <button className="logo" onClick={onLogo} aria-label="RondjeHardlopen.nl, naar begin">
          <Logo />
        </button>
        <span className="cine-tag">Gratis · geen account</span>
      </div>

      {widget && <div className="cine-widget">{widget}</div>}

      <div className="cine-in">
        <span className="cine-micro">01 — Afstand &nbsp; 02 — Bestemming &nbsp; 03 — Rondje</span>
        <h1>
          Hardlopen <em>met een bestemming.</em>
        </h1>
        <div className="cine-row">
          <p>
            Kies je afstand en waar je zin in hebt.
            <br />
            Wij maken er een rondje van, vanaf je voordeur.
          </p>
          <div className="cine-chips">{children}</div>
        </div>
        <div className="cine-scroll" aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </section>
  );
}

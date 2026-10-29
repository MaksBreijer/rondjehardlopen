/** Brand mark: an open loop with a runner dot on the gap, plus the lowercase wordmark. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="logo-mark">
      <path d="M88.8 40.3A40 40 0 1 0 88.8 59.7" fill="none" stroke="currentColor" strokeWidth="7" />
      <circle cx="91" cy="50" r="8" fill="currentColor" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo-lockup">
      <LogoMark />
      <span className="logo-word">rondjehardlopen.nl</span>
    </span>
  );
}

import { buzz } from "@/lib/client/haptics";
import { kmLabel } from "@/lib/format";
import { DISTANCES_KM, MARATHON_KM } from "@/lib/types";

const MIN = 2;
const MAX = 42;

export default function DistancePicker({ value, onChange }: { value: number; onChange: (km: number) => void }) {
  const preset = (DISTANCES_KM as readonly number[]).includes(value);
  const pct = ((Math.min(value, MAX) - MIN) / (MAX - MIN)) * 100;
  return (
    <div>
      <div className="dist" role="group" aria-label="Afstand">
        {DISTANCES_KM.map((d) => (
          <button key={d} aria-pressed={value === d} onClick={() => { buzz(); onChange(d); }}>
            {kmLabel(d)}
            <span>km</span>
          </button>
        ))}
      </div>
      <button className="marathon" aria-pressed={value === MARATHON_KM} onClick={() => { buzz(); onChange(MARATHON_KM); }}>
        🏅 Hele marathon <span>42,195 km</span>
      </button>
      <div className={`custom${preset ? "" : " on"}`}>
        <div className="custom-head">
          <label htmlFor="km-range">Eigen afstand</label>
          <output htmlFor="km-range">
            <b>{kmLabel(value)}</b> km
          </output>
        </div>
        <input
          id="km-range"
          type="range"
          min={MIN}
          max={MAX}
          step={0.5}
          value={Math.min(value, MAX)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--p" as string]: `${pct}%` }}
          aria-label="Eigen afstand in kilometers"
        />
        <div className="custom-scale">
          <span>{MIN} km</span>
          <span>{MAX} km</span>
        </div>
      </div>
    </div>
  );
}

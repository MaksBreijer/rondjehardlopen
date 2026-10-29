import { CATEGORIES } from "@/lib/categories";
import type { Category, Prefs, StopMode, VisitMode } from "@/lib/types";
import Icon from "./Icon";
import { buzz } from "@/lib/client/haptics";
import { Art } from "./Art";

interface Props {
  category: Category | null;
  stopMode: StopMode;
  visit: VisitMode;
  prefs: Prefs;
  onCategory: (c: Category | null) => void;
  onStopMode: (m: StopMode) => void;
  onVisit: (v: VisitMode) => void;
  onPrefs: (p: Prefs) => void;
}

export default function DestinationPicker({ category, stopMode, visit, prefs, onCategory, onStopMode, onVisit, onPrefs }: Props) {
  return (
    <div>
      <div className="cats" role="group" aria-label="Bestemming">
        {CATEGORIES.map((c) => (
          <button key={c.id} className="cat" aria-pressed={category === c.id} onClick={() => { buzz(); onCategory(c.id); }}>
            <div className="art"><Art id={c.id} /></div>
            <div className="t">
              <b>{c.label}</b>
              <span>{c.blurb}</span>
            </div>
          </button>
        ))}
        <button className="cat" aria-pressed={category === null} onClick={() => { buzz(); onCategory(null); }}>
          <div className="art"><Art id="none" /></div>
          <div className="t">
            <b>Gewoon een rondje</b>
            <span>Zonder bestemming</span>
          </div>
        </button>
      </div>

      {category && (
        <div className="opts">
          <div>
            <label className="k">Waar komt de stop?</label>
            <div className="seg three">
              <button aria-pressed={stopMode === "midway"} onClick={() => onStopMode("midway")}>Onderweg</button>
              <button aria-pressed={stopMode === "turnaround"} onClick={() => onStopMode("turnaround")}>Keerpunt</button>
              <button aria-pressed={stopMode === "finish"} onClick={() => onStopMode("finish")}>Aan het eind</button>
            </div>
            <p className="hint">
              {stopMode === "midway"
                ? "Een rondje met de stop ergens op de route."
                : stopMode === "turnaround"
                  ? "De bestemming is het verste punt; de terugweg is een andere weg."
                  : "Eerst je kilometers, daarna beloon je jezelf: de stop ligt vlak bij je finish."}
            </p>
          </div>
          <div>
            <label className="k">Moet je er echt stoppen?</label>
            <div className="seg">
              <button aria-pressed={visit === "visit"} onClick={() => onVisit("visit")}>Ja, bezoeken</button>
              <button aria-pressed={visit === "pass"} onClick={() => onVisit("pass")}>Langs de route is prima</button>
            </div>
          </div>
        </div>
      )}

      <div className="opts">
        <div>
          <label className="k">Voorkeur</label>
          <div className="chips">
            <button className="chip" aria-pressed={prefs.green} onClick={() => onPrefs({ ...prefs, green: !prefs.green })}><Icon name="leaf" /> Groen</button>
            <button className="chip" aria-pressed={prefs.quiet} onClick={() => onPrefs({ ...prefs, quiet: !prefs.quiet })}><Icon name="moon" /> Rustig</button>
          </div>
        </div>
      </div>
    </div>
  );
}

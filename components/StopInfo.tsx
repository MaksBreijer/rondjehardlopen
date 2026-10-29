import Icon from "./Icon";
import { categoryInfo } from "@/lib/categories";
import { km } from "@/lib/format";
import type { RouteResult } from "@/lib/types";

export default function StopInfo({ route, hidden, onReveal }: { route: RouteResult; hidden: boolean; onReveal: () => void }) {
  const stop = route.stop;
  if (!stop) return null;
  const info = categoryInfo(stop.category);
  if (hidden) {
    return (
      <div className="stop">
        <b><Icon name="spark" /> Verrassingsbestemming</b>
        <div className="sub">Je ziet pas waar je uitkomt als je het wilt weten, na ca. {km(route.stopAtM ?? 0)}.</div>
        <div className="actions">
          <button className="btn small ghost" onClick={onReveal}>Onthul bestemming</button>
        </div>
      </div>
    );
  }
  return (
    <div className="stop">
      <b>
        <Icon name={info.icon} /> {stop.name}
      </b>
      {stop.sponsored && <span className="sponsored">Gesponsord</span>}
      <div className="sub">
        {stop.kind}
        {stop.address ? ` · ${stop.address}` : ""}
      </div>
      <div className="sub">
        {route.stopAtM !== undefined && <>Na ca. {km(route.stopAtM)} · </>}
        {route.stopOffsetM !== undefined && route.stopOffsetM > 40
          ? `ligt ${Math.round(route.stopOffsetM)} m van de route`
          : "ligt direct aan de route"}
      </div>
      <div className="sub">
        {stop.openingHours ? <>Openingstijden (OpenStreetMap): {stop.openingHours}</> : "Openingstijden: niet bekend in OpenStreetMap, check ter plekke."}
      </div>
      {stop.website && (
        <div className="sub">
          <a href={stop.website} target="_blank" rel="noopener noreferrer">Website</a>
          {stop.osmUrl && <> · <a href={stop.osmUrl} target="_blank" rel="noopener noreferrer">OpenStreetMap</a></>}
        </div>
      )}
      {!stop.website && stop.osmUrl && (
        <div className="sub">
          <a href={stop.osmUrl} target="_blank" rel="noopener noreferrer">Bekijk op OpenStreetMap</a>
        </div>
      )}
      {stop.offers.map((o) => (
        <div className="offer" key={o.id}>
          <b>{o.title}</b>
          <div>{o.description} (t/m {o.validUntil})</div>
        </div>
      ))}
    </div>
  );
}

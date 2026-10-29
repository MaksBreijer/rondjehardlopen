# Architectuur

## Keuzes

| Onderdeel | Keuze | Waarom |
| --- | --- | --- |
| Framework | Next.js 15 + TypeScript | Eén codebase voor UI en server-side API-routes; sleutels blijven op de server |
| Kaart | Leaflet + OSM-tegels (instelbaar) | Gratis, licht, geen sleutel |
| Routing (standaard) | Valhalla (OSM-demoserver) | Voetgangersprofiel, geen sleutel, ook `trace_attributes` voor routekenmerken |
| Routing (optioneel) | openrouteservice | Gratis sleutel, `foot-walking`, `green`/`quiet`-weging, waytype-info in dezelfde call |
| POI's | Overpass API (OSM) | Echte data, geen sleutel, openingstijden uit `opening_hours` |
| Adressen | Nominatim | Gratis, mits beleid gevolgd (1 req/s, User-Agent, geen type-ahead) |

Routing zit achter `Router` (`lib/providers/types.ts`): een nieuwe provider (GraphHopper, eigen server) is één bestand plus een regel in `lib/providers/index.ts`.

## Mappen

- `lib/generator.ts` - de routegenerator (vormen, oplossen op afstand, kiezen, beschrijven)
- `lib/geo.ts` - geometrie, overlap, vereenvoudigen
- `lib/overpass.ts`, `lib/geocode.ts` - externe data, server-side, met cache
- `lib/partners.ts` - lokale ondernemers (zie hieronder)
- `lib/gpx.ts` - GPX 1.1 export (client-side)
- `app/api/routes`, `app/api/geocode` - dunne API-laag met validatie en rate limiting
- `components/` - UI

## Lokale ondernemers (voorbereid, niet gebouwd)

Het datamodel staat in `lib/types.ts`: `Business` (naam, categorie, locatie, adres, openingstijden, `welcomesRunners`), `Offer` (titel, omschrijving, `validFrom`/`validUntil`) en `Promotion` (betaalde plaatsing met geldigheidsperiode). `PartnerStore` is de scheiding om later van `data/partners.json` naar een database te gaan.

Partners worden in `findPois` samengevoegd met OSM-resultaten. Regels die in code en tests vastliggen:

1. Partnerstatus beinvloedt de **ranking niet** (`rankStops` kent het veld `sponsored` niet; test `sponsored status never changes ranking`).
2. Een actieve betaalde promotie geeft alleen het label "Gesponsord" in de UI; actieve aanbiedingen worden alleen binnen hun geldigheidsperiode getoond.
3. Niet-betalende plekken en routes zonder bestemming blijven altijd beschikbaar.

Later: beheer-UI voor ondernemers, een "Aanbiedingen"-filter, en een aparte "Gesponsorde route"-kaart die altijd naast de gewone drie opties staat en nooit een plek daarvan inneemt.

## Verdienmodellen (mogelijk gemaakt, niet gebouwd)

- Gratis basis: wat er nu staat. Geen account.
- Premium: accounts + opgeslagen routes in een database (nu `localStorage`), extra voorkeuren (heuvels, verlichting, vaste tempo's), geschiedenis. De generatorinput (`RouteRequest`) is al een serialiseerbaar object.
- Gesponsord / samenwerking: `Business.promotion` + `Offer`.
- Affiliate: alleen waar een programma bestaat; plaats links in `StopInfo` met `rel="sponsored"` en een duidelijk label.

## Generatorkeuzes

- Vormen: driehoek zonder stop; `start → stop → via → start` (tussenstop); `start → A → stop → B → start` met A en B aan weerszijden (bestemming met andere terugweg).
- De vrije parameter (afstand van via-punt of zijwaartse offset) wordt eerst bepaald met bisectie op de hemelsbrede lengte, dan met de gemeten route bijgesteld (schalen, dan secant). Max 3 routeaanvragen per kandidaat, 4 tegelijk, totaalbudget 40 s.
- Selectiescore: `|afwijking|*100 + eigen overlap*40`, bij het kiezen van de volgende optie plus `overlap met gekozen routes*60`. Routes die >60% overlappen met een gekozen route worden overgeslagen.
- Parken/bossen zijn gebieden: het middelpunt is een "through"-punt in plaats van een harde stop.

# RondjeHardlopen.nl

Hardlopen met een bestemming. Kies je afstand (3 - 20 km), kies waar je zin in hebt (koffie, bakker, supermarkt, groen, verrassing) en de app berekent gesloten rondjes die thuis beginnen en eindigen, met die bestemming echt in de route.

Next.js 15 (App Router) + TypeScript + Leaflet. Geen account nodig.

## Starten

```bash
npm install
npm run dev        # http://localhost:3000
```

Het werkt zonder API-sleutels: routing via de gratis Valhalla-demoserver van OpenStreetMap, plaatsen via Overpass, adressen via Nominatim. Die publieke servers zijn **alleen voor beperkt gebruik** (zie "Naar productie").

Optioneel: kopieer `.env.example` naar `.env.local` en vul in wat je wilt gebruiken.

| Variabele | Nodig? | Doel |
| --- | --- | --- |
| `ORS_API_KEY` | nee | openrouteservice gebruiken (gratis sleutel op openrouteservice.org). Activeert ook de groen/rustig-weging van ORS. |
| `ROUTING_PROVIDER` | nee | `ors` of `valhalla` forceren |
| `VALHALLA_URL` / `ORS_URL` | nee | eigen routeserver |
| `OVERPASS_URLS` | nee | eigen/andere Overpass-servers |
| `NOMINATIM_USER_AGENT` | aanrader | verplicht door het Nominatim-beleid: zet je contactgegevens erin |
| `NEXT_PUBLIC_TILE_URL` | productie | kaarttegels van een provider (MapTiler, Stadia, ...) |

De ORS-koppeling is gebouwd volgens de API-documentatie maar **niet getest met een echte sleutel** in deze eerste versie; de Valhalla-koppeling is wel live getest.

## Starten, horloge en Strava

**Start** opent een live looprun-scherm op je telefoon: kaart met jouw positie, afstand, tijd, tempo, voortgang over de route en een waarschuwing als je meer dan 50 m van de lijn afwijkt. Het scherm blijft aan (Wake Lock) en na afloop sla je de opname op als GPX of upload je hem naar Strava. Zonder GPS (bijv. op desktop) kun je `?sim=1` aan de URL toevoegen voor een demo-run.

**Naar je horloge:** het GPX-bestand deel je via het deelmenu van je telefoon met Garmin Connect, Wahoo ELEMNT, COROS, Suunto of Polar Flow. Een website kan een horloge niet rechtstreeks starten of vullen; daarvoor bieden de fabrikanten partner-API's die goedkeuring nodig hebben:

- Garmin: Connect Developer Program (Courses API), alleen na goedkeuring als zakelijke partner.
- Wahoo: Cloud API, ook met partnergoedkeuring.
- Strava: de API kan geen geplande routes aanmaken, alleen voltooide activiteiten uploaden. Dat doet de app voor je opgenomen run (OAuth, scope `activity:write`). **Deze Strava-koppeling is gebouwd maar niet getest met echte Strava-sleutels.**

Stel `STRAVA_CLIENT_ID` en `STRAVA_CLIENT_SECRET` in (zie `.env.example`) om de Strava-knop te activeren.

Beperking: een browser-run neemt alleen op zolang het scherm aan en de pagina open is; voor echt lange runs is een horloge nauwkeuriger.

## Scripts

```bash
npm test                                   # unit tests (routeberekening, afwijking, tussenstops, GPX, validatie)
npm run typecheck
npx tsx scripts/live-check.mts coffee 10   # echte routing + Overpass, categorie en km; ook: none|bakery|supermarket|green|surprise
npm run build && npm start
```

## Hoe het werkt (kort)

1. Bestemmingen: Overpass-query (OpenStreetMap) in een bbox rond de start. Alleen plekken met naam; openingstijden alleen als OSM ze heeft.
2. Per kandidaat-stop een haalbaarheidscheck: de echte loopafstand start→stop moet binnen de helft van het rondje passen (voorkomt stops aan de overkant van het water).
3. Per stop twee varianten (links/rechts om). Waypoints worden zo geplaatst dat de rechte-lijn-lengte past bij de gewenste afstand, daarna wordt de echte route berekend en maximaal 2x bijgesteld (secant-methode) tot de afwijking onder ca. 4% is.
4. Uit alle kandidaten kiest de generator maximaal 3 routes met lage afwijking, weinig dubbel gelopen stukken (eigen overlap) en onderling weinig overlap.
5. Kenmerken (percentage autovrij, trappen) komen uit de routeservice, niet uit aannames.

Zie `ARCHITECTURE.md` voor structuur, lokale ondernemers en verdienmodel.

## Routekwaliteit

Per aanvraag rekent de generator tot ca. 10-20 complete rondjes door, controleert de beste 9 op wegtype (Valhalla `trace_attributes`: paden vs. drukke wegen, trappen) en kiest drie verschillende. Rondjes met veel drukke wegen (>20%) worden niet getoond zolang er rustigere zijn. Bij de keyless OSM-routeservers (FOSSGIS) betekent dat tientallen verzoeken per rondje: **die servers kunnen je IP tijdelijk blokkeren** (gebeurde tijdens het testen). Draai voor echt gebruik een eigen Valhalla of gebruik een ORS-sleutel. Valt Valhalla uit, dan schakelt de app automatisch over op OSRM-foot (zonder controle op drukke wegen, met een duidelijke waarschuwing).

## Bekende beperkingen

- Afwijking van 5% wordt gehaald "als het wegennet dat toelaat"; lukt dat niet dan staat er een waarschuwing. Routes met meer dan 20% afwijking worden nooit getoond.
- Of hardlopen is toegestaan wordt bepaald door het voetgangersprofiel van de routeservice (geen snelwegen, trappen vermeden). Tijdelijke afsluitingen of borden kent OSM niet altijd.
- "Rustig" en "groen" zijn voorkeuren in de routekosten, geen garantie. Met ORS worden de ORS-weging `green`/`quiet` gebruikt; met Valhalla stuurt de app op paden en woonstraten.
- Beoordelingen worden bewust niet getoond (OSM heeft ze niet); we verzinnen niets.
- "Start" opent Google/Apple Maps met een benadering (max. ca. 8 tussenpunten). Voor de exacte lijn: GPX.
- Rate limiting zit in het geheugen van één server; gebruik Redis/Upstash op serverless.

## Naar productie

- Eigen Valhalla (of ORS) en Overpass draaien, of een betaald plan nemen; de publieke demoservers staan commercieel gebruik niet toe.
- Tegelprovider instellen, Nominatim-beleid volgen (geen type-ahead; dit project zoekt pas bij versturen).

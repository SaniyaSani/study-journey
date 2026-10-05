# Design system — 電車で旅 · STATION SYSTEM

The whole site is wrapped in the design language of Japanese railway stations — departure
boards, platform guidance signage, route map boards and paper tickets / ticket machines. It is
a skin over the existing product: structure, content, features and navigation are unchanged.
It is _inspired by_ station signage; no operator logos, marks or official names are used.

## Materials

| Material        | Where                                                            | Look                                                                       |
| --------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Concourse       | page background                                                  | pale terrazzo `--st-concourse` with a faint tile grid                      |
| Departure board | hero board, timetable, focus timer, data sources, ride window    | charcoal `--st-board`, LED amber/white/green/red, dot-matrix `DotGothic16` |
| Platform sign   | header, section signs, page titles, next-station sign, sheets    | white `--st-sign`, black type, green `--st-green` band, arrows             |
| Route map board | featured routes, breadcrumbs, ride progress, station name boards | line colours `--line-*`, white station dots, current = red ring            |
| Paper ticket    | ticket preview, journey summary, notes, stamps                   | cream `--st-paper`, fibre texture, perforated stub, red stamp              |
| Ticket machine  | route selector, buttons, dock, study modes                       | grey console, inset screen, raised keys that press down                    |

## Component map

| Existing component       | Station form                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `SiteNav`                | platform guidance sign: station-name brand, numbered destination signs with arrows, green band                   |
| `Hero`                   | station information board: LED clock strip, mounted travel poster, ticket machine, promise rows, departure board |
| `RouteSelector`          | ticket machine (steps 1–3, keys) + issued-ticket preview of the choice                                           |
| `LiveTimetable`          | departure board: 時刻 / 種別 / 行先 / 番線 / 備考 columns, LED rows                                              |
| `EditorialSection`       | 路線図 sign, route map board of destinations, line information cards                                             |
| footer                   | service notices (お知らせ) + station information strip                                                           |
| Journal / About headers  | breadcrumb route line + station name board with neighbouring pages                                               |
| Panels                   | notice board (white), departure board (dark), paper (cream)                                                      |
| `JourneySummary`         | issued ticket with stub and 使用済 USED stamp                                                                    |
| Ride: header / ticker    | platform sign with line-colour band / yellow SERVICE INFO notice                                                 |
| Ride: `StationIndicator` | station name board (駅名標) with ◀ previous / next ▶ band + 次は NEXT sign                                       |
| Ride: `JourneyProgress`  | route line with station dots                                                                                     |
| Ride: dock / sheets      | ticket-machine keys / notice panels                                                                              |

## Primitives (`client/src/design/station.tsx`, styles in `station.css`)

`PlatformSign`, `StationNameBoard`, `DepartureBoard`, `RouteMap`, `TicketCard`, `StationChip`,
`LineBadge`, `TrackNumber`, `ServiceNotice`, `SignArrow`, plus helpers `serviceColor()` (board
colour per service type) and `stationNumbering()` — station numbers are only shown when the
data provides them (ODPT `stationCode`, GTFS `stop_code`) or for the fictional demo line; they
are never invented for real lines.

## Tokens (`client/src/design/tokens.css`)

`--st-*` station palette (board, LED, sign, green, concourse, paper), `--line-*` route colours,
`--f-sign` (Barlow), `--f-sign-cond` (Barlow Condensed), `--f-led` (DotGothic16),
`--f-heavy` (Zen Kaku Gothic New 900 for Japanese sign text). The previous `--c-*` tokens are
remapped onto the station palette so older component styles follow automatically.

Rules: rectangular, framed, mounted panels (2px radii; tickets 6px); tabular numbers; latin
labels compact and bold; Japanese large on signs; green is the main accent, line colours only
for differentiation; no glass, no soft gradients, no ultra-rounded shapes.

---

## Previous art direction (kept for the poster illustrations)

# Design system — 電車で旅

**Art direction:** a late-Showa / early-Heisei Japanese railway and city poster that became
interactive. Printed ink on photography. Primary reference: Tokyo street at blue hour.
UI organisation follows a classic travel-site structure (route search, timetable, route
cards), but never its bright tourism look.

## Tokens (`client/src/design/tokens.css`)

| Token                                                  | Value                   | Use                                             |
| ------------------------------------------------------ | ----------------------- | ----------------------------------------------- |
| `--c-petrol` / `--c-petrol-2`                          | #082D34 / #0B343A       | page & panels                                   |
| `--c-abyss`                                            | #071E22                 | deepest background, ink on mint                 |
| `--c-mint` / `--c-mint-2`                              | #D9F4D8 / #E3F2D8       | type, printed panels (no pure white)            |
| `--c-shoplight`                                        | #F2E5C4                 | warm lit windows, notes                         |
| `--c-signal`                                           | #FF5548                 | live dot, next station, train marker, selection |
| `--c-sunset`                                           | #E88C55                 | horizon, announcement captions                  |
| `--f-poster`                                           | Dela Gothic One         | enormous hero / page characters                 |
| `--f-heavy`                                            | Zen Kaku Gothic New 900 | station-sign headings                           |
| `--f-gothic`                                           | system Japanese gothic  | body                                            |
| `--f-mincho`                                           | Shippori Mincho         | editorial lines, vertical text                  |
| `--f-mono`                                             | IBM Plex Mono           | tracked latin labels, clocks                    |
| `--grain-opacity*`, `--halftone-opacity`, `--vignette` |                         | texture strength                                |
| `--dur-*`, `--ease-slow`                               |                         | slow, physical motion                           |

Rules: 1px mint rules; 2–3px radii (printed boards, not cards); latin labels small and
tracked; Japanese large; asymmetry is intentional; texture only on photo layers, never text.

## Components

`Hero`, `RouteSelector`, `LiveTimetable` (split-flap rows), `RouteCard` +
`EditorialSection`, `JourneyPlayer`, `JourneyProgress`, `StationIndicator`, `TrainStatus`,
`StudyMode`, `SoundControls`, `TunnelTransition`, plus `Label`, `Icon`, `RedDot` in
`design/ui.tsx`. Data logic lives in hooks (`usePlanner`, `useJourney`), never in
presentational components.

## Photography

The hero and route cards currently use **original illustrations** (`design/scenes/`) drawn
for this composition: the hero scene is split into a back layer (sky, city, train) and a
front layer (wires, poles, signal, shop) so the 電車で旅 characters sit _between_ them.

To use real photography in the hero, set (Vite env, e.g. `.env`):

```
VITE_HERO_PHOTO=/photos/hero-dusk.jpg
VITE_HERO_PHOTO_ALT=Railway crossing at dusk, Tokyo suburbs
VITE_HERO_PHOTO_CREDIT=Your Name / licence
```

and place the file in `client/public/photos/`. Only use photos you took or are licensed to
publish. Avoid recognisable shop or railway branding in hero photos (it implies
affiliation). The photo gets the same grade, halftone, grain and vignette automatically.

## Motion

Kanji drift ≤ 4px with scroll, parallax photo, grain shift (steps), signal light pulse,
distant train drift, window flicker, split-flap updates, CTA arrow nudge, tunnel transition.
All disabled with `prefers-reduced-motion`.

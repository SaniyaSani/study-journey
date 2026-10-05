# The 17:24 — Virtual Train Ride Japan

Choose a **real** Japanese railway line, a real departure, and "board" it. The ride follows
the real timetable (and live data when available); the window shows a recorded or
illustrated view; you can study while the landscape passes. Visually it is a late-Showa
railway / city poster that happens to be interactive.

> **Live train data · Recorded route view** — the site always says where each piece of
> information comes from. Window views are recordings (or an illustration), never a live
> camera. Generated announcements are labelled _Study Journey announcement_ and are not
> official railway announcements.

## Quick start

```bash
npm install
npm run dev          # API on :8787, site on http://localhost:5173
```

No API key is needed: the site starts with a clearly labelled **demo railway** (a fictional
line, 8 stations, both directions, a simulated delay and cancellation, route geometry and a
synchronised illustrated cab view).

Production on any Node host (Render, Railway, Fly.io, a VPS):

```bash
npm run build
npm start            # serves API + built site on :8787
```

**Cloudflare Workers** (API + site in one Worker): see [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
npx wrangler login
npm run cf:deploy
npx wrangler secret put ODPT_API_KEY   # optional, enables real ODPT data
```

Quality checks: `npm run check` (prettier, eslint, tsc, vitest, production build).
Design system & photography: [docs/DESIGN.md](docs/DESIGN.md).

## Pages

| Page               | What it does                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home (poster)      | Hero with oversized 電車で旅, illustrated/photographed Tokyo street at blue hour (sky follows the chosen departure's JST hour), **route selector** (line, departure, destination, TODAY/date, NOW/time, この列車に乗る), **live timetable board** (time, destination, type, number, operator, platform, live/scheduled/demo status), editorial route collage |
| Ride (ライブ)      | Window-first ride: recorded/illustrated view synchronised to the train, 現在地 / 次の駅, progress line with arrival, TRAIN / STATUS / DATA, captions, dock with **Study mode** (25 / 45 min, until next station, until destination), **Sound** (train only, train + announcements, rain, quiet), map, notes. Tunnel transition when boarding                 |
| Journal (旅の記録) | Route stamps, focus history, focus timer, tasks, notes                                                                                                                                                                                                                                                                                                       |
| About (について)   | What is live vs scheduled vs recorded, active data providers, credits                                                                                                                                                                                                                                                                                        |

## Architecture

```
client/src/
  design/              tokens.css, texture.css (grain/halftone/vignette), fonts, ui.tsx, scenes/
  site/                SiteNav, Hero, RouteSelector, LiveTimetable, EditorialSection/RouteCard,
                       HomePage, JournalPage, AboutPage, TunnelTransition
  features/japan/      planner/usePlanner (data), ride/ (useJourney, JourneyScreen, JourneyPlayer,
                       JourneyProgress, StationIndicator, TrainStatus, StudyMode, SoundControls,
                       JourneyMap, RouteView), players/, audio/, hooks/, summary/
  features/desk/       tasks, notes, focus timer (reused in Journal and the ride)
  store/               local-first study data (localStorage, versioned + migrations)
server/                Hono API — runs on Node and on Cloudflare Workers
  app.ts api.ts        platform-neutral app; /api/japan/* (zod validation, caching, errors)
  node.ts              Node entry (filesystem GTFS, .env, static files)
  worker.ts            Cloudflare Worker entry (static assets binding, secrets)
  providers/           RailwayProvider + ODPT, GTFS, GTFS-RT, Demo, NAVITIME/Ekispert stubs
  gtfs/                CSV + GTFS/GTFS-JP loader (feed.ts: zip/URL, feedNode.ts: filesystem)
  data/                demo feed (+ bundled module for Workers), media manifests
shared/                pure engines: time/calendar, journey, sync, announcements, geo
```

### Data flow and fallback

The browser never calls a railway service directly. It calls `/api/japan/*`; the server picks
the provider from the namespaced id (`demo:…`, `gtfs:…`, `odpt:…`).

Fallback priority: **live → timetable → cached (“Last updated …”) → demo/offline**.

- Live state is polled every **25 s** (60 s in background tabs) and cached on the server for 20 s.
- If live data stops or is older than 2 min, the journey continues on the timetable and the
  badge changes to _Timetable_ (or _Offline_ when the server is unreachable).
- Upstream calls use timeouts (8–10 s), retries with backoff and stale-cache fallback.
- Demo data is never shown as _Live_.

### Endpoints

```
GET /api/japan/status
GET /api/japan/operators
GET /api/japan/routes?operatorId=
GET /api/japan/routes/:routeId
GET /api/japan/routes/:routeId/stations
GET /api/japan/routes/:routeId/shape?direction=
GET /api/japan/routes/:routeId/media?origin=&destination=
GET /api/japan/departures?routeId=&origin=&destination=&date=&after=&includeInProgress=&limit=
GET /api/japan/trips/:tripId
GET /api/japan/trips/:tripId/realtime
GET /api/japan/service-alerts?routeId=
GET /api/japan/videos
```

Every response is `{ data, meta: { dataMode, source, fetchedAt, stale?, notice? } }`; errors are
`{ error: { code, message } }`.

## Configuration

Copy `.env.example` to `.env`. The important settings:

### ODPT API key

1. Register at the **Public Transportation Open Data Center developer site**:
   <https://developer.odpt.org/> and accept the terms of use.
2. Create an access token (consumer key). Some datasets — including several 2026 ones — are
   only available in the _Challenge_ environment or need separate approval; check the
   dataset page in the catalogue <https://ckan.odpt.org/>.
3. Put the key in `.env`:

   ```
   ODPT_API_KEY=your-consumer-key
   RAILWAY_PROVIDER=odpt
   # optional: only show some operators
   ODPT_OPERATORS=odpt.Operator:TokyoMetro,odpt.Operator:Toei
   ```

4. Restart the server. The console lists every provider and why it is enabled or disabled.

The ODPT provider reads `odpt:Operator`, `odpt:Railway`, `odpt:Station`,
`odpt:TrainTimetable` (per calendar: Weekday, Saturday/Holiday, …), `odpt:Train` (live
location and delay) and `odpt:TrainInformation` (service status). Datasets differ per
operator: railways without `odpt:TrainTimetable` are reported as _not supported_ instead of
being guessed. Operators that publish GTFS / GTFS-JP / GTFS-RT through ODPT can be used with
the GTFS provider below. See [docs/RAILWAY_DATA.md](docs/RAILWAY_DATA.md).

### GTFS / GTFS-JP feed

```
GTFS_LOCAL_PATH=./feeds/my-operator.zip      # or an unzipped directory
# or
GTFS_FEED_URL=https://…/feed.zip             # downloaded once, cached in .cache/
GTFS_RT_TRIP_UPDATES_URL=…                   # optional realtime
GTFS_RT_VEHICLE_POSITIONS_URL=…
GTFS_RT_ALERTS_URL=…
```

Supported files: `agency.txt`, `routes.txt`, `stops.txt` (parent stations), `trips.txt`,
`stop_times.txt` (times ≥ 24:00), `calendar.txt`, `calendar_dates.txt`, `shapes.txt`,
`translations.txt` (standard and legacy GTFS-JP styles), `agency_jp.txt`, `routes_jp.txt`.

### Demo mode

On by default (`ENABLE_DEMO_RAILWAY=true`). It is a fictional line and is labelled _Demo
railway data_ everywhere. Regenerate the feed with `npm run generate:demo`.
Preview a journey at another time with `?jt=<seconds>` (e.g. `/?jt=900#/japan`); realtime
polling is disabled while the preview clock is active and the header says so.

### Route videos

Route media lives in `server/data/media/manifests.json`. **Only add videos you may embed or
host.** Full guide: [docs/ROUTE_MEDIA.md](docs/ROUTE_MEDIA.md). Short version for the first
real route:

```json
{
  "routeId": "odpt:odpt.Railway:Example.Line",
  "operatorId": "odpt:odpt.Operator:Example",
  "direction": "odpt.RailDirection:Outbound",
  "originStationId": "odpt:odpt.Station:Example.Line.A",
  "destinationStationId": "odpt:odpt.Station:Example.Line.F",
  "video": {
    "provider": "youtube",
    "videoId": "VIDEO_ID",
    "title": "Cab view A → F",
    "creator": "Channel name",
    "sourceUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "licenseStatus": "platform-embed",
    "attributionRequired": true
  },
  "stationMarkers": [
    {
      "stationId": "odpt:odpt.Station:Example.Line.A",
      "videoTimeSeconds": 12,
      "departureFrameSeconds": 12
    },
    {
      "stationId": "odpt:odpt.Station:Example.Line.B",
      "videoTimeSeconds": 190,
      "arrivalFrameSeconds": 190,
      "departureFrameSeconds": 215
    }
  ]
}
```

Use the ids returned by `/api/japan/routes/:routeId/stations`. Missing station markers are
interpolated; journeys the markers do not cover use the illustrated view with an explanation.

### Real route footage (synchronised)

Real cab-view footage is chosen from a curated catalog (`server/data/videos/catalog.json`) and
synchronised station by station to the real timetable: the timetable is the clock, the video is
the picture. Join a train already en route and the footage starts where the train is now;
choose a later train and the ride waits with `DEPARTURE IN mm:ss`. Footage must be calibrated
(station timestamps measured) before it is used — with the development-only tool at
`#/admin/video-calibration`. Full guide: [docs/VIDEO_SYNC.md](docs/VIDEO_SYNC.md).

### Licensed announcements

By default announcements use the browser's speech synthesis. To use recorded clips you are
licensed to use, set `audio.announcementPackId` in the manifest and add
`media/announcements/<pack-id>/pack.json` (format in [docs/ROUTE_MEDIA.md](docs/ROUTE_MEDIA.md)).
Never use operator recordings or jingles without written permission.

### Commercial adapters (future)

`server/providers/commercialAdapters.ts` contains **disabled** NAVITIME API and Ekispert API
adapters. They do not call anything. To implement one: sign a contract, obtain the official
API documentation and credentials, put the key in `NAVITIME_API_KEY` / `EKISPERT_API_KEY`,
implement the `RailwayProvider` methods against the documented endpoints and register the
adapter in `server/providers/registry.ts`. Do not scrape their consumer websites.

## What is live and what is recorded

| Shown in the UI                                  | Source                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Departure/arrival times                          | Timetable (ODPT TrainTimetable / GTFS) — _Timetable_ badge                                                |
| Delays, position between stations, cancellations | Realtime feed (ODPT `odpt:Train`, GTFS-RT) — _Live_ badge, only while fresh                               |
| Route video                                      | A **recording** (YouTube / owned file) or an **illustration** — never live; synchronised to the timetable |
| Map geometry                                     | GTFS `shapes.txt`, otherwise _approximate_ through station coordinates                                    |
| Announcements                                    | Generated by Study Journey (or a licensed pack) — not official                                            |
| Demo line                                        | Fictional — _Demo_ badge                                                                                  |

## Licensing and attribution responsibilities

- **ODPT data**: follow the ODPT terms of use and each dataset's licence (many require
  attribution to the publishing operator and the ODPT Center). Do not redistribute raw data
  beyond what the licence allows.
- **Map**: OpenStreetMap data © OpenStreetMap contributors (ODbL), attribution is shown on the
  map. The public `tile.openstreetmap.org` servers are for light use only — for production
  use your own tiles or a provider via `VITE_MAP_STYLE_URL`.
- **YouTube**: embedded only through the official IFrame Player API, with YouTube's controls
  and branding visible; videos are never downloaded; only videos with embedding enabled
  work. Credit the creator (`title`, `creator`, `sourceUrl` are shown under the video).
- **Self-hosted videos / announcement packs**: only with ownership or explicit permission
  (`licenseStatus: owned | permission-granted`); the server rejects other self-hosted entries.
- **Railway branding**: do not use operator logos, recordings, jingles or trademarks without
  permission. The station boards and chime in this app are original designs.

## Tests

`npm test` covers service dates and post-midnight times, station order and direction,
departure matching, live→timetable fallback, delays and cancellations, video interpolation and
playback-rate control, announcement scheduling and de-duplication, ODPT / GTFS / GTFS-RT
normalisation, manifest validation, the unavailable-video fallback, data migration and an
integration test that rides a delayed demo train through all stations via the HTTP API.
`tests/videoSync.test.ts` covers station-based footage sync (start, exact station, halfway,
final station, joining late, intros, different segment lengths, missing markers, delays, dwell
alignment, multi-video joins, partial coverage), footage ranking, the journey clock (tab sleep,
simulation, pause), the real-footage correction thresholds and the calibration helpers.

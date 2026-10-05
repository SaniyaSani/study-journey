# Real route footage, synchronised to the real timetable

The timetable is the source of truth; video is only the picture. A train that leaves Tokyo at
17:24 is shown leaving Tokyo at 17:24 — whatever the video is doing. Buffering, a paused video or
a sleeping tab never move the train.

## How it fits together

```
server/data/videos/catalog.json   curated footage (never a live YouTube search)
        │  GET /api/japan/videos
        ▼
shared/videoMatcher.ts   findBestVideoForJourney(journey, catalog) → VideoPlan
        │                (line → direction → coverage → service type → time of day → season)
        ▼
shared/journeySync.ts    activeFootageAt(now, stops, segments)
        │                getVideoTimeForJourneyTime / getJourneyTimeForVideoTime
        ▼
shared/sync.ts           SyncController: deadband · gentle playback rate · seek (+ cooldown)
        ▼
client/…/video/TrainVideoPlayer.tsx   YouTube / self-hosted / illustrated, multi-segment
```

- `shared/journeyClock.ts` — journey time from absolute `Date.now()`: REAL TIME (default) or
  SIMULATION 1×/2×/4× with pause (development only).
- `client/src/features/japan/hooks/useVideoSync.ts` — applies the controller to the mounted
  player: observes every second, corrects every 5 s for real footage (1 s for the illustrated
  view), and immediately after a segment change, returning to the tab, or playback resuming.
- `client/src/features/japan/ride/FootageBand.tsx` — everything printed about the footage,
  placed **under** the player, never over a YouTube iframe.

## Station-based synchronisation

Never `journey % × video duration`. Each video has station markers (seconds into the video).
Between two stations we interpolate linearly:

```
Tokyo 17:24 ↔ 0:34    Shinagawa 17:32 ↔ 8:32
17:28 (halfway) → 34 + 0.5 × (512 − 34) = 273 s
```

- Intros/outros: the first marker is where the train starts; `videoStartSeconds` documents it.
- Dwell: if a marker has `arrivalTime` and `departureTime`, the video waits on the arrival frame
  and is aligned so it leaves the platform exactly at the timetable's departure.
- Missing marker: interpolated from the neighbouring markers by scheduled time.
- Delays: the effective (delayed) times are used, so a +4 min delay shifts the picture by 4 min.
- After the final station the last frame is held.

### Correction thresholds (real footage)

| drift     | action                                            |
| --------- | ------------------------------------------------- |
| < 1.5 s   | nothing                                           |
| 1.5 – 5 s | playback rate 0.95 – 1.05 until back within 0.5 s |
| > 5 s     | seek, then a 6 s cooldown (no seek storms)        |

Configured in `REAL_FOOTAGE_SYNC_CONFIG` (`shared/sync.ts`). YouTube players that only offer
coarse rates (0.75/1/1.25…) tolerate drift until the seek threshold. In simulation the base rate
is the simulation speed.

### Pausing, buffering, tabs

- Real-time mode: the viewer can pause the video, but the train keeps running. The band shows
  “Video paused — the train kept running” and **Back to the train** seeks straight to the
  current timetable position.
- Buffering is not a pause; when playback resumes the video snaps back into place.
- Returning to a hidden tab recomputes everything from absolute time and seeks once.
- Simulation only: PAUSE JOURNEY freezes the clock (and the video).
- All times are Japan time (Asia/Tokyo) regardless of the viewer's time zone.

## Choosing footage

`findBestVideoForJourney` only uses **calibrated** footage of the **same line**, in the
**journey's direction**. Ranking: exact line id (50) or line name (35), +20 direction, +4 per
covered stop, +25 whole journey, +10 same service type, +6/+2 for the same/adjacent time of day
(06–10 morning, 10–16 day, 16–19 sunset, 19–06 night), +1 season.

- Several recordings are joined at stations; the next one is cued in the background two
  minutes before the boundary and takes over on arrival (a short black cut).
- Partial coverage is labelled `VIDEO COVERAGE Tokyo → Yokohama`; the rest of the ride uses
  the illustrated view, clearly labelled.
- No footage: the journey UI runs normally; footage that exists but is not calibrated is
  offered only as an external “not synchronized” link.

## Labels

- `REAL ROUTE FOOTAGE · SYNCHRONIZED TO TODAY'S TIMETABLE` — real footage, real timetable, real clock.
- `RECORDED TRAIN VIEW · SYNCHRONIZED JOURNEY` — demo data, preview offset or simulation.
- `ILLUSTRATED VIEW · SYNCHRONIZED TO THE TIMETABLE` — the drawn cab view.
- LIVE is only ever said about train data from a real-time feed, never about footage.
- `+N MIN DELAY` only appears when the delay comes from real-time data.

## Sound

TRAIN SOUND over real footage is the footage's own audio (YouTube `unMute`). Videos start muted
(browser autoplay rules); **音をオン TURN SOUND ON** unmutes. The synthetic ambience is only used
for the illustrated view — the two are never layered.

## The catalog

`server/data/videos/catalog.json`, validated with zod on startup (`server/videos.ts`).

```jsonc
{
  "id": "yokosuka-tokyo-kurihama-sunset",
  "provider": "youtube", // youtube | self-hosted | illustrated
  "videoId": "IchVEzYptyI", // exactly as on YouTube — never invented
  "title": "…as published…",
  "creator": "Channel name",
  "sourceUrl": "https://www.youtube.com/watch?v=IchVEzYptyI",
  "licenseStatus": "platform-embed", // or permission-granted / owned for self-hosted
  "embedStatus": "unverified", // set to verified after checking it plays embedded
  "railwayOperator": "JR East",
  "lineIds": [], // namespaced route ids when known
  "lineNames": ["Yokosuka"],
  "direction": "outbound",
  "coverage": { "from": "Tokyo", "to": "Kurihama" },
  "serviceTypes": ["Local"],
  "videoStartSeconds": 0,
  "recordingPeriod": "sunset",
  "calibration": "needs-calibration", // calibrated once markers are measured
  "stationMarkers": [], // { stationName, stationId?, videoTime, arrivalTime?, departureTime? }
}
```

### Current entries

The eight real entries were found through a one-time manual search and recorded with the exact
video ids and titles shown by YouTube. **None is calibrated yet**, so none is used for a
synchronised ride; they appear only as “not synchronized” links. Channel names, embedding and
station timestamps must be checked by a person watching each video:

| Line                         | Direction              | Video id      |
| ---------------------------- | ---------------------- | ------------- |
| JR Yokosuka Line             | Tokyo → Kurihama       | `IchVEzYptyI` |
| JR Yokosuka Line             | Yokosuka → Tokyo       | `rBBPgu6a4ek` |
| JR Chūō Line (Special Rapid) | Tokyo → Takao          | `mzjNZW40EeA` |
| JR Chūō Line                 | Takao → Tokyo          | `4DzDCqG2Gdg` |
| JR Sagano Line               | Kyoto → Kameoka        | `la8lDdFpfsg` |
| JR Sagano Line               | Kameoka → Kyoto        | `HYKL9kG2cdE` |
| JR Itō / Izukyū Line         | Atami → Izukyū-Shimoda | `xMFXlcBfFSE` |
| JR Takayama Line (Hida 14)   | Toyama → Takayama      | `H3aiIcm_pBc` |

Nothing is downloaded or re-hosted; YouTube footage is embedded through the official IFrame API
with its controls and branding visible. If the owner disables embedding (errors 101/150) the
ride falls back automatically.

## Calibrating a video (development only)

`npm run dev`, then open `http://localhost:5173/#/admin/video-calibration`.

1. Paste the YouTube URL and **Load video**. Choose the line (and reverse order for inbound).
2. Play; at each station press **MARK STATION · ARRIVAL** when the train stops and
   **MARK DEPARTURE** when it moves (or **MARK PASSING** for stations it runs through). The
   station selector advances automatically. Fine-tune times in the table (`8:32`, `1:02:03.5`).
3. Enter timetable times for a few markers and press **Preview 1×/2×** — the video is driven by
   the same synchroniser as a ride; the inverse mapping shows which timetable moment the current
   frame corresponds to.
4. Fill in creator, recording period, embedding check. **Save local draft** lets you try it on a
   ride in development; **Copy/Download JSON** gives the catalog entry to commit.

The tool and the debug overlay are compiled out of production builds (`__DEV_TOOLS__`). To
enable them on a private staging build: `VITE_ENABLE_DEV_TOOLS=true npm run build`.

## Debugging a ride

Development builds: add `?debug=1` (or press Shift+D) on the ride page for JAPAN TIME, JOURNEY
ELAPSED, EXPECTED/ACTUAL VIDEO, DRIFT, CURRENT SEGMENT, PLAYBACK RATE and the simulation
controls (REAL TIME, SIM 1×/2×/4×, PAUSE JOURNEY, DEPARTURE −30 s). `?sim=4` starts a ride in
simulation; `?jt=<seconds>` shifts the real clock for previews.

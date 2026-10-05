# Route media: videos, station markers, announcements

All route media is described in `server/data/media/manifests.json` (path configurable with
`ROUTE_MEDIA_MANIFEST`). The server validates every entry at start-up and ignores invalid ones
with a warning (see `/api/japan/status → mediaWarnings`).

## 1. Choose footage you may use

| `video.provider` | Allowed `licenseStatus`                | Notes                                                                                                           |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `youtube`        | `platform-embed`, `permission-granted` | Embedded with the official IFrame Player API. Embedding must be enabled by the owner. Never download the video. |
| `self-hosted`    | `owned`, `permission-granted`          | MP4/WebM in `media/videos/…`, served at `/media/videos/…`. Keep the permission in writing.                      |
| `illustrated`    | `owned`, `demo`                        | The app's procedurally drawn cab view (no footage).                                                             |

Do **not** add videos found by searching without checking the rights. Railway-company footage
(JR etc.) needs the company's permission.

## 2. Find the ids

```bash
curl -s localhost:8787/api/japan/routes | jq '.data[] | {id, nameEn}'
curl -s "localhost:8787/api/japan/routes/<routeId-urlencoded>/stations" | jq '.data[] | {id, nameEn}'
```

## 3. Add station markers

For each station visible in the video, note (in seconds from the start of the video):

- `arrivalFrameSeconds` — when the train stops at the platform
- `departureFrameSeconds` — when it starts moving again
- `videoTimeSeconds` — a single reference time (used when the two above are omitted)

Markers must be in travel order with increasing times. Stations without a marker are
interpolated from their neighbours using the timetable. One manifest per direction.

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
    "title": "Example Line cab view A → F",
    "creator": "Channel name",
    "sourceUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "licenseStatus": "platform-embed",
    "attributionRequired": true
  },
  "stationMarkers": [
    {
      "stationId": "odpt:odpt.Station:Example.Line.A",
      "videoTimeSeconds": 12,
      "arrivalFrameSeconds": 0,
      "departureFrameSeconds": 12
    },
    {
      "stationId": "odpt:odpt.Station:Example.Line.B",
      "videoTimeSeconds": 190,
      "arrivalFrameSeconds": 190,
      "departureFrameSeconds": 215
    },
    { "stationId": "odpt:odpt.Station:Example.Line.F", "videoTimeSeconds": 1650 }
  ],
  "audio": { "announcementPackId": "tts-default" },
  "tags": { "season": "autumn", "dayPeriod": "evening", "weather": "clear" }
}
```

Tip: open the video, pause exactly when the doors close / the train stops, and read the time.
The synchronisation engine tolerates a few seconds of error.

## 4. How synchronisation works

`shared/sync.ts`:

1. Find the previous and next station of the current segment.
2. Take their (estimated) departure and arrival times.
3. Take the departure frame of the previous and the arrival frame of the next station.
4. Interpolate the desired video position by the train's progress in the segment.
5. Compare with the player:
   - drift < 3 s → nothing;
   - moderate drift → playback rate 0.92–1.08 until within 1 s;
   - > 15 s (8 s for players without fine rate control) → seek, at most every 8 s;
   - at stations the video waits at the platform frame and plays its recorded dwell so it
     leaves exactly when the real train departs.

If live data stops, progress continues on the timetable. If the video fails (removed,
embedding disabled, file missing), the illustrated view takes over with an explanation; the
map, station board and timer keep running.

## 5. Licensed announcement packs (optional)

Default: speech synthesis (`announcementPackId: "tts-default"` or omitted).
For recorded clips you are licensed to use:

```
media/announcements/my-pack/pack.json
media/announcements/my-pack/arrival-SK02-ja.mp3
```

```json
{
  "id": "my-pack",
  "license": "Recorded for this project by <voice actor>, licence agreement 2026-04-01",
  "attribution": "Voice: <name>",
  "clips": {
    "arrival:demo:SK02:ja": "arrival-SK02-ja.mp3",
    "approaching:*:en": "approaching-generic-en.mp3"
  }
}
```

Keys are `<kind>:<stationId>:<ja|en>` or `<kind>:*:<lang>`; kinds are `pre-departure`,
`departed`, `approaching`, `arrival`, `delay`, `cancelled`. Missing clips fall back to speech
synthesis. Captions are always shown.

## 6. Ambience

`audio.ambienceUrl` may point to a licensed loop (e.g. `/media/ambience/carriage.mp3`).
Without it, the app synthesises an original carriage ambience. Nothing plays until the user
presses _Enable sound_.

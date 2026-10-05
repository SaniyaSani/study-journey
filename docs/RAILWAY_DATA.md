# Railway data providers

All providers implement `RailwayProvider` (`server/providers/types.ts`) and return the
application-owned models in `shared/types.ts`. Ids are namespaced (`odpt:`, `gtfs:`, `demo:`).
Values missing from a source stay missing (no invented English names, coordinates or
positions).

## ODPT (`server/providers/odptProvider.ts`)

| App call          | ODPT request (v4)                                               | Cache |
| ----------------- | --------------------------------------------------------------- | ----- |
| operators         | `odpt:Operator` + `odpt:Railway` (only operators with railways) | 24 h  |
| routes            | `odpt:Railway` (`odpt:stationOrder`, colour, directions)        | 24 h  |
| stations          | `odpt:Station?odpt:railway=`                                    | 24 h  |
| departures / trip | `odpt:TrainTimetable?odpt:railway=&odpt:calendar=`              | 6 h   |
| realtime          | `odpt:Train?odpt:railway=` matched by train number + direction  | 25 s  |
| alerts            | `odpt:TrainInformation?odpt:railway=`                           | 60 s  |

- Calendar choice: Weekday / Saturday / Holiday / SaturdayHoliday / Sunday, using
  `shared/calendar.ts` (national holiday list — **update yearly**; GTFS feeds use their own
  `calendar_dates.txt` instead).
- ODPT times such as `00:15` after `23:58` are rolled over to the next calendar day.
- `odpt:Train` gives `fromStation` / `toStation`; the app treats this as "between A and B"
  and never converts it into GPS coordinates.
- Railways without `odpt:TrainTimetable` return an _unsupported_ error with a clear message.
- Challenge-only datasets: point `ODPT_API_BASE_URL` at the environment your key belongs to.
- Credentials: appended server-side as `acl:consumerKey`; redacted from all logs and errors.

## GTFS / GTFS-JP (`server/providers/gtfsProvider.ts`)

- Loads a directory, a zip, or a URL (cached in `.cache/gtfs-feed.zip` for offline restarts).
- Platforms (`location_type=0` with `parent_station`) are normalised to their station.
- Service dates follow GTFS: times are relative to the service date and may exceed 24:00.
- `translations.txt`: standard (`table_name`, `record_id`) and legacy GTFS-JP (`trans_id`).
- Realtime: optional GTFS-RT TripUpdates / VehiclePositions / Alerts (`gtfsRealtime.ts`).

## Demo (`server/providers/demoProvider.ts`)

A fictional GTFS-JP feed (`server/data/demo-gtfs`) plus a simulated realtime layer:
deterministic delays of 4 min from Matsukaze for some trains and occasional cancellations.
Everything carries `dataMode: "demo"`.

## Time handling

- Absolute ISO timestamps (`+09:00`) internally; formatting happens in the UI.
- Railway service day cut-off: 04:00 JST (an instant at 01:30 belongs to the previous day).
- The user's timezone is only used to show the converted local time.

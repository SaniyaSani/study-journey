/**
 * Generates the clearly-labelled DEMO GTFS-JP feed in server/data/demo-gtfs.
 * The line, operator and stations are fictional. Nothing here is real train data.
 *
 *   npm run generate:demo
 */
import fs from "node:fs";
import path from "node:path";
import { JAPANESE_HOLIDAYS } from "../shared/calendar";
import { formatRailwaySeconds, weekdayOf } from "../shared/time";
import {
  DEMO_STATIONS,
  DEMO_RUN_SECONDS,
  DEMO_DWELL_SECONDS,
} from "../server/providers/demoConstants";

const OUT = path.resolve(import.meta.dirname, "../server/data/demo-gtfs");
fs.mkdirSync(OUT, { recursive: true });

const csv = (rows: Array<Array<string | number>>) =>
  rows
    .map((r) =>
      r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(","),
    )
    .join("\n") + "\n";

const write = (name: string, rows: Array<Array<string | number>>) =>
  fs.writeFileSync(path.join(OUT, name), csv(rows));

write("agency.txt", [
  ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
  ["SJDEMO", "スタディジャーニー・デモ鉄道", "https://example.invalid/demo", "Asia/Tokyo", "ja"],
]);

write("routes.txt", [
  [
    "route_id",
    "agency_id",
    "route_short_name",
    "route_long_name",
    "route_type",
    "route_color",
    "route_text_color",
  ],
  ["SAKURA", "SJDEMO", "", "桜ヶ浦海岸線", 2, "2E7D5B", "FFFFFF"],
]);

const stops: Array<Array<string | number>> = [
  [
    "stop_id",
    "stop_name",
    "stop_lat",
    "stop_lon",
    "location_type",
    "parent_station",
    "platform_code",
  ],
];
for (const s of DEMO_STATIONS) {
  stops.push([s.id, s.nameJa, s.lat, s.lon, 1, "", ""]);
  stops.push([`${s.id}_1`, s.nameJa, s.lat, s.lon, 0, s.id, "1"]);
  stops.push([`${s.id}_2`, s.nameJa, s.lat, s.lon, 0, s.id, "2"]);
}
write("stops.txt", stops);

// English names via GTFS translations.txt (GTFS-JP v3 / standard GTFS style)
const translations: Array<Array<string | number>> = [
  ["table_name", "field_name", "language", "translation", "record_id", "field_value"],
  ["agency", "agency_name", "en", "Study Journey Demo Railway", "SJDEMO", ""],
  ["routes", "route_long_name", "en", "Sakuraura Coast Line (demo)", "SAKURA", ""],
];
for (const s of DEMO_STATIONS) {
  translations.push(["stops", "stop_name", "en", s.nameEn, s.id, ""]);
  translations.push(["stops", "stop_name", "en", s.nameEn, `${s.id}_1`, ""]);
  translations.push(["stops", "stop_name", "en", s.nameEn, `${s.id}_2`, ""]);
}
write("translations.txt", translations);

write("calendar.txt", [
  [
    "service_id",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "start_date",
    "end_date",
  ],
  ["WKD", 1, 1, 1, 1, 1, 0, 0, "20260101", "20271231"],
  ["WKE", 0, 0, 0, 0, 0, 1, 1, "20260101", "20271231"],
]);

const cd: Array<Array<string | number>> = [["service_id", "date", "exception_type"]];
for (const h of [...JAPANESE_HOLIDAYS].sort()) {
  const wd = weekdayOf(h);
  if (wd === 0 || wd === 6) continue;
  const compact = h.replace(/-/g, "");
  cd.push(["WKD", compact, 2]);
  cd.push(["WKE", compact, 1]);
}
write("calendar_dates.txt", cd);

// Shape: gently curving polyline through the stations
function curve(a: { lat: number; lon: number }, b: { lat: number; lon: number }, bend: number) {
  const pts: Array<[number, number]> = [];
  const mx = (a.lon + b.lon) / 2;
  const my = (a.lat + b.lat) / 2;
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const lon = (1 - t) ** 2 * a.lon + 2 * (1 - t) * t * cx + t * t * b.lon;
    const lat = (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * cy + t * t * b.lat;
    pts.push([Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
  }
  return pts;
}
const outbound: Array<[number, number]> = [];
DEMO_STATIONS.forEach((s, i) => {
  const n = DEMO_STATIONS[i + 1];
  if (n) outbound.push(...curve(s, n, i % 2 === 0 ? 0.18 : -0.14));
  else outbound.push([s.lat, s.lon]);
});
const shapes: Array<Array<string | number>> = [
  ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
];
outbound.forEach((p, i) => shapes.push(["SAKURA_OUT", p[0], p[1], i + 1]));
[...outbound].reverse().forEach((p, i) => shapes.push(["SAKURA_IN", p[0], p[1], i + 1]));
write("shapes.txt", shapes);

const trips: Array<Array<string | number>> = [
  [
    "route_id",
    "service_id",
    "trip_id",
    "trip_headsign",
    "direction_id",
    "shape_id",
    "trip_short_name",
  ],
];
const stopTimes: Array<Array<string | number>> = [
  ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
];

function addTrips(serviceId: string, first: number, last: number, headway: number) {
  let n = 0;
  for (let t = first; t <= last; t += headway) {
    for (const dir of [0, 1] as const) {
      n++;
      const seq = dir === 0 ? DEMO_STATIONS : [...DEMO_STATIONS].reverse();
      const runs = dir === 0 ? DEMO_RUN_SECONDS : [...DEMO_RUN_SECONDS].reverse();
      const hh = formatRailwaySeconds(t).slice(0, 5).replace(":", "");
      const tripId = `${serviceId}_${dir === 0 ? "D" : "U"}${hh}`;
      const terminal = seq[seq.length - 1];
      const trainNo = `${dir === 0 ? 1 : 2}${String(n).padStart(3, "0")}`;
      trips.push([
        "SAKURA",
        serviceId,
        tripId,
        terminal.nameJa,
        dir,
        dir === 0 ? "SAKURA_OUT" : "SAKURA_IN",
        trainNo,
      ]);
      let clock = t + (dir === 1 ? 600 : 0); // inbound runs offset by 10 minutes
      seq.forEach((s, i) => {
        const arr = clock;
        const dwell = i === 0 || i === seq.length - 1 ? 0 : DEMO_DWELL_SECONDS;
        const dep = arr + dwell;
        stopTimes.push([
          tripId,
          formatRailwaySeconds(arr),
          formatRailwaySeconds(dep),
          `${s.id}_${dir === 0 ? 1 : 2}`,
          i + 1,
        ]);
        clock = dep + (runs[i] ?? 0);
      });
    }
  }
}
addTrips("WKD", 5 * 3600 + 10 * 60, 24 * 3600 + 30 * 60, 20 * 60);
addTrips("WKE", 6 * 3600, 24 * 3600, 30 * 60);
write("trips.txt", trips);
write("stop_times.txt", stopTimes);

write("feed_info.txt", [
  [
    "feed_publisher_name",
    "feed_publisher_url",
    "feed_lang",
    "feed_start_date",
    "feed_end_date",
    "feed_version",
  ],
  [
    "Study Journey (DEMO DATA — fictional railway)",
    "https://example.invalid/demo",
    "ja",
    "20260101",
    "20271231",
    "demo-1",
  ],
]);

console.log(
  `Demo GTFS written to ${OUT}: ${trips.length - 1} trips, ${stopTimes.length - 1} stop times`,
);

// Bundle the feed as a module so it also works on Cloudflare Workers (no filesystem).
const bundle: Record<string, string> = {};
for (const f of fs
  .readdirSync(OUT)
  .filter((x) => x.endsWith(".txt"))
  .sort()) {
  bundle[f] = fs.readFileSync(path.join(OUT, f), "utf8");
}
fs.writeFileSync(
  path.resolve(import.meta.dirname, "../server/data/demoFeed.generated.ts"),
  `// GENERATED by scripts/generate-demo-gtfs.ts — fictional DEMO railway data. Do not edit.\nexport const DEMO_FEED_FILES: Record<string, string> = ${JSON.stringify(bundle)};\n`,
);

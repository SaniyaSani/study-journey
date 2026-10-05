import { describe, expect, it } from "vitest";
import { parseCsv } from "../server/gtfs/csv";
import { parseFeedFiles } from "../server/gtfs/feed";
import { GtfsProvider } from "../server/providers/gtfsProvider";
import {
  DemoProvider,
  demoConditionFor,
  DEMO_DELAY_SECONDS,
} from "../server/providers/demoProvider";
import { toMs } from "@shared/time";

describe("CSV parser", () => {
  it("handles BOM, quotes, escaped quotes and CRLF", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n');
    expect(rows).toEqual([{ a: "1", b: "x, y", c: 'he said "hi"' }]);
  });
});

/** Minimal GTFS-JP feed with legacy translations and a calendar exception. */
const files = {
  "agency.txt":
    "agency_id,agency_name,agency_url,agency_timezone\nA1,テスト鉄道,https://example.invalid,Asia/Tokyo\n",
  "routes.txt":
    "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A1,,テスト線,2\n",
  "stops.txt":
    "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nS1,東,35.1,139.1,1,\nS2,中,35.2,139.2,1,\nS3,西,,,1,\nS1p,東,35.1,139.1,0,S1\n",
  "trips.txt":
    "route_id,service_id,trip_id,trip_headsign,direction_id\nR1,WD,T1,西,0\nR1,WD,T2,東,1\nR1,WD,TN,西,0\n",
  "stop_times.txt": [
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
    "T1,08:00:00,08:00:00,S1p,1",
    "T1,08:10:00,08:11:00,S2,2",
    "T1,08:20:00,08:20:00,S3,3",
    "T2,09:00:00,09:00:00,S3,1",
    "T2,09:10:00,09:10:00,S2,2",
    "T2,09:20:00,09:20:00,S1,3",
    "TN,24:40:00,24:40:00,S1,1",
    "TN,24:50:00,24:50:00,S2,2",
    "TN,25:02:00,25:02:00,S3,3",
  ].join("\n"),
  "calendar.txt":
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,0,0,20260101,20271231\n",
  "calendar_dates.txt": "service_id,date,exception_type\nWD,20261012,2\n",
  "translations.txt":
    "trans_id,lang,translation\n東,en,Higashi\n中,en,Naka\nテスト線,en,Test Line\n",
};

function provider() {
  const p = new GtfsProvider("gtfs", "Test GTFS", () => parseFeedFiles(files));
  return p;
}

describe("GTFS provider normalisation", () => {
  it("reads operators, routes, parent stations and English translations", async () => {
    const p = provider();
    const [op] = await p.getOperators();
    expect(op).toMatchObject({ id: "gtfs:A1", nameJa: "テスト鉄道", nameEn: "テスト鉄道" }); // no translation → not invented
    const [route] = await p.getRoutes();
    expect(route.nameEn).toBe("Test Line");
    expect(route.stationIds).toEqual(["gtfs:S1", "gtfs:S2", "gtfs:S3"]);
    const stations = await p.getStations(route.id);
    expect(stations.map((s) => s.nameEn)).toEqual(["Higashi", "Naka", "西"]);
    expect(stations[2].latitude).toBeUndefined(); // missing coordinates stay missing
  });

  it("matches departures by direction and origin/destination order", async () => {
    const p = provider();
    const q = { routeId: "gtfs:R1", serviceDate: "2026-10-05" };
    const fwd = await p.getDepartures({
      ...q,
      originStationId: "gtfs:S1",
      destinationStationId: "gtfs:S3",
    });
    expect(fwd.map((d) => d.tripId)).toEqual(["gtfs:T1@2026-10-05", "gtfs:TN@2026-10-05"]);
    const back = await p.getDepartures({
      ...q,
      originStationId: "gtfs:S3",
      destinationStationId: "gtfs:S1",
    });
    expect(back.map((d) => d.tripId)).toEqual(["gtfs:T2@2026-10-05"]);
    expect(back[0].dataMode).toBe("timetable");
  });

  it("handles trips after midnight (24:40 → next calendar day)", async () => {
    const p = provider();
    const trip = await p.getTrip("gtfs:TN@2026-10-05");
    expect(trip.stops[2].scheduledArrival).toBe("2026-10-06T01:02:00+09:00");
    // at 00:45 JST on Oct 6 this train is still found via the previous service date
    const deps = await p.getDepartures({
      routeId: "gtfs:R1",
      originStationId: "gtfs:S1",
      destinationStationId: "gtfs:S3",
      after: "2026-10-06T00:30:00+09:00",
      includeInProgress: true,
    });
    expect(deps[0].tripId).toBe("gtfs:TN@2026-10-05");
  });

  it("applies calendar_dates exceptions (no weekday service on a holiday)", async () => {
    const p = provider();
    const deps = await p.getDepartures({
      routeId: "gtfs:R1",
      originStationId: "gtfs:S1",
      destinationStationId: "gtfs:S3",
      serviceDate: "2026-10-12",
    });
    expect(deps).toEqual([]);
    expect(p.isServiceActive("WD", "2026-10-10")).toBe(false); // Saturday
  });

  it("builds an approximate shape from station coordinates when shapes.txt is absent", async () => {
    const shape = await provider().getRouteShape("gtfs:R1");
    expect(shape?.approximate).toBe(true);
    expect(shape?.coordinates).toHaveLength(2);
  });
});

describe("Demo provider", () => {
  const clock = { now: Date.parse("2026-10-05T21:20:00+09:00") };
  const demo = new DemoProvider(() => clock.now);

  it("labels everything as demo data and provides both directions", async () => {
    const [route] = await demo.getRoutes();
    expect(route.stationIds).toHaveLength(8);
    expect(route.directions).toHaveLength(2);
    const out = await demo.getDepartures({
      routeId: route.id,
      originStationId: "demo:SK01",
      destinationStationId: "demo:SK08",
      serviceDate: "2026-10-05",
      limit: 100,
    });
    const back = await demo.getDepartures({
      routeId: route.id,
      originStationId: "demo:SK08",
      destinationStationId: "demo:SK01",
      serviceDate: "2026-10-05",
      limit: 100,
    });
    expect(out.length).toBeGreaterThan(3);
    expect(back.length).toBeGreaterThan(3);
    expect(out.every((d) => d.dataMode === "demo")).toBe(true);
    expect(out.some((d) => d.cancelled)).toBe(true);
    expect(out.some((d) => (d.delaySeconds ?? 0) === DEMO_DELAY_SECONDS)).toBe(true);
    const shape = await demo.getRouteShape(route.id, "0");
    expect(shape?.approximate).toBe(false);
  });

  it("simulates a station-level position without fabricated coordinates", async () => {
    const deps = await demo.getDepartures({
      routeId: "demo:SAKURA",
      originStationId: "demo:SK01",
      destinationStationId: "demo:SK08",
      serviceDate: "2026-10-05",
      limit: 100,
    });
    const d = deps.find(
      (x) =>
        !x.cancelled &&
        toMs(x.scheduledDeparture) < clock.now &&
        toMs(x.scheduledArrival) > clock.now,
    )!;
    const rt = (await demo.getRealtimeTrip(d.tripId))!;
    expect(rt.dataMode).toBe("demo");
    expect(rt.latitude).toBeUndefined();
    expect(rt.previousStationId).toMatch(/^demo:SK0/);
  });

  it("assigns deterministic conditions", () => {
    expect(demoConditionFor("demo:WKD_D1650@2026-10-05")).toBe(
      demoConditionFor("demo:WKD_D1650@2027-01-01"),
    );
  });
});

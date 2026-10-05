import { describe, expect, it } from "vitest";
import {
  normalizeRailway,
  normalizeStation,
  normalizeTrain,
  normalizeTrainTimetable,
  OdptProvider,
  type OdptRailwayRaw,
  type OdptTrainTimetableRaw,
} from "../server/providers/odptProvider";

const railway: OdptRailwayRaw = {
  "owl:sameAs": "odpt.Railway:Example.Line",
  "dc:title": "例線",
  "odpt:railwayTitle": { ja: "例線", en: "Example Line" },
  "odpt:operator": "odpt.Operator:Example",
  "odpt:color": "#F15A22",
  "odpt:ascendingRailDirection": "odpt.RailDirection:Outbound",
  "odpt:descendingRailDirection": "odpt.RailDirection:Inbound",
  "odpt:stationOrder": [
    {
      "odpt:index": 2,
      "odpt:station": "odpt.Station:Example.Line.B",
      "odpt:stationTitle": { ja: "乙", en: "B" },
    },
    {
      "odpt:index": 1,
      "odpt:station": "odpt.Station:Example.Line.A",
      "odpt:stationTitle": { ja: "甲", en: "A" },
    },
    {
      "odpt:index": 3,
      "odpt:station": "odpt.Station:Example.Line.C",
      "odpt:stationTitle": { ja: "丙", en: "C" },
    },
  ],
};

const timetable: OdptTrainTimetableRaw = {
  "owl:sameAs": "odpt.TrainTimetable:Example.Line.2301.Weekday",
  "odpt:railway": "odpt.Railway:Example.Line",
  "odpt:operator": "odpt.Operator:Example",
  "odpt:trainNumber": "2301",
  "odpt:trainType": "odpt.TrainType:Example.Local",
  "odpt:railDirection": "odpt.RailDirection:Outbound",
  "odpt:calendar": "odpt.Calendar:Weekday",
  "odpt:trainTimetableObject": [
    { "odpt:departureTime": "23:55", "odpt:departureStation": "odpt.Station:Example.Line.A" },
    { "odpt:arrivalTime": "23:59", "odpt:arrivalStation": "odpt.Station:Example.Line.B" },
    { "odpt:departureTime": "00:00", "odpt:departureStation": "odpt.Station:Example.Line.B" },
    { "odpt:arrivalTime": "00:06", "odpt:arrivalStation": "odpt.Station:Example.Line.C" },
  ],
};

describe("ODPT normalisation", () => {
  it("orders stations by odpt:index and keeps bilingual titles", () => {
    const r = normalizeRailway(railway);
    expect(r.id).toBe("odpt:odpt.Railway:Example.Line");
    expect(r.nameEn).toBe("Example Line");
    expect(r.stationIds.map((s) => s.split(".").pop())).toEqual(["A", "B", "C"]);
    expect(r.directions?.map((d) => d.id)).toEqual([
      "odpt.RailDirection:Outbound",
      "odpt.RailDirection:Inbound",
    ]);
  });

  it("never invents missing English names or coordinates", () => {
    const s = normalizeStation({ "owl:sameAs": "odpt.Station:X.Y.Z", "dc:title": "某駅" });
    expect(s.nameEn).toBe("某駅");
    expect(s.latitude).toBeUndefined();
  });

  it("merges arrival/departure objects and rolls over midnight", () => {
    const t = normalizeTrainTimetable(timetable, "2026-10-05");
    expect(t.id).toBe("odpt:odpt.TrainTimetable:Example.Line.2301.Weekday@2026-10-05");
    expect(t.stops).toHaveLength(3);
    expect(t.stops[1].scheduledArrival).toBe("2026-10-05T23:59:00+09:00");
    expect(t.stops[1].scheduledDeparture).toBe("2026-10-06T00:00:00+09:00");
    expect(t.stops[2].scheduledArrival).toBe("2026-10-06T00:06:00+09:00");
  });

  it("normalises odpt:Train as 'between stations' without coordinates", () => {
    const now = Date.parse("2026-10-05T23:57:00+09:00");
    const rt = normalizeTrain(
      {
        "odpt:railway": "odpt.Railway:Example.Line",
        "odpt:fromStation": "odpt.Station:Example.Line.A",
        "odpt:toStation": "odpt.Station:Example.Line.B",
        "odpt:delay": 120,
        "dc:date": "2026-10-05T23:56:40+09:00",
        "dct:valid": "2026-10-05T23:58:10+09:00",
      },
      "trip",
      now,
    )!;
    expect(rt).toMatchObject({
      previousStationId: "odpt:odpt.Station:Example.Line.A",
      nextStationId: "odpt:odpt.Station:Example.Line.B",
      delaySeconds: 120,
      dataMode: "live",
    });
    expect(rt.latitude).toBeUndefined();
    expect(rt.progressBetweenStations).toBeUndefined();
  });
});

describe("OdptProvider", () => {
  const KEY = "secret-test-key";
  const make = (handler: (url: URL) => unknown) => {
    const calls: string[] = [];
    const p = new OdptProvider({
      apiKey: KEY,
      baseUrl: "https://api.odpt.org/api/v4",
      enabled: true,
      fetchJson: async (u) => {
        calls.push(u);
        return handler(new URL(u.replace("odpt:", "odpt%3A")));
      },
    });
    return { p, calls };
  };

  it("is disabled without an API key", () => {
    const p = new OdptProvider({ baseUrl: "x", enabled: true });
    expect(p.isEnabled()).toBe(false);
    expect(p.disabledReason()).toMatch(/ODPT_API_KEY/);
  });

  it("loads departures through the calendar matching the service date, overlaying live delay", async () => {
    const { p, calls } = make((u) => {
      const path = decodeURIComponent(u.pathname);
      if (path.endsWith("odpt:Railway")) return [railway];
      if (path.endsWith("odpt:Station")) return [];
      if (path.endsWith("odpt:TrainTimetable"))
        return u.searchParams.get("odpt:calendar") === "odpt.Calendar:Weekday" ? [timetable] : [];
      if (path.endsWith("odpt:Train"))
        return [
          {
            "odpt:railway": railway["owl:sameAs"],
            "odpt:trainNumber": "2301",
            "odpt:railDirection": "odpt.RailDirection:Outbound",
            "odpt:delay": 60,
          },
        ];
      return [];
    });
    const deps = await p.getDepartures({
      routeId: "odpt:odpt.Railway:Example.Line",
      originStationId: "odpt:odpt.Station:Example.Line.A",
      destinationStationId: "odpt:odpt.Station:Example.Line.C",
      serviceDate: "2026-10-05",
    });
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({
      dataMode: "live",
      delaySeconds: 60,
      scheduledArrival: "2026-10-06T00:06:00+09:00",
    });
    expect(calls.every((c) => c.includes("acl:consumerKey="))).toBe(true);
  });

  it("reports railways without train timetables as unsupported, and never leaks the key", async () => {
    const { p } = make(() => []);
    await expect(
      p.getDepartures({
        routeId: "odpt:R",
        originStationId: "odpt:A",
        destinationStationId: "odpt:B",
        serviceDate: "2026-10-05",
      }),
    ).rejects.toThrow(/does not publish train timetables/);

    const failing = new OdptProvider({
      apiKey: KEY,
      baseUrl: "https://api.odpt.org/api/v4",
      enabled: true,
      fetchJson: async (u) => {
        throw new Error(`boom at ${u}`);
      },
    });
    const err = await failing.getOperators().catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain(KEY);
    expect(String((err as Error).message)).toContain("***");
  });
});

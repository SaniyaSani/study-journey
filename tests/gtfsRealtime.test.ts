import { describe, expect, it } from "vitest";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
  decodeFeed,
  summariseAlerts,
  summariseTripUpdates,
  summariseVehicles,
} from "../server/providers/gtfsRealtime";

const { transit_realtime: tr } = GtfsRealtimeBindings;

function encode(entities: object[]) {
  const msg = tr.FeedMessage.fromObject({
    header: { gtfsRealtimeVersion: "2.0", timestamp: 1_791_000_000 },
    entity: entities,
  });
  return tr.FeedMessage.encode(msg).finish();
}

describe("GTFS-Realtime decoding", () => {
  it("summarises trip updates with per-stop delays and cancellations", () => {
    const feed = decodeFeed(
      encode([
        {
          id: "1",
          tripUpdate: {
            trip: { tripId: "T1", startDate: "20261005" },
            stopTimeUpdate: [
              { stopId: "S2", arrival: { delay: 120 } },
              { stopId: "S3", departure: { delay: 180 } },
            ],
          },
        },
        { id: "2", tripUpdate: { trip: { tripId: "T2", scheduleRelationship: 3 } } },
      ]),
    );
    const m = summariseTripUpdates(feed);
    expect(m.get("T1|20261005")?.stopDelays).toEqual({ S2: 120, S3: 180 });
    expect(m.get("T1")?.delaySeconds).toBe(120);
    expect(m.get("T2")?.cancelled).toBe(true);
  });

  it("summarises vehicle positions and alerts", () => {
    const feed = decodeFeed(
      encode([
        {
          id: "v",
          vehicle: {
            trip: { tripId: "T1" },
            stopId: "S2",
            currentStatus: 2,
            position: { latitude: 35.6, longitude: 139.7 },
          },
        },
        {
          id: "a",
          alert: {
            informedEntity: [{ routeId: "R1" }],
            severityLevel: 3,
            headerText: {
              translation: [
                { text: "遅延", language: "ja" },
                { text: "Delay", language: "en" },
              ],
            },
          },
        },
      ]),
    );
    expect(summariseVehicles(feed).get("T1")).toMatchObject({
      stopId: "S2",
      status: "IN_TRANSIT_TO",
    });
    expect(summariseAlerts(feed)[0]).toMatchObject({
      routeIds: ["R1"],
      severity: "warning",
      headerJa: "遅延",
      headerEn: "Delay",
    });
  });
});

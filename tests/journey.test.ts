import { describe, expect, it } from "vitest";
import {
  applyRealtime,
  buildTimeline,
  computeProgress,
  isRealtimeFresh,
  JourneyError,
  resolveJourneyStatus,
  stationsPassed,
} from "@shared/journey";
import type { RealtimeTripState } from "@shared/types";
import { at, makeTrip } from "./helpers";

const trip = makeTrip();

describe("journey timeline", () => {
  it("keeps station order between origin and destination", () => {
    const tl = buildTimeline(trip, "x:B", "x:D");
    expect(tl.stops.map((s) => s.stationId)).toEqual(["x:B", "x:C", "x:D"]);
    expect(tl.stops[0].index).toBe(0);
  });

  it("rejects the opposite direction and unknown stations", () => {
    expect(() => buildTimeline(trip, "x:C", "x:A")).toThrowError(JourneyError);
    try {
      buildTimeline(trip, "x:C", "x:A");
    } catch (e) {
      expect((e as JourneyError).code).toBe("WRONG_DIRECTION");
    }
    expect(() => buildTimeline(trip, "x:Z", "x:D")).toThrow(/origin/);
  });

  it("computes phases through the journey on the timetable", () => {
    const tl = buildTimeline(trip, "x:A", "x:D");
    expect(computeProgress(tl, at("18:11:00")).phase).toBe("before-departure");
    const run = computeProgress(tl, at("18:14:30"));
    expect(run.phase).toBe("running");
    expect(run.currentIndex).toBe(0);
    expect(run.nextIndex).toBe(1);
    expect(run.segmentFraction).toBeCloseTo(0.5, 2);
    const dwell = computeProgress(tl, at("18:17:10"));
    expect(dwell.phase).toBe("dwelling");
    expect(dwell.currentIndex).toBe(1);
    const done = computeProgress(tl, at("18:30:00"));
    expect(done.phase).toBe("arrived");
    expect(stationsPassed(done)).toBe(4);
    expect(done.remainingSeconds).toBe(0);
  });

  it("applies a realtime delay to stops not yet passed", () => {
    const tl = buildTimeline(trip, "x:A", "x:D");
    const rt: RealtimeTripState = {
      tripId: trip.id,
      timestamp: new Date(at("18:20:00")).toISOString(),
      previousStationId: "x:B",
      nextStationId: "x:C",
      delaySeconds: 180,
      dataMode: "live",
    };
    const delayed = applyRealtime(tl, rt);
    expect(delayed.delaySeconds).toBe(180);
    expect(delayed.stops[0].estimatedDeparture).toBe(tl.stops[0].scheduledDeparture); // history kept
    expect(delayed.stops[3].estimatedArrival - tl.stops[3].scheduledArrival).toBe(180_000);
    const p = computeProgress(delayed, at("18:20:00"), rt);
    expect(p.source).toBe("realtime");
    expect(p.phase).toBe("running");
    expect(p.positionApproximate).toBe(true); // only "between B and C" is known
    expect(p.remainingSeconds).toBeCloseTo(17 * 60 + 180 - 8 * 60, 0);
  });

  it("marks cancellations", () => {
    const tl = applyRealtime(buildTimeline(trip, "x:A", "x:D"), {
      tripId: trip.id,
      timestamp: new Date().toISOString(),
      cancelled: true,
      dataMode: "live",
    });
    expect(computeProgress(tl, at("18:15:00")).phase).toBe("cancelled");
    expect(
      resolveJourneyStatus({
        tripDataMode: "timetable",
        realtime: null,
        now: 0,
        offline: false,
        cancelled: true,
      }).status,
    ).toBe("cancelled");
  });

  it("falls back from live to timetable when realtime data goes stale", () => {
    const now = at("18:20:00");
    const rt: RealtimeTripState = {
      tripId: trip.id,
      timestamp: new Date(now - 30_000).toISOString(),
      dataMode: "live",
    };
    expect(
      resolveJourneyStatus({ tripDataMode: "timetable", realtime: rt, now, offline: false }).status,
    ).toBe("live");
    const later = now + 10 * 60_000;
    expect(isRealtimeFresh(rt, later)).toBe(false);
    expect(
      resolveJourneyStatus({ tripDataMode: "timetable", realtime: rt, now: later, offline: false })
        .status,
    ).toBe("timetable");
    expect(
      resolveJourneyStatus({ tripDataMode: "timetable", realtime: rt, now: later, offline: true })
        .status,
    ).toBe("offline");
  });

  it("reports delays and never upgrades demo data to live", () => {
    const now = at("18:20:00");
    const rt: RealtimeTripState = {
      tripId: trip.id,
      timestamp: new Date(now).toISOString(),
      dataMode: "live",
    };
    expect(
      resolveJourneyStatus({
        tripDataMode: "timetable",
        realtime: rt,
        now,
        offline: false,
        delaySeconds: 240,
      }).status,
    ).toBe("delayed");
    const demo = resolveJourneyStatus({ tripDataMode: "demo", realtime: rt, now, offline: false });
    expect(demo.status).toBe("demo");
    expect(demo.dataMode).toBe("demo");
  });

  it("ignores realtime positions outside the chosen journey", () => {
    const tl = buildTimeline(trip, "x:C", "x:D");
    const rt: RealtimeTripState = {
      tripId: trip.id,
      timestamp: new Date().toISOString(),
      previousStationId: "x:A",
      nextStationId: "x:B",
      dataMode: "live",
    };
    expect(computeProgress(tl, at("18:14:00"), rt).phase).toBe("before-departure");
  });
});

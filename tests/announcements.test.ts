import { describe, expect, it } from "vitest";
import { applyRealtime, buildTimeline } from "@shared/journey";
import {
  announcementTexts,
  buildAnnouncementEvents,
  dueAnnouncements,
  missedAnnouncements,
  statusChangeEvent,
} from "@shared/announcements";
import type { Station } from "@shared/types";
import { at, makeTrip } from "./helpers";

const stations = new Map<string, Station>(
  [
    ["x:A", "東京", "Tokyo"],
    ["x:B", "新宿", "Shinjuku"],
    ["x:C", "中野", "Nakano"],
    ["x:D", "三鷹", "Mitaka"],
  ].map(([id, ja, en]) => [id, { id, nameJa: ja, nameEn: en }]),
);
const trip = makeTrip();
const tl = buildTimeline(trip, "x:A", "x:D");

describe("announcement scheduling", () => {
  const events = buildAnnouncementEvents(tl, stations);

  it("creates departure, approaching and arrival events in time order", () => {
    const kinds = events.map((e) => `${e.kind}:${e.stationId}`);
    expect(kinds[0]).toBe("pre-departure:x:A");
    expect(kinds).toContain("departed:x:A");
    expect(kinds).toContain("approaching:x:B");
    expect(kinds).toContain("arrival:x:D");
    expect([...events].sort((a, b) => a.at - b.at)).toEqual(events);
    const pre = events[0];
    expect(tl.stops[0].estimatedDeparture - pre.at).toBe(60_000);
    const approachingB = events.find((e) => e.id.endsWith("x:B:approaching"))!;
    expect(tl.stops[1].estimatedArrival - approachingB.at).toBeGreaterThanOrEqual(45_000);
    expect(tl.stops[1].estimatedArrival - approachingB.at).toBeLessThanOrEqual(60_000);
  });

  it("uses the Japanese and English templates", () => {
    const pre = events[0];
    expect(pre.textJa).toBe("まもなく、東京を発車いたします。次は、新宿です。");
    const appr = events.find((e) => e.kind === "approaching" && e.stationId === "x:B")!;
    expect(appr.textJa).toBe("まもなく、新宿です。お忘れ物のないようご注意ください。");
    expect(appr.textEn).toContain("We will soon arrive at Shinjuku.");
    expect(announcementTexts(pre, "ja-en").map((p) => p.lang)).toEqual(["ja-JP", "en-US"]);
    expect(announcementTexts(pre, "off")).toEqual([]);
  });

  it("deduplicates played events and skips missed backlog", () => {
    const played = new Set<string>();
    const now = events[0].at + 2000;
    const due = dueAnnouncements(events, now, played);
    expect(due.map((e) => e.kind)).toEqual(["pre-departure"]);
    due.forEach((e) => played.add(e.id));
    expect(dueAnnouncements(events, now + 1000, played)).toEqual([]);
    // rebuilding after a re-render yields identical ids → still deduplicated
    const rebuilt = buildAnnouncementEvents(tl, stations);
    expect(dueAnnouncements(rebuilt, now + 1000, played)).toEqual([]);
    // joining late: older events are reported as missed, not replayed
    const late = at("18:25:00");
    expect(dueAnnouncements(events, late, played).length).toBe(0);
    expect(missedAnnouncements(events, late, played).length).toBeGreaterThan(2);
  });

  it("announces meaningful delays once per delay value, and cancellations", () => {
    const delayed = applyRealtime(tl, {
      tripId: trip.id,
      timestamp: "",
      delaySeconds: 240,
      dataMode: "live",
    });
    const ev = statusChangeEvent(delayed, 0)!;
    expect(ev.kind).toBe("delay");
    expect(ev.textEn).toBe("This train is currently delayed by approximately 4 minutes.");
    expect(ev.id).toBe(statusChangeEvent(delayed, 999)!.id);
    expect(
      statusChangeEvent(
        applyRealtime(tl, { tripId: trip.id, timestamp: "", delaySeconds: 60, dataMode: "live" }),
        0,
      ),
    ).toBeNull();
    const cancelled = applyRealtime(tl, {
      tripId: trip.id,
      timestamp: "",
      cancelled: true,
      dataMode: "live",
    });
    expect(statusChangeEvent(cancelled, 0)!.kind).toBe("cancelled");
  });
});

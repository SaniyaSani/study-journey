import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { MediaLibrary } from "../server/media";
import { ProviderRegistry } from "../server/providers/registry";
import { DemoProvider } from "../server/providers/demoProvider";
import { OdptProvider } from "../server/providers/odptProvider";
import {
  applyRealtime,
  buildTimeline,
  computeProgress,
  resolveJourneyStatus,
} from "@shared/journey";
import { buildAnnouncementEvents, dueAnnouncements } from "@shared/announcements";
import { desiredVideoPosition, resolveMarkers, SyncController } from "@shared/sync";
import type {
  Departure,
  RealtimeTripState,
  RouteMediaManifest,
  Station,
  Trip,
} from "@shared/types";
import { toMs } from "@shared/time";

/**
 * Integration: start a demo journey through the HTTP API and progress the clock through
 * multiple stations, checking station progress, realtime delay, video sync and
 * announcements together.
 */
describe("demo journey (API → engines)", () => {
  const clock = { now: Date.parse("2026-10-05T09:00:00+09:00") };
  const registry = new ProviderRegistry(
    [
      new OdptProvider({ baseUrl: "https://api.odpt.org/api/v4", enabled: true }),
      new DemoProvider(() => clock.now),
    ],
    "demo",
  );
  const app = createApp(registry, MediaLibrary.bundled());
  async function get(path: string, query?: Record<string, string | number>, status = 200) {
    const qs = query
      ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`
      : "";
    const res = await app.request(path + qs);
    expect(res.status).toBe(status);
    return { body: await res.json() };
  }

  it("lists providers and keeps ODPT disabled without a key", async () => {
    const res = await get("/api/japan/status", undefined, 200);
    const odpt = res.body.data.providers.find((p: { id: string }) => p.id === "odpt");
    expect(odpt.enabled).toBe(false);
    expect(res.body.data.activeProvider).toBe("demo");
    const ops = await get("/api/japan/operators", undefined, 200);
    expect(ops.body.data[0].id).toBe("demo:SJDEMO");
    expect(ops.body.meta.dataMode).toBe("demo");
  });

  it("serves the curated footage catalog; real footage stays uncalibrated until measured", async () => {
    const res = await get("/api/japan/videos", undefined, 200);
    const videos = res.body.data as Array<{
      provider: string;
      videoId?: string;
      calibration: string;
      stationMarkers: unknown[];
      sourceUrl: string;
    }>;
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos.filter((x) => x.provider === "youtube")) {
      expect(v.videoId).toMatch(/^[\w-]{11}$/);
      expect(v.sourceUrl).toContain(v.videoId);
      if (v.calibration === "calibrated") expect(v.stationMarkers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("validates query parameters with structured errors", async () => {
    const bad = await get("/api/japan/departures?routeId=nope", undefined, 400);
    expect(bad.body.error.code).toBe("BAD_REQUEST");
    const same = await get(
      "/api/japan/departures",
      { routeId: "demo:SAKURA", origin: "demo:SK01", destination: "demo:SK01" },
      400,
    );
    expect(same.body.error.message).toMatch(/differ/);
    await get(`/api/japan/trips/${encodeURIComponent("odpt:x@2026-10-05")}`, undefined, 503);
  });

  it("rides a delayed demo train through several stations", async () => {
    // find a delayed outbound train on this service date
    const deps: Departure[] = (
      await get(
        "/api/japan/departures",
        {
          routeId: "demo:SAKURA",
          origin: "demo:SK01",
          destination: "demo:SK08",
          date: "2026-10-05",
          limit: 50,
        },
        200,
      )
    ).body.data;
    const dep = deps.find((d) => (d.delaySeconds ?? 0) > 0 && !d.cancelled)!;
    expect(dep).toBeDefined();
    expect(dep.dataMode).toBe("demo");

    const trip: Trip = (
      await get(`/api/japan/trips/${encodeURIComponent(dep.tripId)}`, undefined, 200)
    ).body.data;
    const stations: Station[] = (
      await get(`/api/japan/routes/${encodeURIComponent("demo:SAKURA")}/stations`, undefined, 200)
    ).body.data;
    const media: { match: RouteMediaManifest } = (
      await get(
        `/api/japan/routes/${encodeURIComponent("demo:SAKURA")}/media`,
        { origin: "demo:SK01", destination: "demo:SK08" },
        200,
      )
    ).body.data;
    expect(media.match.video?.provider).toBe("illustrated");

    const base = buildTimeline(trip, "demo:SK01", "demo:SK08");
    const markers = resolveMarkers(base, media.match.stationMarkers)!;
    const names = new Map(stations.map((s) => [s.id, s]));
    const played = new Set<string>();
    const sync = new SyncController();
    let videoTime = 0;
    const visited: string[] = [];
    const spoken: string[] = [];
    let sawDelay = false;
    let maxDrift = 0;

    const t0 = toMs(trip.stops[0].scheduledDeparture!) - 90_000;
    const t1 = toMs(trip.stops[trip.stops.length - 1].scheduledArrival!) + 6 * 60_000;
    for (clock.now = t0; clock.now <= t1; clock.now += 5000) {
      const rt: RealtimeTripState | null = (
        await get(`/api/japan/trips/${encodeURIComponent(trip.id)}/realtime`, undefined, 200)
      ).body.data;
      const tl = applyRealtime(base, rt);
      const progress = computeProgress(tl, clock.now, rt);
      const status = resolveJourneyStatus({
        tripDataMode: trip.dataMode,
        realtime: rt,
        now: clock.now,
        offline: false,
        delaySeconds: tl.delaySeconds,
      });
      expect(status.dataMode).toBe("demo"); // never "live"
      if (tl.delaySeconds > 0) sawDelay = true;
      const cur = progress.phase === "running" ? progress.nextIndex : progress.currentIndex;
      const id = tl.stops[cur].stationId;
      if (visited[visited.length - 1] !== id) visited.push(id);

      // simulated player: plays at its rate for 5 s, obeys sync commands
      const desired = desiredVideoPosition(tl, progress, markers, clock.now);
      const cmd = sync.step(
        desired,
        { currentTime: videoTime, playing: true, rate: 1, supportsFineRate: true },
        clock.now,
      );
      if (cmd.seekTo != null) videoTime = cmd.seekTo;
      if (progress.phase === "running")
        maxDrift = Math.max(maxDrift, Math.abs(desired.time - videoTime));
      videoTime = cmd.pause || desired.hold ? videoTime : videoTime + 5 * (cmd.setRate ?? 1);

      for (const e of dueAnnouncements(buildAnnouncementEvents(tl, names), clock.now, played)) {
        played.add(e.id);
        spoken.push(e.id.split(":").slice(-1)[0] + "@" + e.stationId.replace("demo:", ""));
      }
      if (progress.phase === "arrived") break;
    }

    expect(visited).toEqual(stations.map((s) => s.id));
    expect(sawDelay).toBe(true);
    expect(spoken[0]).toBe("pre-departure@SK01");
    expect(spoken.filter((s) => s.startsWith("arrival@")).length).toBe(7);
    expect(new Set(spoken).size).toBe(spoken.length); // no duplicates
    expect(maxDrift).toBeLessThan(60); // large jumps are corrected by seeking
  });
});

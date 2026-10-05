import type { Departure, RealtimeTripState, ServiceAlert, Trip } from "@shared/types";
import { toMs, toTokyoIso } from "@shared/time";
import { parseFeedFiles } from "../gtfs/feed";
import { DEMO_FEED_FILES } from "../data/demoFeed.generated";
import { GtfsProvider } from "./gtfsProvider";
import { ns } from "./types";
import { DEMO_DELAY_NOTICE_EN, DEMO_DELAY_NOTICE_JA } from "./demoConstants";

/** Station where the simulated delay begins (fictional signal inspection). */
const DELAY_FROM_STATION = "demo:SK03";
export const DEMO_DELAY_SECONDS = 240;

export type DemoTripCondition = "normal" | "delayed" | "cancelled";

/** Deterministic simulated condition for a demo trip (stable across restarts). */
export function demoConditionFor(tripId: string): DemoTripCondition {
  let h = 0;
  for (const ch of tripId.replace(/@.*/, "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (h % 5 === 2) return "delayed";
  if (h % 13 === 7) return "cancelled";
  return "normal";
}

/**
 * Demo provider: a fictional line packaged as a GTFS-JP feed plus a *simulated* realtime
 * layer (one delay pattern, occasional cancellation). Everything it returns carries
 * dataMode "demo" and is labelled "Demo railway data" in the UI.
 */
export class DemoProvider extends GtfsProvider {
  constructor(
    private clock: () => number = Date.now,
    files: Record<string, string> = DEMO_FEED_FILES,
  ) {
    super("demo", "Demo railway data", () => parseFeedFiles(files), { dataMode: "demo" });
  }

  /** delay in seconds applying at journey stop index `i` of a trip */
  private delayAt(trip: Trip, i: number): number {
    if (demoConditionFor(trip.id) !== "delayed") return 0;
    const from = trip.stops.findIndex((s) => s.stationId === DELAY_FROM_STATION);
    return from >= 0 && i >= from ? DEMO_DELAY_SECONDS : 0;
  }

  protected override async decorateDepartures(deps: Departure[]): Promise<Departure[]> {
    return Promise.all(
      deps.map(async (d) => {
        const cond = demoConditionFor(d.tripId);
        if (cond === "cancelled") return { ...d, cancelled: true };
        if (cond !== "delayed") return d;
        const trip = await this.getTrip(d.tripId);
        const oi = trip.stops.findIndex((s) => s.stationId === d.originStationId);
        const di = trip.stops.findIndex((s) => s.stationId === d.destinationStationId);
        const depDelay = this.delayAt(trip, oi);
        const arrDelay = this.delayAt(trip, di);
        return {
          ...d,
          delaySeconds: arrDelay,
          estimatedDeparture: toTokyoIso(toMs(d.scheduledDeparture) + depDelay * 1000),
          estimatedArrival: toTokyoIso(toMs(d.scheduledArrival) + arrDelay * 1000),
        };
      }),
    );
  }

  /**
   * Simulated position, reported the way many real feeds do: at a station, or "between
   * station A and B" — never with fabricated GPS coordinates.
   */
  override async getRealtimeTrip(tripId: string): Promise<RealtimeTripState | null> {
    const trip = await this.getTrip(tripId);
    const now = this.clock();
    const base = { tripId, timestamp: toTokyoIso(now), dataMode: "demo" as const };
    if (demoConditionFor(tripId) === "cancelled") return { ...base, cancelled: true };

    const times = trip.stops.map((s, i) => {
      const d = this.delayAt(trip, i) * 1000;
      const arr = toMs(s.scheduledArrival ?? s.scheduledDeparture!) + d;
      const dep = toMs(s.scheduledDeparture ?? s.scheduledArrival!) + d;
      return { id: s.stationId, arr, dep, delay: d / 1000 };
    });
    const first = times[0];
    const last = times[times.length - 1];
    if (now < first.dep) return { ...base, previousStationId: first.id, delaySeconds: 0 };
    if (now >= last.arr) return { ...base, previousStationId: last.id, delaySeconds: last.delay };
    for (let i = 0; i < times.length - 1; i++) {
      const s = times[i];
      const n = times[i + 1];
      if (now >= s.arr && now < s.dep)
        return { ...base, previousStationId: s.id, delaySeconds: s.delay };
      if (now >= s.dep && now < n.arr) {
        return { ...base, previousStationId: s.id, nextStationId: n.id, delaySeconds: n.delay };
      }
    }
    return { ...base, previousStationId: last.id, delaySeconds: last.delay };
  }

  override async getServiceAlerts(routeId: string): Promise<ServiceAlert[]> {
    await this.ensureLoaded();
    if (routeId !== ns("demo", "SAKURA")) return [];
    return [
      {
        id: "demo:alert-signal",
        routeId,
        severity: "info",
        statusJa: "一部列車に遅れ（デモ）",
        statusEn: "Some trains delayed (demo)",
        textJa: DEMO_DELAY_NOTICE_JA,
        textEn: DEMO_DELAY_NOTICE_EN,
        updatedAt: toTokyoIso(this.clock()),
        dataMode: "demo",
      },
    ];
  }
}

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fetchWithRetry } from "../http";
import { TtlCache } from "../cache";

const { transit_realtime } = GtfsRealtimeBindings;

export interface TripUpdateSummary {
  tripId: string;
  startDate?: string;
  delaySeconds?: number;
  cancelled: boolean;
  /** delay by raw stop_id */
  stopDelays: Record<string, number>;
  timestamp?: number;
}

export interface VehicleSummary {
  tripId: string;
  startDate?: string;
  stopId?: string;
  status?: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
  latitude?: number;
  longitude?: number;
  timestamp?: number;
}

export interface AlertSummary {
  id: string;
  routeIds: string[];
  severity: "info" | "warning" | "severe";
  headerJa?: string;
  headerEn?: string;
  textJa?: string;
  textEn?: string;
}

export interface GtfsRealtimeConfig {
  tripUpdatesUrl?: string;
  vehiclePositionsUrl?: string;
  alertsUrl?: string;
  /** appended as acl:consumerKey for api.odpt.org / api-challenge.odpt.org URLs */
  odptApiKey?: string;
  pollMs?: number;
}

/**
 * GTFS-Realtime (Protocol Buffers) reader. Feeds are cached for `pollMs` (default 25 s)
 * so many browser clients never multiply upstream requests.
 */
export class GtfsRealtimeSource {
  private cache = new TtlCache(10);
  constructor(private cfg: GtfsRealtimeConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.tripUpdatesUrl || this.cfg.vehiclePositionsUrl || this.cfg.alertsUrl);
  }

  private withKey(url: string): string {
    if (!this.cfg.odptApiKey || !/\.odpt\.org\//.test(url) || url.includes("consumerKey="))
      return url;
    return `${url}${url.includes("?") ? "&" : "?"}acl:consumerKey=${encodeURIComponent(this.cfg.odptApiKey)}`;
  }

  private async feed(url: string) {
    const r = await this.cache.getOrLoad(url, this.cfg.pollMs ?? 25_000, async () => {
      const res = await fetchWithRetry(this.withKey(url), { timeoutMs: 8000, retries: 1 });
      return decodeFeed(new Uint8Array(await res.arrayBuffer()));
    });
    return r.value;
  }

  async getTripUpdates(): Promise<Map<string, TripUpdateSummary>> {
    if (!this.cfg.tripUpdatesUrl) return new Map();
    return summariseTripUpdates(await this.feed(this.cfg.tripUpdatesUrl));
  }

  async getVehiclePositions(): Promise<Map<string, VehicleSummary>> {
    if (!this.cfg.vehiclePositionsUrl) return new Map();
    return summariseVehicles(await this.feed(this.cfg.vehiclePositionsUrl));
  }

  async getAlerts(): Promise<AlertSummary[]> {
    if (!this.cfg.alertsUrl) return [];
    return summariseAlerts(await this.feed(this.cfg.alertsUrl));
  }
}

type FeedMessage = ReturnType<typeof transit_realtime.FeedMessage.decode>;

export function decodeFeed(buf: Uint8Array): FeedMessage {
  return transit_realtime.FeedMessage.decode(buf);
}

const num = (v: unknown): number | undefined =>
  v == null ? undefined : typeof v === "number" ? v : Number(v as { toString(): string });

/** protobufjs exposes proto2 defaults (0) on the prototype; only own properties were sent. */
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function keys(tripId: string, startDate?: string | null): string[] {
  return startDate ? [`${tripId}|${startDate}`, tripId] : [tripId];
}

export function summariseTripUpdates(feed: FeedMessage): Map<string, TripUpdateSummary> {
  const out = new Map<string, TripUpdateSummary>();
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu?.trip?.tripId) continue;
    const stopDelays: Record<string, number> = {};
    let lastDelay: number | undefined = has(tu, "delay") ? num(tu.delay) : undefined;
    for (const stu of tu.stopTimeUpdate ?? []) {
      const d =
        (stu.arrival && has(stu.arrival, "delay") ? num(stu.arrival.delay) : undefined) ??
        (stu.departure && has(stu.departure, "delay") ? num(stu.departure.delay) : undefined);
      if (stu.stopId && d != null) {
        stopDelays[stu.stopId] = d;
        lastDelay ??= d;
      }
    }
    const summary: TripUpdateSummary = {
      tripId: tu.trip.tripId,
      startDate: tu.trip.startDate ?? undefined,
      delaySeconds: lastDelay,
      cancelled:
        tu.trip.scheduleRelationship ===
        transit_realtime.TripDescriptor.ScheduleRelationship.CANCELED,
      stopDelays,
      timestamp: num(tu.timestamp) ?? num(feed.header.timestamp),
    };
    for (const k of keys(summary.tripId, summary.startDate)) out.set(k, summary);
  }
  return out;
}

export function summariseVehicles(feed: FeedMessage): Map<string, VehicleSummary> {
  const out = new Map<string, VehicleSummary>();
  const statusNames = ["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"] as const;
  for (const e of feed.entity) {
    const v = e.vehicle;
    if (!v?.trip?.tripId) continue;
    const summary: VehicleSummary = {
      tripId: v.trip.tripId,
      startDate: v.trip.startDate ?? undefined,
      stopId: v.stopId ?? undefined,
      status: v.currentStatus != null ? statusNames[v.currentStatus] : undefined,
      latitude: v.position?.latitude ?? undefined,
      longitude: v.position?.longitude ?? undefined,
      timestamp: num(v.timestamp) ?? num(feed.header.timestamp),
    };
    for (const k of keys(summary.tripId, summary.startDate)) out.set(k, summary);
  }
  return out;
}

export function summariseAlerts(feed: FeedMessage): AlertSummary[] {
  const pick = (
    t:
      | { translation?: Array<{ text?: string | null; language?: string | null }> | null }
      | null
      | undefined,
    lang: string,
  ) =>
    t?.translation?.find((x) => (x.language ?? "").startsWith(lang))?.text ??
    (lang === "ja" ? t?.translation?.find((x) => !x.language)?.text : undefined) ??
    undefined;
  return feed.entity
    .filter((e) => e.alert)
    .map((e) => {
      const a = e.alert!;
      const sev = a.severityLevel;
      return {
        id: e.id,
        routeIds: (a.informedEntity ?? [])
          .map((ie) => ie.routeId)
          .filter((r): r is string => Boolean(r)),
        severity: sev === 4 ? "severe" : sev === 3 ? "warning" : "info",
        headerJa: pick(a.headerText, "ja"),
        headerEn: pick(a.headerText, "en"),
        textJa: pick(a.descriptionText, "ja"),
        textEn: pick(a.descriptionText, "en"),
      } satisfies AlertSummary;
    });
}

import type {
  Departure,
  DepartureQuery,
  Operator,
  RailwayRoute,
  RealtimeTripState,
  RouteShape,
  ServiceAlert,
  Station,
  Trip,
  TripStop,
} from "@shared/types";
import { odptCalendarCandidates } from "@shared/calendar";
import {
  addDays,
  monotonicTripSeconds,
  normalizeServiceDate,
  parseRailwayTime,
  serviceDateFor,
  serviceTimeToIso,
  toMs,
  toTokyoIso,
} from "@shared/time";
import { TtlCache } from "../cache";
import { fetchWithRetry, redact, UpstreamError } from "../http";
import { ns, ProviderError, unns, type RailwayProvider } from "./types";

/* ---------- raw ODPT JSON-LD shapes (only the fields we read) ---------- */
type Multi = { ja?: string; en?: string; [k: string]: string | undefined };

export interface OdptOperatorRaw {
  "owl:sameAs": string;
  "dc:title"?: string;
  "odpt:operatorTitle"?: Multi;
}
export interface OdptRailwayRaw {
  "owl:sameAs": string;
  "dc:title"?: string;
  "odpt:railwayTitle"?: Multi;
  "odpt:operator": string;
  "odpt:color"?: string;
  "odpt:lineCode"?: string;
  "odpt:ascendingRailDirection"?: string;
  "odpt:descendingRailDirection"?: string;
  "odpt:stationOrder"?: Array<{
    "odpt:index": number;
    "odpt:station": string;
    "odpt:stationTitle"?: Multi;
  }>;
}
export interface OdptStationRaw {
  "owl:sameAs": string;
  "dc:title"?: string;
  "odpt:stationTitle"?: Multi;
  "odpt:stationCode"?: string;
  "odpt:railway"?: string;
  "geo:lat"?: number;
  "geo:long"?: number;
}
export interface OdptTrainTimetableRaw {
  "owl:sameAs": string;
  "odpt:railway": string;
  "odpt:operator"?: string;
  "odpt:trainNumber"?: string;
  "odpt:trainType"?: string;
  "odpt:railDirection"?: string;
  "odpt:calendar"?: string;
  "odpt:destinationStation"?: string[];
  "odpt:trainTimetableObject": Array<{
    "odpt:departureTime"?: string;
    "odpt:departureStation"?: string;
    "odpt:arrivalTime"?: string;
    "odpt:arrivalStation"?: string;
    "odpt:platformNumber"?: string;
  }>;
}
export interface OdptTrainRaw {
  "owl:sameAs"?: string;
  "dc:date"?: string;
  "dct:valid"?: string;
  "odpt:railway": string;
  "odpt:trainNumber"?: string;
  "odpt:railDirection"?: string;
  "odpt:delay"?: number;
  "odpt:fromStation"?: string | null;
  "odpt:toStation"?: string | null;
}
export interface OdptTrainInformationRaw {
  "owl:sameAs"?: string;
  "dc:date"?: string;
  "odpt:railway"?: string;
  "odpt:trainInformationStatus"?: Multi;
  "odpt:trainInformationText"?: Multi;
}

export interface OdptConfig {
  apiKey?: string;
  baseUrl: string;
  enabled: boolean;
  /** optional allow-list of operator ids (e.g. odpt.Operator:TokyoMetro) */
  operators?: string[];
  timeoutMs?: number;
  fetchJson?: (url: string) => Promise<unknown>;
}

const HOUR = 3_600_000;

/* ---------- pure normalisers (unit tested) ---------- */

export function normalizeOperator(raw: OdptOperatorRaw): Operator {
  const ja = raw["odpt:operatorTitle"]?.ja ?? raw["dc:title"] ?? raw["owl:sameAs"];
  return {
    id: ns("odpt", raw["owl:sameAs"]),
    nameJa: ja,
    nameEn: raw["odpt:operatorTitle"]?.en ?? ja,
    provider: "odpt",
  };
}

export function normalizeRailway(raw: OdptRailwayRaw): RailwayRoute {
  const ja = raw["odpt:railwayTitle"]?.ja ?? raw["dc:title"] ?? raw["owl:sameAs"];
  const order = [...(raw["odpt:stationOrder"] ?? [])].sort(
    (a, b) => a["odpt:index"] - b["odpt:index"],
  );
  const dirs = [raw["odpt:ascendingRailDirection"], raw["odpt:descendingRailDirection"]].filter(
    (d): d is string => Boolean(d),
  );
  return {
    id: ns("odpt", raw["owl:sameAs"]),
    operatorId: ns("odpt", raw["odpt:operator"]),
    nameJa: ja,
    nameEn: raw["odpt:railwayTitle"]?.en ?? ja,
    color: raw["odpt:color"],
    stationIds: order.map((o) => ns("odpt", o["odpt:station"])),
    directions: dirs.map((d) => ({ id: d, nameJa: shortId(d), nameEn: shortId(d) })),
  };
}

export function normalizeStation(raw: OdptStationRaw): Station {
  const ja = raw["odpt:stationTitle"]?.ja ?? raw["dc:title"] ?? raw["owl:sameAs"];
  return {
    id: ns("odpt", raw["owl:sameAs"]),
    nameJa: ja,
    nameEn: raw["odpt:stationTitle"]?.en ?? ja,
    latitude: typeof raw["geo:lat"] === "number" ? raw["geo:lat"] : undefined,
    longitude: typeof raw["geo:long"] === "number" ? raw["geo:long"] : undefined,
    code: raw["odpt:stationCode"],
  };
}

/** Converts an ODPT train timetable to a trip on a given service date. */
export function normalizeTrainTimetable(raw: OdptTrainTimetableRaw, serviceDate: string): Trip {
  type S = { station: string; arr?: string; dep?: string; platform?: string };
  const merged: S[] = [];
  for (const o of raw["odpt:trainTimetableObject"] ?? []) {
    const station = o["odpt:departureStation"] ?? o["odpt:arrivalStation"];
    if (!station) continue;
    const last = merged[merged.length - 1];
    if (last && last.station === station) {
      last.arr ??= o["odpt:arrivalTime"];
      last.dep ??= o["odpt:departureTime"];
      continue;
    }
    merged.push({
      station,
      arr: o["odpt:arrivalTime"],
      dep: o["odpt:departureTime"],
      platform: o["odpt:platformNumber"],
    });
  }
  const flat = merged.flatMap((s) => [parseRailwayTime(s.arr), parseRailwayTime(s.dep)]);
  const mono = monotonicTripSeconds(flat);
  const stops: TripStop[] = merged.map((s, i) => {
    const a = mono[i * 2];
    const d = mono[i * 2 + 1];
    return {
      stationId: ns("odpt", s.station),
      sequence: i + 1,
      scheduledArrival: a != null ? serviceTimeToIso(serviceDate, a) : undefined,
      scheduledDeparture: d != null ? serviceTimeToIso(serviceDate, d) : undefined,
      platform: s.platform,
    };
  });
  const dest = raw["odpt:destinationStation"]?.[0] ?? merged[merged.length - 1]?.station ?? "";
  return {
    id: `${ns("odpt", raw["owl:sameAs"])}@${serviceDate}`,
    routeId: ns("odpt", raw["odpt:railway"]),
    operatorId: raw["odpt:operator"] ? ns("odpt", raw["odpt:operator"]) : "",
    serviceDate,
    direction: raw["odpt:railDirection"],
    headsignJa: shortId(dest),
    headsignEn: shortId(dest),
    trainNumber: raw["odpt:trainNumber"],
    trainTypeJa: raw["odpt:trainType"] ? shortId(raw["odpt:trainType"]) : undefined,
    trainTypeEn: raw["odpt:trainType"] ? shortId(raw["odpt:trainType"]) : undefined,
    stops,
    dataMode: "timetable",
  };
}

/** Normalises an odpt:Train (realtime location) record. Never invents coordinates. */
export function normalizeTrain(
  raw: OdptTrainRaw,
  tripId: string,
  now = Date.now(),
): RealtimeTripState | null {
  const valid = raw["dct:valid"] ? toMs(raw["dct:valid"]) : undefined;
  const from = raw["odpt:fromStation"] ?? undefined;
  const to = raw["odpt:toStation"] ?? undefined;
  if (!from && !to) return null;
  return {
    tripId,
    timestamp: raw["dc:date"] ?? toTokyoIso(now),
    previousStationId: from ? ns("odpt", from) : undefined,
    nextStationId: to ? ns("odpt", to) : undefined,
    delaySeconds: typeof raw["odpt:delay"] === "number" ? raw["odpt:delay"] : undefined,
    dataMode: valid != null && valid < now ? "timetable" : "live",
  };
}

function shortId(id: string): string {
  // "odpt.Station:JR-East.ChuoRapid.Takao" -> "Takao"
  const tail = id.split(":").pop() ?? id;
  return tail.split(".").pop() ?? tail;
}

/* ---------- provider ---------- */

/**
 * ODPT (Public Transportation Open Data Center) JSON API provider.
 * Every request goes through this backend; the consumer key never reaches the browser.
 * Datasets differ per operator — the provider only exposes what the API actually returns.
 */
export class OdptProvider implements RailwayProvider {
  readonly id = "odpt" as const;
  readonly label = "ODPT";
  readonly baseDataMode = "timetable" as const;
  private cache = new TtlCache(800);
  private timetables = new Map<string, OdptTrainTimetableRaw>();

  constructor(private cfg: OdptConfig) {}

  isEnabled(): boolean {
    return this.cfg.enabled && Boolean(this.cfg.apiKey);
  }
  disabledReason(): string | undefined {
    if (!this.cfg.enabled) return "ODPT provider disabled (ENABLE_ODPT=false)";
    if (!this.cfg.apiKey) return "ODPT_API_KEY is not set";
    return undefined;
  }

  private async get<T>(type: string, params: Record<string, string>, ttlMs: number): Promise<T> {
    if (!this.isEnabled()) throw new ProviderError("NOT_CONFIGURED", this.disabledReason()!);
    const qs = new URLSearchParams(params);
    const keyless = `${this.cfg.baseUrl.replace(/\/$/, "")}/${type}?${qs}`;
    const res = await this.cache.getOrLoad(keyless, ttlMs, async () => {
      const url = `${keyless}${qs.toString() ? "&" : ""}acl:consumerKey=${encodeURIComponent(this.cfg.apiKey!)}`;
      try {
        if (this.cfg.fetchJson) return await this.cfg.fetchJson(url);
        const r = await fetchWithRetry(url, {
          timeoutMs: this.cfg.timeoutMs ?? 10_000,
          retries: 2,
        });
        return await r.json();
      } catch (err) {
        const msg = err instanceof UpstreamError ? err.message : redact(String(err));
        throw new ProviderError("UPSTREAM_UNAVAILABLE", `ODPT request failed: ${redact(msg)}`);
      }
    });
    if (!Array.isArray(res.value))
      throw new ProviderError("UPSTREAM_UNAVAILABLE", "Unexpected ODPT response format");
    return res.value as T;
  }

  private async railways(): Promise<OdptRailwayRaw[]> {
    const all = await this.get<OdptRailwayRaw[]>("odpt:Railway", {}, 24 * HOUR);
    return this.cfg.operators?.length
      ? all.filter((r) => this.cfg.operators!.includes(r["odpt:operator"]))
      : all;
  }

  async getOperators(): Promise<Operator[]> {
    const [ops, rails] = await Promise.all([
      this.get<OdptOperatorRaw[]>("odpt:Operator", {}, 24 * HOUR),
      this.railways(),
    ]);
    const withRail = new Set(rails.map((r) => r["odpt:operator"]));
    return ops.filter((o) => withRail.has(o["owl:sameAs"])).map(normalizeOperator);
  }

  async getRoutes(operatorId?: string): Promise<RailwayRoute[]> {
    const rails = await this.railways();
    return rails
      .filter((r) => !operatorId || ns("odpt", r["odpt:operator"]) === operatorId)
      .map(normalizeRailway)
      .filter((r) => r.stationIds.length >= 2);
  }

  async getStations(routeId: string): Promise<Station[]> {
    const raw = unns("odpt", routeId);
    const [route] = (await this.railways())
      .filter((r) => r["owl:sameAs"] === raw)
      .map(normalizeRailway);
    if (!route) throw new ProviderError("NOT_FOUND", `Railway not found: ${routeId}`);
    const stations = await this.get<OdptStationRaw[]>(
      "odpt:Station",
      { "odpt:railway": raw },
      24 * HOUR,
    );
    const byId = new Map(stations.map((s) => [ns("odpt", s["owl:sameAs"]), normalizeStation(s)]));
    const order =
      (await this.railways()).find((r) => r["owl:sameAs"] === raw)?.["odpt:stationOrder"] ?? [];
    return route.stationIds.map((id) => {
      const s = byId.get(id);
      if (s) return s;
      const o = order.find((x) => ns("odpt", x["odpt:station"]) === id);
      return {
        id,
        nameJa: o?.["odpt:stationTitle"]?.ja ?? shortId(id),
        nameEn: o?.["odpt:stationTitle"]?.en ?? shortId(id),
      };
    });
  }

  private async timetablesFor(
    railway: string,
    serviceDate: string,
  ): Promise<OdptTrainTimetableRaw[]> {
    for (const cal of odptCalendarCandidates(serviceDate)) {
      const list = await this.get<OdptTrainTimetableRaw[]>(
        "odpt:TrainTimetable",
        { "odpt:railway": railway, "odpt:calendar": cal },
        6 * HOUR,
      );
      if (list.length) {
        for (const t of list) this.timetables.set(t["owl:sameAs"], t);
        return list;
      }
    }
    return [];
  }

  async getDepartures(q: DepartureQuery): Promise<Departure[]> {
    const railway = unns("odpt", q.routeId);
    const afterMs = q.after ? toMs(q.after) : undefined;
    const dates = q.serviceDate
      ? [normalizeServiceDate(q.serviceDate)]
      : (() => {
          const d = serviceDateFor(afterMs ?? Date.now());
          return [addDays(d, -1), d];
        })();
    const stations = await this.getStations(q.routeId).catch(() => [] as Station[]);
    const names = new Map(stations.map((s) => [s.id, s]));
    const out: Departure[] = [];
    let anyTimetable = false;
    for (const serviceDate of dates) {
      const list = await this.timetablesFor(railway, serviceDate);
      if (list.length) anyTimetable = true;
      for (const raw of list) {
        const trip = normalizeTrainTimetable(raw, serviceDate);
        const oi = trip.stops.findIndex((s) => s.stationId === q.originStationId);
        if (oi < 0) continue;
        const di = trip.stops.findIndex((s, i) => i > oi && s.stationId === q.destinationStationId);
        if (di < 0) continue;
        const dep = trip.stops[oi].scheduledDeparture ?? trip.stops[oi].scheduledArrival;
        const arr = trip.stops[di].scheduledArrival ?? trip.stops[di].scheduledDeparture;
        if (!dep || !arr) continue;
        if (afterMs != null && toMs(dep) < afterMs && !(q.includeInProgress && toMs(arr) > afterMs))
          continue;
        const terminalId = trip.stops[trip.stops.length - 1].stationId;
        const terminal = names.get(terminalId);
        out.push({
          id: `${trip.id}:${oi}`,
          tripId: trip.id,
          routeId: q.routeId,
          originStationId: q.originStationId,
          destinationStationId: q.destinationStationId,
          scheduledDeparture: dep,
          scheduledArrival: arr,
          destinationNameJa: terminal?.nameJa ?? trip.headsignJa,
          destinationNameEn: terminal?.nameEn ?? trip.headsignEn,
          platform: trip.stops[oi].platform,
          dataMode: "timetable",
          trainNumber: trip.trainNumber,
          trainTypeJa: trip.trainTypeJa,
          trainTypeEn: trip.trainTypeEn,
          direction: trip.direction,
          serviceDate,
        });
      }
    }
    if (!anyTimetable) {
      throw new ProviderError(
        "UNSUPPORTED",
        "This railway does not publish train timetables (odpt:TrainTimetable) in the ODPT dataset available to this key.",
      );
    }
    out.sort((a, b) => toMs(a.scheduledDeparture) - toMs(b.scheduledDeparture));
    const limited = out.slice(0, q.limit ?? 12);
    // overlay live delays when available
    const trains = await this.get<OdptTrainRaw[]>(
      "odpt:Train",
      { "odpt:railway": railway },
      25_000,
    ).catch(() => []);
    return limited.map((d) => {
      const tt = this.timetables.get(unns("odpt", d.tripId).replace(/@.*/, ""));
      const live = trains.find(
        (t) =>
          t["odpt:trainNumber"] === tt?.["odpt:trainNumber"] &&
          t["odpt:railDirection"] === tt?.["odpt:railDirection"],
      );
      if (!live || typeof live["odpt:delay"] !== "number") return d;
      const delay = live["odpt:delay"];
      return {
        ...d,
        dataMode: "live",
        delaySeconds: delay,
        estimatedDeparture: toTokyoIso(toMs(d.scheduledDeparture) + delay * 1000),
        estimatedArrival: toTokyoIso(toMs(d.scheduledArrival) + delay * 1000),
      };
    });
  }

  private async findTimetable(sameAs: string): Promise<OdptTrainTimetableRaw> {
    const cached = this.timetables.get(sameAs);
    if (cached) return cached;
    const list = await this.get<OdptTrainTimetableRaw[]>(
      "odpt:TrainTimetable",
      { "owl:sameAs": sameAs },
      6 * HOUR,
    );
    if (!list[0]) throw new ProviderError("NOT_FOUND", `Train timetable not found: ${sameAs}`);
    this.timetables.set(sameAs, list[0]);
    return list[0];
  }

  private splitTripId(tripId: string): { sameAs: string; serviceDate: string } {
    const raw = unns("odpt", tripId);
    const at = raw.lastIndexOf("@");
    if (at < 0) throw new ProviderError("BAD_REQUEST", "Trip id must include a service date");
    return { sameAs: raw.slice(0, at), serviceDate: normalizeServiceDate(raw.slice(at + 1)) };
  }

  async getTrip(tripId: string): Promise<Trip> {
    const { sameAs, serviceDate } = this.splitTripId(tripId);
    const raw = await this.findTimetable(sameAs);
    const trip = normalizeTrainTimetable(raw, serviceDate);
    const stations = await this.getStations(trip.routeId).catch(() => [] as Station[]);
    const terminal = stations.find((s) => s.id === trip.stops[trip.stops.length - 1]?.stationId);
    return terminal ? { ...trip, headsignJa: terminal.nameJa, headsignEn: terminal.nameEn } : trip;
  }

  async getRealtimeTrip(tripId: string): Promise<RealtimeTripState | null> {
    const { sameAs } = this.splitTripId(tripId);
    const tt = await this.findTimetable(sameAs);
    const trains = await this.get<OdptTrainRaw[]>(
      "odpt:Train",
      { "odpt:railway": tt["odpt:railway"] },
      25_000,
    );
    const live = trains.find(
      (t) =>
        t["odpt:trainNumber"] === tt["odpt:trainNumber"] &&
        t["odpt:railDirection"] === tt["odpt:railDirection"],
    );
    return live ? normalizeTrain(live, tripId) : null;
  }

  async getServiceAlerts(routeId: string): Promise<ServiceAlert[]> {
    const railway = unns("odpt", routeId);
    const list = await this.get<OdptTrainInformationRaw[]>(
      "odpt:TrainInformation",
      { "odpt:railway": railway },
      60_000,
    );
    return list.map((i, n) => ({
      id: ns("odpt", i["owl:sameAs"] ?? `${railway}#${n}`),
      routeId,
      severity: i["odpt:trainInformationStatus"] ? "warning" : "info",
      statusJa: i["odpt:trainInformationStatus"]?.ja,
      statusEn: i["odpt:trainInformationStatus"]?.en,
      textJa: i["odpt:trainInformationText"]?.ja,
      textEn: i["odpt:trainInformationText"]?.en,
      updatedAt: i["dc:date"],
      dataMode: "live" as const,
    }));
  }

  async getRouteShape(routeId: string, direction?: string): Promise<RouteShape | null> {
    const stations = await this.getStations(routeId);
    const coords = stations
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => [s.longitude!, s.latitude!] as [number, number]);
    if (coords.length < 2) return null;
    const route = (await this.getRoutes()).find((r) => r.id === routeId);
    const descending = direction && route?.directions?.[1]?.id === direction;
    return {
      routeId,
      coordinates: descending ? coords.reverse() : coords,
      approximate: true,
      source: "Approximate route through ODPT station coordinates",
    };
  }
}

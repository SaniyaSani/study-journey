import type {
  DataMode,
  Departure,
  DepartureQuery,
  Operator,
  ProviderId,
  RailwayRoute,
  RealtimeTripState,
  RouteShape,
  ServiceAlert,
  Station,
  Trip,
  TripStop,
} from "@shared/types";
import {
  addDays,
  normalizeServiceDate,
  parseRailwayTime,
  serviceDateFor,
  serviceTimeToIso,
  toMs,
  weekdayOf,
} from "@shared/time";
import type { GtfsFeed } from "../gtfs/feed";
import { ns, ProviderError, unns, type RailwayProvider } from "./types";
import type { GtfsRealtimeSource } from "./gtfsRealtime";

interface StopTimeRow {
  stationId: string; // parent station (raw)
  stopId: string;
  seq: number;
  arr: number | null;
  dep: number | null;
  platform?: string;
}

interface TripRow {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  direction: string;
  shapeId?: string;
  shortName?: string;
}

const WEEKDAY_FIELDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Static GTFS / GTFS-JP provider. Reads agency, routes, stops, trips, stop_times, calendar,
 * calendar_dates, shapes (optional) and translations (optional, for English names).
 * Values missing from the feed stay missing — nothing is invented.
 */
export class GtfsProvider implements RailwayProvider {
  readonly baseDataMode: DataMode;
  protected operators = new Map<string, Operator>();
  protected routes = new Map<string, RailwayRoute>();
  protected stations = new Map<string, Station>();
  protected trips = new Map<string, TripRow>();
  protected stopTimes = new Map<string, StopTimeRow[]>();
  protected tripsByRoute = new Map<string, TripRow[]>();
  protected shapes = new Map<string, Array<[number, number]>>();
  private calendars = new Map<string, Record<string, string>>();
  private calendarDates = new Map<string, Map<string, "1" | "2">>();

  constructor(
    readonly id: ProviderId,
    readonly label: string,
    private loadFeed: () => Promise<GtfsFeed> | GtfsFeed,
    options: { dataMode?: DataMode; realtime?: GtfsRealtimeSource } = {},
  ) {
    this.baseDataMode = options.dataMode ?? "timetable";
    this.realtime = options.realtime;
  }

  protected realtime?: GtfsRealtimeSource;
  private ready?: Promise<void>;
  private loadError?: string;

  isEnabled(): boolean {
    return !this.loadError;
  }
  disabledReason(): string | undefined {
    return this.loadError;
  }

  protected async ensureLoaded(): Promise<void> {
    if (!this.ready) {
      this.ready = Promise.resolve(this.loadFeed()).then(
        (feed) => this.index(feed),
        (err: Error) => {
          this.loadError = `GTFS feed could not be loaded: ${err.message}`;
          this.ready = undefined;
          throw new ProviderError("UPSTREAM_UNAVAILABLE", this.loadError);
        },
      );
    }
    return this.ready;
  }

  /** Builds lookup tables. Exposed for tests. */
  index(feed: GtfsFeed): void {
    const tr = buildTranslations(feed);
    const en = (table: string, field: string, recordId: string, jaValue: string) =>
      tr.get(`${table}|${field}|${recordId}`) ?? tr.get(`value|${jaValue}`);

    for (const a of feed["agency.txt"] ?? []) {
      const rawId = a.agency_id || "default";
      const jp = feed["agency_jp.txt"]?.find((x) => x.agency_id === a.agency_id);
      const nameJa = jp?.agency_official_name || a.agency_name;
      this.operators.set(ns(this.id, rawId), {
        id: ns(this.id, rawId),
        nameJa,
        nameEn: en("agency", "agency_name", rawId, a.agency_name) ?? nameJa,
        provider: this.id,
      });
    }

    const stopParent = new Map<string, string>();
    const platformCode = new Map<string, string>();
    for (const s of feed["stops.txt"] ?? []) {
      const parent = s.parent_station || s.stop_id;
      stopParent.set(s.stop_id, parent);
      if (s.platform_code) platformCode.set(s.stop_id, s.platform_code);
      const isStation = s.location_type === "1" || !s.parent_station;
      if (isStation) {
        const lat = Number(s.stop_lat);
        const lon = Number(s.stop_lon);
        this.stations.set(ns(this.id, s.stop_id), {
          id: ns(this.id, s.stop_id),
          nameJa: s.stop_name,
          nameEn: en("stops", "stop_name", s.stop_id, s.stop_name) ?? s.stop_name,
          latitude: s.stop_lat && Number.isFinite(lat) ? lat : undefined,
          longitude: s.stop_lon && Number.isFinite(lon) ? lon : undefined,
          code: s.stop_code || undefined,
        });
      }
    }

    for (const t of feed["trips.txt"] ?? []) {
      const row: TripRow = {
        id: t.trip_id,
        routeId: t.route_id,
        serviceId: t.service_id,
        headsign: t.trip_headsign,
        direction: t.direction_id || "0",
        shapeId: t.shape_id || undefined,
        shortName: t.trip_short_name || undefined,
      };
      this.trips.set(t.trip_id, row);
      const list = this.tripsByRoute.get(t.route_id) ?? [];
      list.push(row);
      this.tripsByRoute.set(t.route_id, list);
    }

    for (const st of feed["stop_times.txt"] ?? []) {
      const list = this.stopTimes.get(st.trip_id) ?? [];
      list.push({
        stopId: st.stop_id,
        stationId: stopParent.get(st.stop_id) ?? st.stop_id,
        seq: Number(st.stop_sequence),
        arr: parseRailwayTime(st.arrival_time),
        dep: parseRailwayTime(st.departure_time),
        platform: platformCode.get(st.stop_id),
      });
      this.stopTimes.set(st.trip_id, list);
    }
    for (const list of this.stopTimes.values()) list.sort((a, b) => a.seq - b.seq);

    const routesJp = new Map((feed["routes_jp.txt"] ?? []).map((r) => [r.route_id, r]));
    for (const r of feed["routes.txt"] ?? []) {
      const nameJa =
        r.route_long_name ||
        r.route_short_name ||
        routesJp.get(r.route_id)?.origin_stop ||
        r.route_id;
      const rid = ns(this.id, r.route_id);
      const trips = this.tripsByRoute.get(r.route_id) ?? [];
      // canonical station order: the longest direction-0 pattern
      const dir0 = trips.filter((t) => t.direction === "0");
      const pattern = (dir0.length ? dir0 : trips)
        .map((t) => this.stopTimes.get(t.id) ?? [])
        .reduce<StopTimeRow[]>((best, cur) => (cur.length > best.length ? cur : best), []);
      const directions = ["0", "1"]
        .map((d) => {
          const t = trips.find((x) => x.direction === d);
          if (!t) return null;
          const st = this.stopTimes.get(t.id);
          const last = st?.[st.length - 1];
          const terminal = last ? this.stations.get(ns(this.id, last.stationId)) : undefined;
          return {
            id: d,
            nameJa: terminal ? `${terminal.nameJa}方面` : t.headsign,
            nameEn: terminal ? `for ${terminal.nameEn}` : t.headsign,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      this.routes.set(rid, {
        id: rid,
        operatorId: ns(
          this.id,
          r.agency_id || [...this.operators.keys()][0]?.split(":")[1] || "default",
        ),
        nameJa,
        nameEn:
          en("routes", "route_long_name", r.route_id, nameJa) ??
          en("routes", "route_short_name", r.route_id, nameJa) ??
          nameJa,
        color: r.route_color ? `#${r.route_color}` : undefined,
        stationIds: pattern.map((p) => ns(this.id, p.stationId)),
        directions,
      });
    }

    for (const c of feed["calendar.txt"] ?? []) this.calendars.set(c.service_id, c);
    for (const c of feed["calendar_dates.txt"] ?? []) {
      const m = this.calendarDates.get(c.service_id) ?? new Map();
      m.set(normalizeServiceDate(c.date), c.exception_type as "1" | "2");
      this.calendarDates.set(c.service_id, m);
    }

    const shapeRows = new Map<string, Array<{ seq: number; p: [number, number] }>>();
    for (const s of feed["shapes.txt"] ?? []) {
      const list = shapeRows.get(s.shape_id) ?? [];
      list.push({
        seq: Number(s.shape_pt_sequence),
        p: [Number(s.shape_pt_lon), Number(s.shape_pt_lat)],
      });
      shapeRows.set(s.shape_id, list);
    }
    for (const [id, rows] of shapeRows)
      this.shapes.set(
        id,
        rows.sort((a, b) => a.seq - b.seq).map((r) => r.p),
      );
  }

  /** Is a service running on a Japanese service date (calendar + calendar_dates exceptions)? */
  isServiceActive(serviceId: string, serviceDate: string): boolean {
    const exc = this.calendarDates.get(serviceId)?.get(serviceDate);
    if (exc === "1") return true;
    if (exc === "2") return false;
    const c = this.calendars.get(serviceId);
    if (!c) return false;
    const compact = serviceDate.replace(/-/g, "");
    if (compact < c.start_date || compact > c.end_date) return false;
    return c[WEEKDAY_FIELDS[weekdayOf(serviceDate)]] === "1";
  }

  async getOperators(): Promise<Operator[]> {
    await this.ensureLoaded();
    return [...this.operators.values()];
  }

  async getRoutes(operatorId?: string): Promise<RailwayRoute[]> {
    await this.ensureLoaded();
    return [...this.routes.values()].filter((r) => !operatorId || r.operatorId === operatorId);
  }

  async getStations(routeId: string): Promise<Station[]> {
    await this.ensureLoaded();
    const route = this.routes.get(routeId);
    if (!route) throw new ProviderError("NOT_FOUND", `Route not found: ${routeId}`);
    return route.stationIds
      .map((id) => this.stations.get(id))
      .filter((s): s is Station => Boolean(s));
  }

  async getDepartures(q: DepartureQuery): Promise<Departure[]> {
    await this.ensureLoaded();
    const rawRoute = unns(this.id, q.routeId);
    const origin = unns(this.id, q.originStationId);
    const dest = unns(this.id, q.destinationStationId);
    const afterMs = q.after ? toMs(q.after) : undefined;
    const dates = q.serviceDate
      ? [normalizeServiceDate(q.serviceDate)]
      : (() => {
          const d = serviceDateFor(afterMs ?? Date.now());
          return [addDays(d, -1), d];
        })();
    const out: Departure[] = [];
    for (const serviceDate of dates) {
      for (const t of this.tripsByRoute.get(rawRoute) ?? []) {
        if (!this.isServiceActive(t.serviceId, serviceDate)) continue;
        const st = this.stopTimes.get(t.id) ?? [];
        const oi = st.findIndex((s) => s.stationId === origin);
        if (oi < 0) continue;
        const di = st.findIndex((s, i) => i > oi && s.stationId === dest);
        if (di < 0) continue;
        const depSec = st[oi].dep ?? st[oi].arr;
        const arrSec = st[di].arr ?? st[di].dep;
        if (depSec == null || arrSec == null) continue;
        const dep = serviceTimeToIso(serviceDate, depSec);
        const arr = serviceTimeToIso(serviceDate, arrSec);
        if (afterMs != null) {
          const departed = toMs(dep) < afterMs;
          if (departed && !(q.includeInProgress && toMs(arr) > afterMs)) continue;
        }
        const terminal = this.stations.get(ns(this.id, st[st.length - 1].stationId));
        out.push({
          id: `${ns(this.id, t.id)}@${serviceDate}:${origin}`,
          tripId: `${ns(this.id, t.id)}@${serviceDate}`,
          routeId: q.routeId,
          originStationId: q.originStationId,
          destinationStationId: q.destinationStationId,
          scheduledDeparture: dep,
          scheduledArrival: arr,
          destinationNameJa: terminal?.nameJa ?? t.headsign,
          destinationNameEn: terminal?.nameEn ?? t.headsign,
          platform: st[oi].platform,
          dataMode: this.baseDataMode,
          trainNumber: t.shortName,
          direction: t.direction,
          serviceDate,
        });
      }
    }
    out.sort((a, b) => toMs(a.scheduledDeparture) - toMs(b.scheduledDeparture));
    return this.decorateDepartures(out.slice(0, q.limit ?? 12));
  }

  /** Hook for subclasses (demo / realtime) to add estimates. */
  protected async decorateDepartures(deps: Departure[]): Promise<Departure[]> {
    if (!this.realtime?.isConfigured()) return deps;
    try {
      const updates = await this.realtime.getTripUpdates();
      return deps.map((d) => {
        const { rawTripId, serviceDate } = this.parseTripId(d.tripId);
        const u =
          updates.get(`${rawTripId}|${serviceDate.replace(/-/g, "")}`) ?? updates.get(rawTripId);
        if (!u) return d;
        const originRaw = unns(this.id, d.originStationId);
        const destRaw = unns(this.id, d.destinationStationId);
        const depDelay = u.stopDelays[originRaw] ?? u.delaySeconds;
        const arrDelay = u.stopDelays[destRaw] ?? u.delaySeconds;
        return {
          ...d,
          dataMode: "live",
          cancelled: u.cancelled || undefined,
          delaySeconds: depDelay,
          estimatedDeparture: depDelay != null ? addSec(d.scheduledDeparture, depDelay) : undefined,
          estimatedArrival: arrDelay != null ? addSec(d.scheduledArrival, arrDelay) : undefined,
        };
      });
    } catch {
      return deps; // realtime failure ⇒ timetable data only
    }
  }

  parseTripId(tripId: string): { rawTripId: string; serviceDate: string } {
    const raw = unns(this.id, tripId);
    const at = raw.lastIndexOf("@");
    if (at < 0) throw new ProviderError("BAD_REQUEST", "Trip id must include a service date");
    return { rawTripId: raw.slice(0, at), serviceDate: normalizeServiceDate(raw.slice(at + 1)) };
  }

  async getTrip(tripId: string): Promise<Trip> {
    await this.ensureLoaded();
    const { rawTripId, serviceDate } = this.parseTripId(tripId);
    const t = this.trips.get(rawTripId);
    if (!t) throw new ProviderError("NOT_FOUND", `Trip not found: ${tripId}`);
    const st = this.stopTimes.get(t.id) ?? [];
    const route = this.routes.get(ns(this.id, t.routeId));
    const terminal = this.stations.get(ns(this.id, st[st.length - 1]?.stationId ?? ""));
    const stops: TripStop[] = st.map((s) => ({
      stationId: ns(this.id, s.stationId),
      sequence: s.seq,
      scheduledArrival: s.arr != null ? serviceTimeToIso(serviceDate, s.arr) : undefined,
      scheduledDeparture: s.dep != null ? serviceTimeToIso(serviceDate, s.dep) : undefined,
      platform: s.platform,
    }));
    return {
      id: tripId,
      routeId: ns(this.id, t.routeId),
      operatorId: route?.operatorId ?? "",
      serviceDate,
      direction: t.direction,
      headsignJa: terminal?.nameJa ?? t.headsign,
      headsignEn: terminal?.nameEn ?? t.headsign,
      trainNumber: t.shortName,
      stops,
      shapeId: t.shapeId,
      dataMode: this.baseDataMode,
    };
  }

  async getRealtimeTrip(tripId: string): Promise<RealtimeTripState | null> {
    await this.ensureLoaded();
    if (!this.realtime?.isConfigured()) return null;
    const { rawTripId, serviceDate } = this.parseTripId(tripId);
    const [updates, positions] = await Promise.all([
      this.realtime.getTripUpdates().catch(() => new Map()),
      this.realtime.getVehiclePositions().catch(() => new Map()),
    ]);
    const key = `${rawTripId}|${serviceDate.replace(/-/g, "")}`;
    const u = updates.get(key) ?? updates.get(rawTripId);
    const v = positions.get(key) ?? positions.get(rawTripId);
    if (!u && !v) return null;
    const st = this.stopTimes.get(rawTripId) ?? [];
    let previousStationId: string | undefined;
    let nextStationId: string | undefined;
    if (v?.stopId) {
      const idx = st.findIndex((s) => s.stopId === v.stopId || s.stationId === v.stopId);
      if (idx >= 0) {
        if (v.status === "STOPPED_AT") previousStationId = ns(this.id, st[idx].stationId);
        else {
          nextStationId = ns(this.id, st[idx].stationId);
          if (idx > 0) previousStationId = ns(this.id, st[idx - 1].stationId);
        }
      }
    }
    const stopDelays: Record<string, number> = {};
    for (const [rawStop, d] of Object.entries(u?.stopDelays ?? {})) {
      const row = st.find((s) => s.stopId === rawStop || s.stationId === rawStop);
      if (row) stopDelays[ns(this.id, row.stationId)] = d as number;
    }
    return {
      tripId,
      timestamp: new Date((v?.timestamp ?? u?.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
      previousStationId,
      nextStationId,
      latitude: v?.latitude,
      longitude: v?.longitude,
      delaySeconds: u?.delaySeconds,
      cancelled: u?.cancelled,
      stopDelays: Object.keys(stopDelays).length ? stopDelays : undefined,
      dataMode: "live",
    };
  }

  async getServiceAlerts(routeId: string): Promise<ServiceAlert[]> {
    await this.ensureLoaded();
    if (!this.realtime?.isConfigured()) return [];
    const raw = unns(this.id, routeId);
    const alerts = await this.realtime.getAlerts().catch(() => []);
    return alerts
      .filter((a) => a.routeIds.length === 0 || a.routeIds.includes(raw))
      .map((a) => ({
        id: ns(this.id, a.id),
        routeId,
        severity: a.severity,
        textJa: a.textJa,
        textEn: a.textEn,
        statusJa: a.headerJa,
        statusEn: a.headerEn,
        dataMode: "live" as const,
      }));
  }

  async getRouteShape(routeId: string, direction = "0"): Promise<RouteShape | null> {
    await this.ensureLoaded();
    const raw = unns(this.id, routeId);
    const trips = this.tripsByRoute.get(raw) ?? [];
    const withShape =
      trips.find((t) => t.direction === direction && t.shapeId && this.shapes.has(t.shapeId)) ??
      trips.find((t) => t.shapeId && this.shapes.has(t.shapeId));
    if (withShape?.shapeId) {
      const coords = this.shapes.get(withShape.shapeId)!;
      return {
        routeId,
        coordinates: withShape.direction === direction ? coords : [...coords].reverse(),
        approximate: false,
        source: `${this.label} shapes.txt`,
      };
    }
    const stations = await this.getStations(routeId);
    const coords = stations
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => [s.longitude!, s.latitude!] as [number, number]);
    if (coords.length < 2) return null;
    return {
      routeId,
      coordinates: direction === "1" ? coords.reverse() : coords,
      approximate: true,
      source: "Approximate route through station coordinates",
    };
  }
}

function addSec(iso: string, s: number): string {
  return new Date(toMs(iso) + s * 1000).toISOString();
}

function buildTranslations(feed: GtfsFeed): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of feed["translations.txt"] ?? []) {
    const lang = (t.language || t.lang || "").toLowerCase();
    if (!lang.startsWith("en")) continue;
    if (t.table_name && t.record_id) {
      m.set(`${t.table_name}|${t.field_name}|${t.record_id}`, t.translation);
    } else if (t.field_value) {
      m.set(`value|${t.field_value}`, t.translation);
    } else if (t.trans_id) {
      // legacy GTFS-JP (v1/v2): trans_id is the Japanese text itself
      m.set(`value|${t.trans_id}`, t.translation);
    }
  }
  return m;
}

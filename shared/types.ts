/**
 * Application-owned railway models. Every provider (ODPT, GTFS, demo, …) normalises its
 * raw payloads into these types. Raw provider payloads never reach UI state.
 *
 * All instants are ISO-8601 strings with an explicit offset (absolute timestamps).
 * Railway "wall clock" values are always interpreted in Asia/Tokyo.
 */

export type DataMode = "live" | "timetable" | "demo" | "offline";

export type ProviderId = "demo" | "gtfs" | "odpt" | "navitime" | "ekispert";

export interface Operator {
  id: string;
  nameJa: string;
  nameEn: string;
  provider?: ProviderId;
}

export interface RailwayRoute {
  id: string;
  operatorId: string;
  nameJa: string;
  nameEn: string;
  color?: string;
  stationIds: string[];
  /** Human labels for the two travel directions, if the source provides them. */
  directions?: RouteDirection[];
}

export interface RouteDirection {
  id: string;
  nameJa: string;
  nameEn: string;
}

export interface Station {
  id: string;
  nameJa: string;
  nameEn: string;
  latitude?: number;
  longitude?: number;
  code?: string;
}

export interface DepartureQuery {
  routeId: string;
  originStationId: string;
  destinationStationId: string;
  /** Japanese service date, YYYY-MM-DD. Defaults to the current service date in Tokyo. */
  serviceDate?: string;
  /** Only return departures at/after this instant (ISO). Trips already en route are included when `includeInProgress`. */
  after?: string;
  includeInProgress?: boolean;
  limit?: number;
}

export interface Departure {
  id: string;
  tripId: string;
  routeId: string;
  originStationId: string;
  destinationStationId: string;
  scheduledDeparture: string;
  estimatedDeparture?: string;
  scheduledArrival: string;
  estimatedArrival?: string;
  destinationNameJa: string;
  destinationNameEn: string;
  platform?: string;
  delaySeconds?: number;
  cancelled?: boolean;
  dataMode: DataMode;
  trainTypeJa?: string;
  trainTypeEn?: string;
  trainNumber?: string;
  direction?: string;
  serviceDate?: string;
}

export interface TripStop {
  stationId: string;
  sequence: number;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  platform?: string;
}

export interface Trip {
  id: string;
  routeId: string;
  operatorId: string;
  serviceDate: string;
  direction?: string;
  headsignJa: string;
  headsignEn: string;
  trainNumber?: string;
  trainTypeJa?: string;
  trainTypeEn?: string;
  stops: TripStop[];
  shapeId?: string;
  dataMode: DataMode;
}

export interface RealtimeTripState {
  tripId: string;
  timestamp: string;
  previousStationId?: string;
  nextStationId?: string;
  /** 0..1, only when the source actually reports it. Never fabricated. */
  progressBetweenStations?: number;
  latitude?: number;
  longitude?: number;
  delaySeconds?: number;
  cancelled?: boolean;
  dataMode: DataMode;
  /** Per-stop delay predictions when the source provides them (GTFS-RT TripUpdates). */
  stopDelays?: Record<string, number>;
}

export interface ServiceAlert {
  id: string;
  routeId: string;
  severity: "info" | "warning" | "severe";
  textJa?: string;
  textEn?: string;
  statusJa?: string;
  statusEn?: string;
  updatedAt?: string;
  dataMode: DataMode;
}

export interface RouteShape {
  routeId: string;
  coordinates: Array<[number, number]>; // [lon, lat]
  /** True when built from station coordinates rather than authoritative geometry. */
  approximate: boolean;
  source: string;
}

export interface RouteMediaManifest {
  routeId: string;
  operatorId: string;
  direction: string;
  originStationId: string;
  destinationStationId: string;

  /**
   * `illustrated` is an application-owned, procedurally drawn route view (no footage).
   * It is used by the demo and as the fallback visualisation.
   */
  video?: {
    provider: "youtube" | "self-hosted" | "illustrated";
    videoId?: string;
    url?: string;
    title: string;
    creator: string;
    sourceUrl: string;
    licenseStatus: "permission-granted" | "platform-embed" | "owned" | "demo";
    attributionRequired: boolean;
    durationSeconds?: number;
  };

  stationMarkers: Array<{
    stationId: string;
    videoTimeSeconds: number;
    arrivalFrameSeconds?: number;
    departureFrameSeconds?: number;
  }>;

  audio?: {
    ambienceUrl?: string;
    announcementPackId?: string;
  };

  tags?: {
    season?: string;
    dayPeriod?: "day" | "evening" | "night";
    weather?: string;
  };
}

export type StationMarker = RouteMediaManifest["stationMarkers"][number];

/** Envelope metadata returned by every /api/japan endpoint. */
export interface ApiMeta {
  dataMode: DataMode;
  source: string;
  fetchedAt: string;
  stale?: boolean;
  notice?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

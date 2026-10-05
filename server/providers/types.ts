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
} from "@shared/types";

/**
 * Provider-independent railway interface. The UI never talks to a provider directly — only
 * the backend registry does, and only through this interface.
 *
 * All ids returned by a provider are namespaced with `${provider.id}:` so the registry can
 * route follow-up requests to the right provider.
 */
export interface RailwayProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** data mode for static (non-realtime) data from this provider */
  readonly baseDataMode: DataMode;

  isEnabled(): boolean;
  /** human readable reason when disabled, e.g. "ODPT_API_KEY is not set" */
  disabledReason(): string | undefined;

  getOperators(): Promise<Operator[]>;
  getRoutes(operatorId?: string): Promise<RailwayRoute[]>;
  getStations(routeId: string): Promise<Station[]>;
  getDepartures(query: DepartureQuery): Promise<Departure[]>;
  getTrip(tripId: string): Promise<Trip>;
  getRealtimeTrip(tripId: string): Promise<RealtimeTripState | null>;
  getServiceAlerts(routeId: string): Promise<ServiceAlert[]>;
  getRouteShape?(routeId: string, direction?: string): Promise<RouteShape | null>;
}

export class ProviderError extends Error {
  constructor(
    public code:
      "NOT_FOUND" | "NOT_CONFIGURED" | "UPSTREAM_UNAVAILABLE" | "UNSUPPORTED" | "BAD_REQUEST",
    message: string,
    public status = code === "NOT_FOUND"
      ? 404
      : code === "BAD_REQUEST"
        ? 400
        : code === "NOT_CONFIGURED"
          ? 503
          : 502,
  ) {
    super(message);
  }
}

export function ns(provider: ProviderId, rawId: string): string {
  return `${provider}:${rawId}`;
}

export function unns(provider: ProviderId, id: string): string {
  const prefix = `${provider}:`;
  if (!id.startsWith(prefix))
    throw new ProviderError("NOT_FOUND", `Unknown id for ${provider}: ${id}`);
  return id.slice(prefix.length);
}

export function providerOf(id: string): string {
  const i = id.indexOf(":");
  return i > 0 ? id.slice(0, i) : "";
}

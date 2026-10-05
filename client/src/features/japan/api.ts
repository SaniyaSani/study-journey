import type {
  ApiMeta,
  ApiResponse,
  Departure,
  Operator,
  RailwayRoute,
  RealtimeTripState,
  RouteMediaManifest,
  RouteShape,
  ServiceAlert,
  Station,
  Trip,
} from "@shared/types";
import type { TrainVideo } from "@shared/video";

/**
 * Browser-side client for the backend's /api/japan endpoints. The browser never talks to
 * railway providers directly and never sees API keys.
 *
 * Successful responses are cached in localStorage so the planner and a running journey can
 * fall back to "cached data · Last updated …" when the network or the backend is down.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
  ) {
    super(message);
  }
}

export interface Fetched<T> {
  data: T;
  meta: ApiMeta;
  /** true when served from the local cache because the request failed */
  fromCache?: boolean;
}

const CACHE_PREFIX = "study-journey:api:";
const BASE = "/api/japan";

function cacheGet<T>(key: string): ApiResponse<T> | null {
  try {
    const t = localStorage.getItem(CACHE_PREFIX + key);
    return t ? (JSON.parse(t) as ApiResponse<T>) : null;
  } catch {
    return null;
  }
}
function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  opts: { timeoutMs?: number; cache?: boolean; signal?: AbortSignal } = {},
): Promise<Fetched<T>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}${qs.toString() ? `?${qs}` : ""}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(
        body?.error?.message ?? `Request failed (${res.status})`,
        body?.error?.code ?? "HTTP",
        res.status,
      );
    }
    if (opts.cache !== false) cacheSet(url, body);
    return body as Fetched<T>;
  } catch (err) {
    // Only network/timeout/5xx failures fall back to cache; 4xx are real answers.
    const status = err instanceof ApiError ? err.status : undefined;
    if (opts.cache !== false && (!status || status >= 500)) {
      const cached = cacheGet<T>(url);
      if (cached) return { ...cached, fromCache: true, meta: { ...cached.meta, stale: true } };
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      (err as Error)?.name === "AbortError"
        ? "The railway service took too long to answer."
        : "Cannot reach the Study Journey server.",
      "NETWORK",
    );
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const japanApi = {
  status: () =>
    apiGet<{
      providers: Array<{
        id: string;
        label: string;
        enabled: boolean;
        reason?: string;
        active: boolean;
      }>;
      activeProvider: string;
    }>("/status"),
  operators: () => apiGet<Operator[]>("/operators"),
  routes: (operatorId?: string) => apiGet<RailwayRoute[]>("/routes", { operatorId }),
  stations: (routeId: string) => apiGet<Station[]>(`/routes/${enc(routeId)}/stations`),
  shape: (routeId: string, direction?: string) =>
    apiGet<RouteShape | null>(`/routes/${enc(routeId)}/shape`, { direction }),
  media: (routeId: string, origin?: string, destination?: string) =>
    apiGet<{ match: RouteMediaManifest | null; available: RouteMediaManifest[] }>(
      `/routes/${enc(routeId)}/media`,
      {
        origin,
        destination,
      },
    ),
  departures: (q: {
    routeId: string;
    origin: string;
    destination: string;
    date?: string;
    after?: string;
    includeInProgress?: boolean;
    limit?: number;
  }) => apiGet<Departure[]>("/departures", q),
  trip: (tripId: string) => apiGet<Trip>(`/trips/${enc(tripId)}`),
  realtime: (tripId: string) =>
    apiGet<RealtimeTripState | null>(
      `/trips/${enc(tripId)}/realtime`,
      {},
      { cache: false, timeoutMs: 8000 },
    ),
  alerts: (routeId: string) => apiGet<ServiceAlert[]>("/service-alerts", { routeId }),
  /** curated route footage catalog (see docs/VIDEO_SYNC.md) */
  videos: () => apiGet<TrainVideo[]>("/videos"),
};

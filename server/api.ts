import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ApiMeta, DataMode, Operator, RailwayRoute } from "@shared/types";
import { isServiceDate, toTokyoIso } from "@shared/time";
import { TtlCache } from "./cache";
import { redact } from "./http";
import type { MediaLibrary } from "./media";
import { VideoCatalog } from "./videos";
import { ProviderError, providerOf, type RailwayProvider } from "./providers/types";
import type { ProviderRegistry } from "./providers/registry";

const id = z
  .string()
  .min(3)
  .max(300)
  .regex(/^[a-z]+:[^\s]+$/, "must be a namespaced id like demo:SK01");

const departuresQuery = z.object({
  routeId: id,
  origin: id,
  destination: id,
  date: z.string().refine(isServiceDate, "date must be YYYY-MM-DD").optional(),
  after: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "after must be an ISO timestamp")
    .optional(),
  includeInProgress: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function meta(provider: RailwayProvider | undefined, extra: Partial<ApiMeta> = {}): ApiMeta {
  return {
    dataMode: (provider?.baseDataMode ?? "offline") as DataMode,
    source: provider?.label ?? "none",
    fetchedAt: toTokyoIso(Date.now()),
    ...extra,
  };
}

export function createJapanApi(
  registry: ProviderRegistry,
  media: MediaLibrary,
  videos: VideoCatalog = VideoCatalog.bundled(),
): Hono {
  const r = new Hono();

  /** Curated route footage. Matching to a journey happens in shared/videoMatcher.ts. */
  r.get("/videos", (c) =>
    c.json({
      data: videos.videos,
      meta: {
        dataMode: "offline",
        source: "Curated footage catalog",
        fetchedAt: toTokyoIso(Date.now()),
        notice: videos.warnings.join(" · ") || undefined,
      } satisfies ApiMeta,
    }),
  );
  const realtimeCache = new TtlCache(1000);

  r.get("/status", async (c: Context) => {
    return c.json({
      data: {
        providers: registry.status(),
        activeProvider: registry.activeId,
        mediaWarnings: media.warnings,
      },
      meta: meta(registry.providers.find((p) => p.id === registry.activeId)),
    });
  });

  r.get("/operators", async (c: Context) => {
    const notices: string[] = [];
    const ops: Operator[] = [];
    // active provider first
    const ordered = [...registry.enabled()].sort((a, b) =>
      a.id === registry.activeId ? -1 : b.id === registry.activeId ? 1 : 0,
    );
    for (const p of ordered) {
      try {
        ops.push(...(await p.getOperators()).map((o) => ({ ...o, provider: p.id })));
      } catch (err) {
        notices.push(`${p.label}: ${redact((err as Error).message)}`);
      }
    }
    const active = registry.providers.find((p) => p.id === registry.activeId);
    return c.json({ data: ops, meta: meta(active, { notice: notices.join(" · ") || undefined }) });
  });

  r.get("/routes", async (c: Context) => {
    const operatorId = c.req.query("operatorId") ? id.parse(c.req.query("operatorId")!) : undefined;
    const providers = operatorId ? [registry.forId(operatorId)] : registry.enabled();
    const routes: RailwayRoute[] = [];
    const notices: string[] = [];
    for (const p of providers) {
      try {
        routes.push(...(await p.getRoutes(operatorId)));
      } catch (err) {
        if (operatorId) throw err;
        notices.push(`${p.label}: ${redact((err as Error).message)}`);
      }
    }
    return c.json({
      data: routes,
      meta: meta(providers[0], { notice: notices.join(" · ") || undefined }),
    });
  });

  r.get("/routes/:routeId", async (c: Context) => {
    const routeId = id.parse(c.req.param("routeId"));
    const p = registry.forId(routeId);
    const route = (await p.getRoutes()).find((x) => x.id === routeId);
    if (!route) throw new ProviderError("NOT_FOUND", `Route not found: ${routeId}`);
    return c.json({ data: route, meta: meta(p) });
  });

  r.get("/routes/:routeId/stations", async (c: Context) => {
    const routeId = id.parse(c.req.param("routeId"));
    const p = registry.forId(routeId);
    return c.json({ data: await p.getStations(routeId), meta: meta(p) });
  });

  r.get("/routes/:routeId/shape", async (c: Context) => {
    const routeId = id.parse(c.req.param("routeId"));
    const direction = c.req.query("direction")
      ? z.string().max(120).parse(c.req.query("direction")!)
      : undefined;
    const p = registry.forId(routeId);
    const shape = p.getRouteShape ? await p.getRouteShape(routeId, direction) : null;
    return c.json({ data: shape, meta: meta(p) });
  });

  r.get("/routes/:routeId/media", async (c: Context) => {
    const routeId = id.parse(c.req.param("routeId"));
    const origin = c.req.query("origin") ? id.parse(c.req.query("origin")!) : undefined;
    const destination = c.req.query("destination")
      ? id.parse(c.req.query("destination")!)
      : undefined;
    const match = media.match(routeId, origin, destination);
    return c.json({
      data: { match, available: media.forRoute(routeId) },
      meta: {
        dataMode: "offline",
        source: "Route media manifest",
        fetchedAt: toTokyoIso(Date.now()),
        notice: match ? undefined : "No route video has been added for this journey yet.",
      } satisfies ApiMeta,
    });
  });

  r.get("/departures", async (c: Context) => {
    const q = departuresQuery.parse(c.req.query());
    if (q.origin === q.destination)
      throw new ProviderError("BAD_REQUEST", "Origin and destination must differ");
    const pids = new Set([providerOf(q.routeId), providerOf(q.origin), providerOf(q.destination)]);
    if (pids.size !== 1)
      throw new ProviderError("BAD_REQUEST", "Route and stations must come from the same provider");
    const p = registry.forId(q.routeId);
    const deps = await p.getDepartures({
      routeId: q.routeId,
      originStationId: q.origin,
      destinationStationId: q.destination,
      serviceDate: q.date,
      after: q.after,
      includeInProgress: q.includeInProgress === "true",
      limit: q.limit,
    });
    const live = deps.some((d) => d.dataMode === "live");
    return c.json({ data: deps, meta: meta(p, live ? { dataMode: "live" } : {}) });
  });

  r.get("/trips/:tripId", async (c: Context) => {
    const tripId = id.parse(c.req.param("tripId"));
    const p = registry.forId(tripId);
    const trip = await p.getTrip(tripId);
    return c.json({ data: trip, meta: meta(p, { dataMode: trip.dataMode }) });
  });

  r.get("/trips/:tripId/realtime", async (c: Context) => {
    const tripId = id.parse(c.req.param("tripId"));
    const p = registry.forId(tripId);
    try {
      // demo realtime is computed from the clock and must not be cached
      const result =
        p.id === "demo"
          ? { value: await p.getRealtimeTrip(tripId), fetchedAt: Date.now(), stale: false }
          : await realtimeCache.getOrLoad(`rt:${tripId}`, 20_000, () => p.getRealtimeTrip(tripId));
      const rt = result.value;
      return c.json({
        data: rt,
        meta: meta(p, {
          dataMode: rt ? rt.dataMode : p.baseDataMode,
          fetchedAt: toTokyoIso(result.fetchedAt),
          stale: result.stale || undefined,
          notice: rt
            ? result.stale
              ? "Showing the last known train state."
              : undefined
            : "No live position for this train — following the timetable.",
        }),
      });
    } catch (err) {
      return c.json({
        data: null,
        meta: meta(p, {
          dataMode: p.baseDataMode,
          notice: `Live data unavailable — following the timetable. (${redact((err as Error).message)})`,
        }),
      });
    }
  });

  r.get("/service-alerts", async (c: Context) => {
    const routeId = id.parse(c.req.query("routeId") ?? "");
    const p = registry.forId(routeId);
    try {
      return c.json({ data: await p.getServiceAlerts(routeId), meta: meta(p) });
    } catch (err) {
      return c.json({
        data: [],
        meta: meta(p, {
          notice: `Service status unavailable (${redact((err as Error).message)})`,
        }),
      });
    }
  });

  // structured errors
  r.onError((err, c) => {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid request parameters",
            details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          },
        },
        400,
      );
    }
    if (err instanceof ProviderError) {
      return c.json(
        { error: { code: err.code, message: redact(err.message) } },
        err.status as 400 | 404 | 502 | 503,
      );
    }
    console.error("[api]", redact(String((err as Error)?.stack ?? err)));
    return c.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, 500);
  });

  return r;
}

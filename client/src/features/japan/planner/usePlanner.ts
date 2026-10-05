import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiMeta, Departure, Operator, RailwayRoute, Station } from "@shared/types";
import { buildTimeline } from "@shared/journey";
import { parseRailwayTime, serviceDateFor, serviceTimeToIso, toMs, tokyoParts } from "@shared/time";
import { uid } from "../../../store/studyStore";
import { ApiError, japanApi } from "../api";
import type { BadgeStatus } from "../components";
import { buildScenicTrip, type JourneyKind, type JourneySession } from "../session";

/**
 * All route-selection state and data loading (operators → lines → stations → departures),
 * independent of presentation. Used by <RouteSelector/> and <LiveTimetable/>.
 */

export type Load<T> = {
  state: "idle" | "loading" | "ok" | "error";
  data?: T;
  meta?: ApiMeta;
  error?: string;
  fromCache?: boolean;
};

export function departureStatus(d: Departure, fromCache?: boolean): BadgeStatus {
  if (d.cancelled) return "cancelled";
  if ((d.delaySeconds ?? 0) >= 60) return "delayed";
  if (fromCache) return "offline";
  if (d.dataMode === "live") return "live";
  if (d.dataMode === "demo") return "demo";
  if (d.dataMode === "offline") return "offline";
  return "timetable";
}

const pad = (n: number) => String(n).padStart(2, "0");

export type When = "now" | "later";

export function usePlanner() {
  const [operators, setOperators] = useState<Load<Operator[]>>({ state: "loading" });
  const [routes, setRoutes] = useState<Load<RailwayRoute[]>>({ state: "loading" });
  const [routeId, setRouteId] = useState("");
  const [stations, setStations] = useState<Load<Station[]>>({ state: "idle" });
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [scenic, setScenic] = useState(false);
  const nowParts = tokyoParts(Date.now());
  const [date, setDate] = useState(serviceDateFor(Date.now()));
  const [fromTime, setFromTime] = useState(`${pad(nowParts.hour)}:${pad(nowParts.minute)}`);
  const [departures, setDepartures] = useState<Load<Departure[]>>({ state: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pending, setPending] = useState<{
    routeId: string;
    origin: string;
    destination: string;
  } | null>(null);

  const kind: JourneyKind = scenic ? "scenic" : when === "now" ? "ride" : "plan";

  useEffect(() => {
    Promise.all([japanApi.operators(), japanApi.routes()])
      .then(([o, r]) => {
        setOperators({ state: "ok", data: o.data, meta: o.meta, fromCache: o.fromCache });
        // keep the operator order (active provider first)
        const order = new Map(o.data.map((op, i) => [op.id, i]));
        const sorted = [...r.data].sort(
          (a, b) => (order.get(a.operatorId) ?? 99) - (order.get(b.operatorId) ?? 99),
        );
        setRoutes({ state: "ok", data: sorted, meta: r.meta, fromCache: r.fromCache });
        setRouteId((cur) => cur || sorted[0]?.id || "");
      })
      .catch((e: Error) => {
        setOperators({ state: "error", error: e.message });
        setRoutes({ state: "error", error: e.message });
      });
  }, []);

  useEffect(() => {
    if (!routeId) return;
    setStations({ state: "loading" });
    japanApi
      .stations(routeId)
      .then((r) => {
        setStations({ state: "ok", data: r.data, meta: r.meta, fromCache: r.fromCache });
        const want = pending?.routeId === routeId ? pending : null;
        setOrigin(want?.origin ?? r.data[0]?.id ?? "");
        setDestination(want?.destination ?? r.data[r.data.length - 1]?.id ?? "");
        if (want) setPending(null);
      })
      .catch((e: Error) => setStations({ state: "error", error: e.message }));
    // pending is read once when the line's stations arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const route = routes.data?.find((r) => r.id === routeId);
  const operator = operators.data?.find((o) => o.id === route?.operatorId);
  const stationList = useMemo(() => stations.data ?? [], [stations.data]);
  const oi = stationList.findIndex((s) => s.id === origin);
  const di = stationList.findIndex((s) => s.id === destination);
  const directionIndex = oi >= 0 && di >= 0 ? (oi < di ? 0 : 1) : 0;
  const direction = route?.directions?.[directionIndex];

  const after = useMemo(() => {
    if (when === "now") return new Date().toISOString();
    const secs = parseRailwayTime(fromTime);
    return secs == null ? undefined : serviceTimeToIso(date, secs < 4 * 3600 ? secs + 86400 : secs);
    // refreshTick re-evaluates "now"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, date, fromTime, refreshTick]);

  useEffect(() => {
    if (!routeId || !origin || !destination || origin === destination) {
      setDepartures({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setDepartures((d) => ({ ...d, state: "loading" }));
    japanApi
      .departures({
        routeId,
        origin,
        destination,
        date: when === "later" ? date : undefined,
        after,
        includeInProgress: when === "now",
        limit: 8,
      })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setDepartures({ state: "ok", data: r.data, meta: r.meta, fromCache: r.fromCache });
        setSelected((cur) => {
          if (cur && r.data.some((d) => d.id === cur && !d.cancelled)) return cur;
          const upcoming = r.data.find(
            (d) => !d.cancelled && toMs(d.estimatedDeparture ?? d.scheduledDeparture) >= Date.now(),
          );
          return (upcoming ?? r.data.find((d) => !d.cancelled))?.id ?? null;
        });
      })
      .catch(
        (e: Error) => !ctrl.signal.aborted && setDepartures({ state: "error", error: e.message }),
      );
    return () => ctrl.abort();
  }, [routeId, origin, destination, when, date, after]);

  // the board refreshes like a station display
  useEffect(() => {
    if (when !== "now") return;
    const t = setInterval(() => setRefreshTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [when]);

  const chosen = departures.data?.find((d) => d.id === selected) ?? null;

  /** select a line and a section in one step (used by the route collage) */
  const selectSection = useCallback(
    (nextRouteId: string, nextOrigin: string, nextDestination: string) => {
      if (nextRouteId === routeId) {
        setOrigin(nextOrigin);
        setDestination(nextDestination);
      } else {
        setPending({ routeId: nextRouteId, origin: nextOrigin, destination: nextDestination });
        setRouteId(nextRouteId);
      }
    },
    [routeId],
  );

  const swap = useCallback(() => {
    setOrigin(destination);
    setDestination(origin);
  }, [origin, destination]);

  const start = useCallback(async (): Promise<JourneySession | null> => {
    if (!route || !operator) return null;
    setStarting(true);
    setStartError(null);
    try {
      const [media, shape] = await Promise.all([
        japanApi.media(route.id, origin, destination).catch(() => null),
        japanApi.shape(route.id, direction?.id).catch(() => null),
      ]);
      const manifest = media?.data.match ?? null;
      let trip;
      let departure: Departure | undefined;
      if (kind === "scenic") {
        let template = null;
        if (!manifest) {
          const deps = await japanApi.departures({
            routeId: route.id,
            origin,
            destination,
            limit: 1,
            date: serviceDateFor(Date.now()),
          });
          template = deps.data[0] ? (await japanApi.trip(deps.data[0].tripId)).data : null;
        }
        trip = buildScenicTrip({
          route,
          originStationId: origin,
          destinationStationId: destination,
          manifest,
          template,
          startMs: Date.now() + 20_000,
        });
      } else {
        if (!chosen) {
          setStartError("Choose a departure first.");
          return null;
        }
        departure = chosen;
        trip = (await japanApi.trip(chosen.tripId)).data;
      }
      buildTimeline(trip, origin, destination); // validates direction & times
      return {
        id: uid(),
        kind,
        operator,
        route,
        stations: stationList,
        trip,
        originStationId: origin,
        destinationStationId: destination,
        departure,
        manifest,
        shape: shape?.data ?? null,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      setStartError(
        e instanceof ApiError || e instanceof Error ? e.message : "Could not start the journey.",
      );
      return null;
    } finally {
      setStarting(false);
    }
  }, [route, operator, origin, destination, direction, kind, chosen, stationList]);

  return {
    operators,
    routes,
    route,
    operator,
    routeId,
    setRouteId,
    stations,
    stationList,
    origin,
    setOrigin,
    destination,
    setDestination,
    swap,
    selectSection,
    direction,
    when,
    setWhen,
    scenic,
    setScenic,
    kind,
    date,
    setDate,
    fromTime,
    setFromTime,
    departures,
    selected,
    setSelected,
    chosen,
    start,
    starting,
    startError,
  };
}

export type Planner = ReturnType<typeof usePlanner>;

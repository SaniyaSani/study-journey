import type { DataMode, RealtimeTripState, Trip } from "./types";
import { toMs } from "./time";

/**
 * A journey is the part of a trip between the chosen origin and destination, expressed as
 * absolute instants (ms). Estimated times include known delays.
 */
export interface TimelineStop {
  stationId: string;
  /** index within the journey (0 = origin) */
  index: number;
  scheduledArrival: number;
  scheduledDeparture: number;
  estimatedArrival: number;
  estimatedDeparture: number;
  platform?: string;
}

export interface JourneyTimeline {
  tripId: string;
  routeId: string;
  serviceDate: string;
  stops: TimelineStop[];
  cancelled: boolean;
  delaySeconds: number;
}

export class JourneyError extends Error {
  constructor(
    public code: "ORIGIN_NOT_ON_TRIP" | "DESTINATION_NOT_ON_TRIP" | "WRONG_DIRECTION" | "NO_TIMES",
    message: string,
  ) {
    super(message);
  }
}

export function buildTimeline(
  trip: Trip,
  originStationId: string,
  destinationStationId: string,
): JourneyTimeline {
  const oi = trip.stops.findIndex((s) => s.stationId === originStationId);
  if (oi < 0)
    throw new JourneyError("ORIGIN_NOT_ON_TRIP", "The origin is not served by this train.");
  const di = trip.stops.findIndex((s, i) => i > oi && s.stationId === destinationStationId);
  if (di < 0) {
    const anyDest = trip.stops.some((s) => s.stationId === destinationStationId);
    throw anyDest
      ? new JourneyError("WRONG_DIRECTION", "This train runs in the opposite direction.")
      : new JourneyError("DESTINATION_NOT_ON_TRIP", "The destination is not served by this train.");
  }
  const stops: TimelineStop[] = [];
  for (const [idx, s] of trip.stops.slice(oi, di + 1).entries()) {
    const arr = s.scheduledArrival ?? s.scheduledDeparture;
    const dep = s.scheduledDeparture ?? s.scheduledArrival;
    if (!arr || !dep) continue; // passing points without times are skipped
    const a = toMs(arr);
    const d = Math.max(toMs(dep), a);
    stops.push({
      stationId: s.stationId,
      index: idx,
      scheduledArrival: a,
      scheduledDeparture: d,
      estimatedArrival: a,
      estimatedDeparture: d,
      platform: s.platform,
    });
  }
  if (stops.length < 2) throw new JourneyError("NO_TIMES", "This train has no usable times.");
  stops.forEach((s, i) => (s.index = i));
  return {
    tripId: trip.id,
    routeId: trip.routeId,
    serviceDate: trip.serviceDate,
    stops,
    cancelled: false,
    delaySeconds: 0,
  };
}

/** Applies a realtime state's delay / cancellation to a timeline (pure; returns a copy). */
export function applyRealtime(
  timeline: JourneyTimeline,
  rt: RealtimeTripState | null | undefined,
): JourneyTimeline {
  const stops = timeline.stops.map((s) => ({
    ...s,
    estimatedArrival: s.scheduledArrival,
    estimatedDeparture: s.scheduledDeparture,
  }));
  if (!rt) return { ...timeline, stops, delaySeconds: 0, cancelled: false };

  const delay = rt.delaySeconds ?? 0;
  const prevIdx = rt.previousStationId
    ? stops.findIndex((s) => s.stationId === rt.previousStationId)
    : -1;

  for (const s of stops) {
    const perStop = rt.stopDelays?.[s.stationId];
    if (perStop != null) {
      s.estimatedArrival = s.scheduledArrival + perStop * 1000;
      s.estimatedDeparture = s.scheduledDeparture + perStop * 1000;
      continue;
    }
    // stops already left behind keep their history; the current/last-reached stop and all
    // later stops carry the reported delay
    if (prevIdx >= 0 && s.index < prevIdx) continue;
    s.estimatedArrival = s.scheduledArrival + delay * 1000;
    s.estimatedDeparture = s.scheduledDeparture + delay * 1000;
  }
  // keep monotonic order
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.estimatedDeparture < s.estimatedArrival) s.estimatedDeparture = s.estimatedArrival;
    const next = stops[i + 1];
    if (next && next.estimatedArrival < s.estimatedDeparture) {
      next.estimatedArrival = s.estimatedDeparture;
    }
  }
  return { ...timeline, stops, delaySeconds: delay, cancelled: Boolean(rt.cancelled) };
}

export type JourneyPhase = "before-departure" | "dwelling" | "running" | "arrived" | "cancelled";

export interface JourneyProgress {
  phase: JourneyPhase;
  /** stop the train is at, or last departed from */
  currentIndex: number;
  /** next stop the train will arrive at (== currentIndex when arrived) */
  nextIndex: number;
  /** 0..1 within the current segment; 0 while dwelling / before departure */
  segmentFraction: number;
  /** true when the position is only known as "between A and B" (no precise location) */
  positionApproximate: boolean;
  /** 0..1 of total journey time */
  overallFraction: number;
  remainingSeconds: number;
  secondsToNext: number;
  delaySeconds: number;
  source: "realtime" | "timetable";
}

export function computeProgress(
  timeline: JourneyTimeline,
  nowInput: number | Date | string,
  rt?: RealtimeTripState | null,
): JourneyProgress {
  const now = toMs(nowInput);
  const stops = timeline.stops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const total = Math.max(1, last.estimatedArrival - first.estimatedDeparture);
  const overallFraction = clamp((now - first.estimatedDeparture) / total, 0, 1);
  const remainingSeconds = Math.max(0, (last.estimatedArrival - now) / 1000);
  const base = {
    overallFraction,
    remainingSeconds,
    delaySeconds: timeline.delaySeconds,
    positionApproximate: false,
    source: "timetable" as "realtime" | "timetable",
  };

  if (timeline.cancelled) {
    return {
      ...base,
      phase: "cancelled",
      currentIndex: 0,
      nextIndex: 0,
      segmentFraction: 0,
      secondsToNext: 0,
    };
  }

  // Realtime station position (when inside this journey) takes precedence over the clock.
  if (rt && (rt.previousStationId || rt.nextStationId)) {
    const pi = rt.previousStationId
      ? stops.findIndex((s) => s.stationId === rt.previousStationId)
      : -1;
    const ni = rt.nextStationId ? stops.findIndex((s) => s.stationId === rt.nextStationId) : -1;
    if (pi >= 0 && ni === pi + 1) {
      const a = stops[pi];
      const b = stops[ni];
      const timeFraction =
        (now - a.estimatedDeparture) / Math.max(1, b.estimatedArrival - a.estimatedDeparture);
      const fraction =
        rt.progressBetweenStations != null
          ? clamp(rt.progressBetweenStations, 0, 1)
          : clamp(timeFraction, 0.02, 0.98);
      return {
        ...base,
        source: "realtime",
        positionApproximate: rt.progressBetweenStations == null && rt.latitude == null,
        phase: "running",
        currentIndex: pi,
        nextIndex: ni,
        segmentFraction: fraction,
        secondsToNext: Math.max(0, (b.estimatedArrival - now) / 1000),
      };
    }
    if (pi >= 0 && !rt.nextStationId) {
      if (pi === stops.length - 1) {
        return arrived(base, stops.length - 1, "realtime");
      }
      return {
        ...base,
        source: "realtime",
        phase: pi === 0 && now < first.estimatedDeparture ? "before-departure" : "dwelling",
        currentIndex: pi,
        nextIndex: pi + 1,
        segmentFraction: 0,
        secondsToNext: Math.max(0, (stops[pi + 1].estimatedArrival - now) / 1000),
      };
    }
    // otherwise: realtime position is outside this journey → fall through to timetable
  }

  if (now < first.estimatedDeparture) {
    return {
      ...base,
      phase: "before-departure",
      currentIndex: 0,
      nextIndex: 1,
      segmentFraction: 0,
      secondsToNext: (stops[1].estimatedArrival - now) / 1000,
    };
  }
  if (now >= last.estimatedArrival) return arrived(base, stops.length - 1, "timetable");

  for (let i = 0; i < stops.length - 1; i++) {
    const s = stops[i];
    const n = stops[i + 1];
    if (now >= s.estimatedArrival && now < s.estimatedDeparture) {
      return {
        ...base,
        phase: i === 0 ? "before-departure" : "dwelling",
        currentIndex: i,
        nextIndex: i + 1,
        segmentFraction: 0,
        secondsToNext: (n.estimatedArrival - now) / 1000,
      };
    }
    if (now >= s.estimatedDeparture && now < n.estimatedArrival) {
      return {
        ...base,
        phase: "running",
        currentIndex: i,
        nextIndex: i + 1,
        segmentFraction: clamp(
          (now - s.estimatedDeparture) / Math.max(1, n.estimatedArrival - s.estimatedDeparture),
          0,
          1,
        ),
        secondsToNext: (n.estimatedArrival - now) / 1000,
      };
    }
  }
  // dwelling at an intermediate stop whose arrival == previous segment end
  const idx = stops.findIndex((s) => now >= s.estimatedArrival && now < s.estimatedDeparture);
  if (idx > 0) {
    return {
      ...base,
      phase: "dwelling",
      currentIndex: idx,
      nextIndex: Math.min(idx + 1, stops.length - 1),
      segmentFraction: 0,
      secondsToNext: (stops[Math.min(idx + 1, stops.length - 1)].estimatedArrival - now) / 1000,
    };
  }
  return arrived(base, stops.length - 1, "timetable");
}

function arrived(
  base: Omit<
    JourneyProgress,
    "phase" | "currentIndex" | "nextIndex" | "segmentFraction" | "secondsToNext"
  >,
  lastIndex: number,
  source: "realtime" | "timetable",
): JourneyProgress {
  return {
    ...base,
    source,
    overallFraction: 1,
    remainingSeconds: 0,
    phase: "arrived",
    currentIndex: lastIndex,
    nextIndex: lastIndex,
    segmentFraction: 0,
    secondsToNext: 0,
  };
}

/** Stations completely passed (departed) — used for the summary. */
export function stationsPassed(progress: JourneyProgress): number {
  if (progress.phase === "arrived") return progress.currentIndex + 1;
  if (progress.phase === "running") return progress.currentIndex + 1;
  return progress.currentIndex;
}

export const REALTIME_MAX_AGE_SECONDS = 120;

export function isRealtimeFresh(
  rt: RealtimeTripState | null | undefined,
  now: number,
  maxAgeSeconds = REALTIME_MAX_AGE_SECONDS,
): rt is RealtimeTripState {
  if (!rt) return false;
  const ts = toMs(rt.timestamp);
  if (Number.isNaN(ts)) return false;
  return now - ts <= maxAgeSeconds * 1000;
}

export type JourneyStatus = "live" | "timetable" | "delayed" | "cancelled" | "demo" | "offline";

/**
 * Status badge for a running journey. Demo data is NEVER upgraded to "live".
 * Live → timetable fallback happens automatically when realtime data goes stale.
 */
export function resolveJourneyStatus(input: {
  tripDataMode: DataMode;
  realtime: RealtimeTripState | null | undefined;
  now: number;
  offline: boolean;
  delaySeconds?: number;
  cancelled?: boolean;
}): { status: JourneyStatus; dataMode: DataMode; usingRealtime: boolean } {
  const fresh = isRealtimeFresh(input.realtime, input.now);
  if (input.cancelled) {
    return { status: "cancelled", dataMode: input.tripDataMode, usingRealtime: fresh };
  }
  if (input.tripDataMode === "demo") {
    return {
      status: (input.delaySeconds ?? 0) >= 60 ? "delayed" : "demo",
      dataMode: "demo",
      usingRealtime: fresh,
    };
  }
  if (input.offline && !fresh)
    return { status: "offline", dataMode: "offline", usingRealtime: false };
  if (fresh && input.realtime!.dataMode === "live") {
    return {
      status: (input.delaySeconds ?? 0) >= 60 ? "delayed" : "live",
      dataMode: "live",
      usingRealtime: true,
    };
  }
  return { status: "timetable", dataMode: "timetable", usingRealtime: false };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

import type { Station } from "./types";
import type { JourneyProgress, JourneyTimeline } from "./journey";
import { clamp } from "./journey";
import type { JourneyVideoSegment, TrainVideo, VideoStationMarker } from "./video";

/**
 * Station-based synchronisation between two timelines:
 *
 *   TIMETABLE  Tokyo 17:24 ─ Shinagawa 17:32 ─ … ─ Kamakura 18:21   (source of truth)
 *   VIDEO      Tokyo 00:34 ─ Shinagawa 08:32 ─ … ─ Kamakura 59:00   (visualisation)
 *
 * Inside each station-to-station segment we interpolate piecewise-linearly. We never map
 * "journey % × video duration": trains dwell, videos have intros, cuts and different speeds.
 * All functions here are pure and take absolute times in ms.
 */

export interface ScheduledStop {
  stationId: string;
  stationName: string;
  /** effective arrival (scheduled + known delay), ms */
  arrival: number;
  /** effective departure, ms (== arrival when the train does not dwell) */
  departure: number;
}

export interface StopFrames {
  /** video second where the train stops at the station */
  arrival: number;
  /** video second where it starts moving again (== arrival when no dwell is recorded) */
  departure: number;
  interpolated: boolean;
}

export function stopsFromTimeline(
  timeline: JourneyTimeline,
  stations: Map<string, Station>,
): ScheduledStop[] {
  return timeline.stops.map((s) => ({
    stationId: s.stationId,
    stationName: stations.get(s.stationId)?.nameEn ?? s.stationId,
    arrival: s.estimatedArrival,
    departure: s.estimatedDeparture,
  }));
}

/** "Minato-Chūō" → "minatochuo"; used to match stations across providers. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bstation\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function markerMatches(m: VideoStationMarker, stop: ScheduledStop): boolean {
  if (m.stationId && m.stationId === stop.stationId) return true;
  return normalizeName(m.stationName) === normalizeName(stop.stationName);
}

const arrFrame = (m: VideoStationMarker) => m.arrivalTime ?? m.videoTime;
const depFrame = (m: VideoStationMarker) => Math.max(m.departureTime ?? m.videoTime, arrFrame(m));

/**
 * Locates journey stops in the footage. Returns the covered stop range and one frame pair per
 * covered stop. Stops inside the range without a marker are interpolated by scheduled time.
 * Returns null if fewer than two stops can be located, or if the footage runs the other way.
 */
export function resolveVideoFrames(
  stops: ScheduledStop[],
  markers: VideoStationMarker[],
): { fromStopIndex: number; toStopIndex: number; frames: StopFrames[] } | null {
  const known: Array<{ i: number; m: VideoStationMarker }> = [];
  stops.forEach((s, i) => {
    const m = markers.find((x) => markerMatches(x, s));
    if (m) known.push({ i, m });
  });
  if (known.length < 2) return null;
  for (let k = 1; k < known.length; k++) {
    // footage must move forward in the same direction as the journey
    if (arrFrame(known[k].m) <= depFrame(known[k - 1].m)) return null;
  }
  const from = known[0].i;
  const to = known[known.length - 1].i;
  const frames: StopFrames[] = [];
  for (let i = from; i <= to; i++) {
    const exact = known.find((k) => k.i === i);
    if (exact) {
      frames.push({
        arrival: arrFrame(exact.m),
        departure: depFrame(exact.m),
        interpolated: false,
      });
      continue;
    }
    const before = [...known].reverse().find((k) => k.i < i)!;
    const after = known.find((k) => k.i > i)!;
    const t0 = stops[before.i].departure;
    const t1 = stops[after.i].arrival;
    const f0 = depFrame(before.m);
    const f1 = arrFrame(after.m);
    const r = clamp((stops[i].arrival - t0) / Math.max(1, t1 - t0), 0, 1);
    const f = f0 + r * (f1 - f0);
    frames.push({ arrival: f, departure: f, interpolated: true });
  }
  return { fromStopIndex: from, toStopIndex: to, frames };
}

export type SyncPhase = "before" | "dwell" | "moving" | "after";

export interface VideoPosition {
  videoTime: number;
  /** the picture should stand still (waiting at a platform, or arrived) */
  hold: boolean;
  phase: SyncPhase;
  /** stop indices (into `stops`) of the current segment; equal while dwelling */
  fromStop: number;
  toStop: number;
}

/**
 * The core mapping: journey time → video time, for stops[i] ↔ frames[i].
 *
 * - moving between A and B: depFrame(A) + p · (arrFrame(B) − depFrame(A)), p = time fraction
 * - dwelling at a station: the recorded dwell is aligned so the video leaves the platform
 *   exactly when the train departs; before that the picture waits at the arrival frame
 * - before the first stop's departure: waiting at the origin
 * - after the last arrival: holds on the final station
 */
export function getVideoTimeForJourneyTime(
  t: number,
  stops: ScheduledStop[],
  frames: StopFrames[],
): VideoPosition {
  const n = Math.min(stops.length, frames.length);
  const last = n - 1;
  const dwell = (i: number): VideoPosition => {
    const untilDep = (stops[i].departure - t) / 1000;
    const aligned = frames[i].departure - untilDep;
    const videoTime = clamp(aligned, frames[i].arrival, frames[i].departure);
    return {
      videoTime,
      hold: aligned <= frames[i].arrival || aligned >= frames[i].departure,
      phase: i === 0 && t < stops[0].departure ? "before" : "dwell",
      fromStop: i,
      toStop: i,
    };
  };
  if (t < stops[0].departure) return dwell(0);
  if (t >= stops[last].arrival) {
    return {
      videoTime: frames[last].arrival,
      hold: true,
      phase: "after",
      fromStop: last,
      toStop: last,
    };
  }
  for (let i = 0; i < last; i++) {
    if (t >= stops[i].arrival && t < stops[i].departure) return dwell(i);
    if (t >= stops[i].departure && t < stops[i + 1].arrival) {
      const p = (t - stops[i].departure) / Math.max(1, stops[i + 1].arrival - stops[i].departure);
      return {
        videoTime: frames[i].departure + p * (frames[i + 1].arrival - frames[i].departure),
        hold: false,
        phase: "moving",
        fromStop: i,
        toStop: i + 1,
      };
    }
  }
  return dwell(last);
}

/** Inverse mapping: video time → journey time (used by calibration preview & debugging). */
export function getJourneyTimeForVideoTime(
  v: number,
  stops: ScheduledStop[],
  frames: StopFrames[],
): number {
  const n = Math.min(stops.length, frames.length);
  if (v <= frames[0].departure) {
    return stops[0].departure - (frames[0].departure - v) * 1000;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (v >= a.arrival && v <= a.departure) {
      return Math.max(stops[i].arrival, stops[i].departure - (a.departure - v) * 1000);
    }
    if (v > a.departure && v < b.arrival) {
      const p = (v - a.departure) / Math.max(1e-6, b.arrival - a.departure);
      return stops[i].departure + p * (stops[i + 1].arrival - stops[i].departure);
    }
  }
  const lastF = frames[n - 1];
  if (v <= lastF.departure) {
    return Math.max(stops[n - 1].arrival, stops[n - 1].departure - (lastF.departure - v) * 1000);
  }
  return stops[n - 1].arrival + (v - lastF.arrival) * 1000;
}

/* ---------------- multi-segment journeys ---------------- */

export interface CandidateFootage {
  video: TrainVideo;
  fromStopIndex: number;
  toStopIndex: number;
  frames: StopFrames[];
}

export function candidateFor(video: TrainVideo, stops: ScheduledStop[]): CandidateFootage | null {
  if (video.calibration !== "calibrated") return null;
  const r = resolveVideoFrames(stops, video.stationMarkers);
  return r ? { video, ...r } : null;
}

/**
 * Greedy coverage: from the first uncovered stop, take the (pre-ranked) candidate that reaches
 * furthest; continue from the station where it ends. Boundaries are always stations.
 */
export function planSegments(
  stops: ScheduledStop[],
  ranked: CandidateFootage[],
): JourneyVideoSegment[] {
  const segs: JourneyVideoSegment[] = [];
  let i = 0;
  const last = stops.length - 1;
  while (i < last) {
    let best: CandidateFootage | null = null;
    for (const c of ranked) {
      if (c.fromStopIndex <= i && c.toStopIndex > i && (!best || c.toStopIndex > best.toStopIndex))
        best = c;
    }
    if (!best) {
      // gap: jump to the next stop where some footage starts
      const nextStart = ranked
        .map((c) => c.fromStopIndex)
        .filter((s) => s > i)
        .sort((a, b) => a - b)[0];
      if (nextStart === undefined) break;
      i = nextStart;
      continue;
    }
    const offset = i - best.fromStopIndex;
    const to = best.toStopIndex;
    segs.push({
      video: best.video,
      fromStopIndex: i,
      toStopIndex: to,
      fromStation: stops[i].stationName,
      toStation: stops[to].stationName,
      frames: best.frames.slice(offset, offset + (to - i) + 1),
    });
    i = to;
  }
  return segs;
}

export interface ActiveFootage {
  segmentIndex: number;
  position: VideoPosition;
}

/**
 * Which segment (if any) shows the train at time t, and where in that video.
 * At a boundary station the next segment takes over on arrival (its own frames show the stop),
 * which hides the cut inside the station dwell. Returns null when this part of the journey has
 * no footage.
 */
export function activeFootageAt(
  t: number,
  stops: ScheduledStop[],
  segments: JourneyVideoSegment[],
): ActiveFootage | null {
  if (!segments.length) return null;
  const pos = getVideoTimeForJourneyTime(
    t,
    stops,
    stops.map(() => ({ arrival: 0, departure: 0, interpolated: true })),
  );
  // index of the station the train is at, or last departed from
  const at = pos.fromStop;
  const moving = pos.phase === "moving";
  const idx = segments.findIndex((s) =>
    moving
      ? s.fromStopIndex <= at && at + 1 <= s.toStopIndex
      : s.fromStopIndex <= at && at < s.toStopIndex,
  );
  const segIndex =
    idx >= 0
      ? idx
      : segments.findIndex(
          (s) => s.toStopIndex === at && (pos.phase === "after" || pos.phase === "dwell"),
        );
  if (segIndex < 0) return null;
  const seg = segments[segIndex];
  const local = stops.slice(seg.fromStopIndex, seg.toStopIndex + 1);
  return { segmentIndex: segIndex, position: getVideoTimeForJourneyTime(t, local, seg.frames) };
}

/* ---------------- journey state for the UI ---------------- */

export type RideState =
  "WAITING" | "DEPARTING" | "MOVING" | "ARRIVING" | "AT_STATION" | "ARRIVED" | "CANCELLED";

export function rideState(
  progress: JourneyProgress,
  timeline: JourneyTimeline,
  now: number,
  arrivingWindowSec = 60,
  departingWindowSec = 20,
): RideState {
  switch (progress.phase) {
    case "cancelled":
      return "CANCELLED";
    case "arrived":
      return "ARRIVED";
    case "before-departure": {
      const dep = timeline.stops[0].estimatedDeparture;
      return (dep - now) / 1000 <= departingWindowSec ? "DEPARTING" : "WAITING";
    }
    case "dwelling": {
      const dep = timeline.stops[progress.currentIndex].estimatedDeparture;
      return (dep - now) / 1000 <= departingWindowSec ? "DEPARTING" : "AT_STATION";
    }
    case "running":
      return progress.secondsToNext <= arrivingWindowSec ? "ARRIVING" : "MOVING";
  }
}

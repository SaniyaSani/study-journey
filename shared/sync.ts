import type { StationMarker } from "./types";
import type { JourneyProgress, JourneyTimeline } from "./journey";
import { clamp } from "./journey";
import { toMs } from "./time";

/**
 * Video ↔ train synchronisation.
 *
 * Recorded footage rarely has the same duration as today's train, so we never map the
 * whole video linearly onto the journey. Instead every station has a marker in the video,
 * and inside each segment we interpolate between the previous station's departure frame
 * and the next station's arrival frame. The controller then nudges playback rate for small
 * drift and only seeks for large drift (with a cooldown), so the picture never jumps
 * constantly.
 */

export interface ResolvedMarker {
  stationId: string;
  arrivalFrame: number;
  departureFrame: number;
  /** true when no marker existed and the frame was interpolated from neighbours */
  interpolated: boolean;
}

/**
 * Maps each journey stop to video frames. Stops without a marker are interpolated from the
 * nearest known neighbours (by scheduled time). Returns null when fewer than two stops of
 * this journey can be located in the video.
 */
export function resolveMarkers(
  timeline: JourneyTimeline,
  markers: StationMarker[],
): ResolvedMarker[] | null {
  const byStation = new Map(markers.map((m) => [m.stationId, m]));
  const known = timeline.stops
    .map((s, i) => ({ i, m: byStation.get(s.stationId) }))
    .filter((x): x is { i: number; m: StationMarker } => Boolean(x.m));
  if (known.length < 2) return null;

  // markers must increase along the direction of travel
  for (let k = 1; k < known.length; k++) {
    if (frameOf(known[k].m, "arr") <= frameOf(known[k - 1].m, "dep")) return null;
  }

  return timeline.stops.map((stop, i) => {
    const m = byStation.get(stop.stationId);
    if (m) {
      return {
        stationId: stop.stationId,
        arrivalFrame: frameOf(m, "arr"),
        departureFrame: Math.max(frameOf(m, "dep"), frameOf(m, "arr")),
        interpolated: false,
      };
    }
    const before = [...known].reverse().find((k) => k.i < i);
    const after = known.find((k) => k.i > i);
    let frame: number;
    if (before && after) {
      const t0 = timeline.stops[before.i].scheduledDeparture;
      const t1 = timeline.stops[after.i].scheduledArrival;
      const f0 = frameOf(before.m, "dep");
      const f1 = frameOf(after.m, "arr");
      const r = clamp((stop.scheduledArrival - t0) / Math.max(1, t1 - t0), 0, 1);
      frame = f0 + r * (f1 - f0);
    } else if (before) {
      frame = frameOf(before.m, "dep");
    } else {
      frame = frameOf(after!.m, "arr");
    }
    return {
      stationId: stop.stationId,
      arrivalFrame: frame,
      departureFrame: frame,
      interpolated: true,
    };
  });
}

function frameOf(m: StationMarker, kind: "arr" | "dep"): number {
  if (kind === "arr") return m.arrivalFrameSeconds ?? m.videoTimeSeconds;
  return m.departureFrameSeconds ?? m.videoTimeSeconds;
}

export interface DesiredPosition {
  /** where the video should be right now (seconds) */
  time: number;
  /** true when the video should stand still (station dwell / before departure / arrived) */
  hold: boolean;
  /** nominal playback rate (1 in real time; 2/4 in simulation) */
  rate?: number;
}

export function desiredVideoPosition(
  timeline: JourneyTimeline,
  progress: JourneyProgress,
  markers: ResolvedMarker[],
  nowInput: number | Date | string,
): DesiredPosition {
  const now = toMs(nowInput);
  const stops = timeline.stops;
  switch (progress.phase) {
    case "cancelled":
    case "arrived": {
      const m = markers[markers.length - 1];
      return { time: m.arrivalFrame, hold: true };
    }
    case "before-departure":
    case "dwelling": {
      const i = progress.currentIndex;
      const m = markers[i];
      const stop = stops[i];
      // Align the recorded dwell so the video leaves the platform exactly when the train
      // departs: wait (hold) at the arrival frame, then play the recorded dwell.
      const untilDeparture = (stop.estimatedDeparture - now) / 1000;
      const aligned = m.departureFrame - untilDeparture;
      const t = clamp(aligned, m.arrivalFrame, m.departureFrame);
      return { time: t, hold: aligned <= m.arrivalFrame || aligned >= m.departureFrame };
    }
    case "running": {
      const a = markers[progress.currentIndex];
      const b = markers[progress.nextIndex];
      return {
        time: a.departureFrame + progress.segmentFraction * (b.arrivalFrame - a.departureFrame),
        hold: false,
      };
    }
  }
}

export interface SyncConfig {
  /** drift (s) below which nothing is done */
  deadband: number;
  /** drift (s) above which we seek (when fine playback-rate control is available) */
  seekThreshold: number;
  /** drift (s) above which we seek when the player only supports coarse rates */
  coarseSeekThreshold: number;
  minRate: number;
  maxRate: number;
  /** seconds of drift corrected per second of extra/less playback (gain = 1/horizon) */
  correctionHorizon: number;
  /** min ms between two seeks */
  seekCooldownMs: number;
  /** drift at which an active rate correction is considered finished */
  settleBand: number;
}

/**
 * Real recorded footage (YouTube etc.): checked every few seconds,
 * < 1.5 s nothing · 1.5–5 s gentle rate 0.95–1.05 · > 5 s seek.
 */
export const REAL_FOOTAGE_SYNC_CONFIG: SyncConfig = {
  deadband: 1.5,
  seekThreshold: 5,
  coarseSeekThreshold: 5,
  minRate: 0.95,
  maxRate: 1.05,
  correctionHorizon: 40,
  seekCooldownMs: 6000,
  settleBand: 0.5,
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  deadband: 3,
  seekThreshold: 15,
  coarseSeekThreshold: 8,
  minRate: 0.92,
  maxRate: 1.08,
  correctionHorizon: 30,
  seekCooldownMs: 8000,
  settleBand: 1,
};

export interface PlayerSnapshot {
  currentTime: number;
  playing: boolean;
  rate: number;
  supportsFineRate: boolean;
  duration?: number;
  /** waiting for data (counts as playing: the sync engine must not fight buffering) */
  buffering?: boolean;
}

export interface SyncCommand {
  seekTo?: number;
  setRate?: number;
  play?: boolean;
  pause?: boolean;
  drift: number;
  mode: "in-sync" | "adjusting-rate" | "seeking" | "holding";
}

export class SyncController {
  private lastSeekAt = -Infinity;
  private adjusting = false;

  constructor(private config: SyncConfig = DEFAULT_SYNC_CONFIG) {}

  setConfig(config: SyncConfig): void {
    this.config = config;
  }

  /** forget the seek cooldown, e.g. after the tab was hidden or the viewer resumed playback */
  forceNextSeek(): void {
    this.lastSeekAt = -Infinity;
  }

  reset(): void {
    this.lastSeekAt = -Infinity;
    this.adjusting = false;
  }

  step(desired: DesiredPosition, player: PlayerSnapshot, nowMs: number): SyncCommand {
    const c = this.config;
    const target =
      player.duration != null && player.duration > 0
        ? clamp(desired.time, 0, Math.max(0, player.duration - 0.5))
        : Math.max(0, desired.time);
    const drift = target - player.currentTime; // >0: video is behind the train
    const abs = Math.abs(drift);
    const seekLimit = player.supportsFineRate ? c.seekThreshold : c.coarseSeekThreshold;
    const canSeek = nowMs - this.lastSeekAt >= c.seekCooldownMs;
    const cmd: SyncCommand = { drift, mode: "in-sync" };
    const base = desired.rate ?? 1;

    if (abs > seekLimit && canSeek) {
      this.lastSeekAt = nowMs;
      this.adjusting = false;
      cmd.seekTo = target;
      cmd.mode = "seeking";
      if (player.rate !== base) cmd.setRate = base;
      if (desired.hold) cmd.pause = player.playing || undefined;
      else if (!player.playing) cmd.play = true;
      return cmd;
    }

    if (desired.hold) {
      cmd.mode = "holding";
      if (player.rate !== base) cmd.setRate = base;
      if (drift > 0.75) {
        // still approaching the platform in the recording: keep playing until we reach it
        if (!player.playing) cmd.play = true;
      } else if (player.playing) {
        cmd.pause = true;
      }
      this.adjusting = false;
      return cmd;
    }

    if (!player.playing) cmd.play = true;

    if (abs > c.deadband || (this.adjusting && abs > c.settleBand)) {
      if (player.supportsFineRate) {
        const rate = round3(base * clamp(1 + drift / c.correctionHorizon, c.minRate, c.maxRate));
        this.adjusting = true;
        cmd.mode = "adjusting-rate";
        if (Math.abs(rate - player.rate) > 0.004) cmd.setRate = rate;
        return cmd;
      }
      // coarse-rate players: tolerate drift until the seek threshold
      if (player.rate !== base) cmd.setRate = base;
      return cmd;
    }

    this.adjusting = false;
    if (player.rate !== base) cmd.setRate = base;
    return cmd;
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Builds markers from the timetable itself (used by the illustrated fallback view). */
export function markersFromTimeline(timeline: JourneyTimeline): StationMarker[] {
  const t0 = timeline.stops[0].scheduledArrival;
  return timeline.stops.map((s) => ({
    stationId: s.stationId,
    videoTimeSeconds: (s.scheduledArrival - t0) / 1000,
    arrivalFrameSeconds: (s.scheduledArrival - t0) / 1000,
    departureFrameSeconds: (s.scheduledDeparture - t0) / 1000,
  }));
}

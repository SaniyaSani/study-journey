import { tokyoParts } from "./time";
import {
  candidateFor,
  normalizeName,
  planSegments,
  type CandidateFootage,
  type ScheduledStop,
} from "./journeySync";
import type { RecordingPeriod, TrainVideo, VideoPlan } from "./video";

/**
 * Chooses footage for a selected real train from the CURATED catalog (never a live search).
 * Ranking: line → direction → coverage of the journey → service type → time of day → season.
 * Functional correctness always beats aesthetics.
 */

export interface JourneyContext {
  routeId: string;
  /** English line name from the data provider, e.g. "Yokosuka Line" */
  lineName: string;
  /** all station names of the line in route order (for direction checks) */
  routeStationNames: string[];
  stops: ScheduledStop[];
  departureMs: number;
  /** e.g. "Local", "Rapid" when the provider knows it */
  serviceType?: string;
  season?: string;
}

/** JST time-of-day bucket: 06–10 morning, 10–16 day, 16–19 sunset, 19–06 night. */
export function periodForTime(ms: number): RecordingPeriod {
  const h = tokyoParts(ms).hour;
  if (h >= 6 && h < 10) return "morning";
  if (h >= 10 && h < 16) return "day";
  if (h >= 16 && h < 19) return "sunset";
  return "night";
}

const ORDER: RecordingPeriod[] = ["morning", "day", "sunset", "night"];
function periodDistance(a: RecordingPeriod, b: RecordingPeriod): number {
  const d = Math.abs(ORDER.indexOf(a) - ORDER.indexOf(b));
  return Math.min(d, 4 - d);
}

const lineTokens = (s: string) =>
  normalizeName(s.replace(/\b(jr|line|main|rapid|local|east|west|central)\b/gi, " "));

export function lineMatch(video: TrainVideo, ctx: JourneyContext): "id" | "name" | null {
  if (video.lineIds.includes(ctx.routeId)) return "id";
  const route = lineTokens(ctx.lineName);
  if (!route) return null;
  return video.lineNames.some((n) => {
    const t = lineTokens(n);
    return t.length > 2 && (route.includes(t) || t.includes(route));
  })
    ? "name"
    : null;
}

/** +1 same direction as the journey, −1 opposite, 0 unknown. */
export function directionMatch(video: TrainVideo, ctx: JourneyContext): number {
  const names = ctx.routeStationNames.map(normalizeName);
  const vf = names.indexOf(normalizeName(video.coverage.from));
  const vt = names.indexOf(normalizeName(video.coverage.to));
  const jf = names.indexOf(normalizeName(ctx.stops[0].stationName));
  const jt = names.indexOf(normalizeName(ctx.stops[ctx.stops.length - 1].stationName));
  if (vf < 0 || vt < 0 || jf < 0 || jt < 0 || vf === vt || jf === jt) return 0;
  return Math.sign(vt - vf) === Math.sign(jt - jf) ? 1 : -1;
}

export interface ScoredCandidate {
  candidate: CandidateFootage;
  score: number;
  reasons: string[];
}

export function scoreCandidate(c: CandidateFootage, ctx: JourneyContext): ScoredCandidate | null {
  const lm = lineMatch(c.video, ctx);
  if (!lm) return null;
  const reasons: string[] = [];
  let score = lm === "id" ? 50 : 35;
  reasons.push(lm === "id" ? "exact line" : "same line (by name)");
  // frames resolved ⇒ markers run in the journey's direction
  score += 20;
  reasons.push("correct direction");
  const covered = c.toStopIndex - c.fromStopIndex + 1;
  score += covered * 4;
  if (c.fromStopIndex === 0 && c.toStopIndex === ctx.stops.length - 1) {
    score += 25;
    reasons.push("covers the whole journey");
  }
  if (
    ctx.serviceType &&
    c.video.serviceTypes.some((s) => normalizeName(s) === normalizeName(ctx.serviceType!))
  ) {
    score += 10;
    reasons.push("same service type");
  }
  if (c.video.recordingPeriod) {
    const d = periodDistance(c.video.recordingPeriod, periodForTime(ctx.departureMs));
    score += [6, 2, 0][d] ?? 0;
    if (d === 0) reasons.push("same time of day");
  }
  if (ctx.season && c.video.season === ctx.season) score += 1;
  return { candidate: c, score, reasons };
}

export function findBestVideoForJourney(ctx: JourneyContext, catalog: TrainVideo[]): VideoPlan {
  const scored = catalog
    .map((v) => candidateFor(v, ctx.stops))
    .filter((c): c is CandidateFootage => Boolean(c))
    .map((c) => scoreCandidate(c, ctx))
    .filter((s): s is ScoredCandidate => Boolean(s))
    .sort((a, b) => b.score - a.score);
  const segments = planSegments(
    ctx.stops,
    scored.map((s) => s.candidate),
  );
  const uncalibrated = catalog.filter(
    (v) => v.calibration !== "calibrated" && lineMatch(v, ctx) && directionMatch(v, ctx) >= 0,
  );
  const last = ctx.stops.length - 1;
  const coverage = segments.length
    ? {
        fromStopIndex: segments[0].fromStopIndex,
        toStopIndex: segments[segments.length - 1].toStopIndex,
        fromStation: segments[0].fromStation,
        toStation: segments[segments.length - 1].toStation,
      }
    : null;
  const contiguous = segments.every(
    (s, i) => i === 0 || s.fromStopIndex === segments[i - 1].toStopIndex,
  );
  const whole = Boolean(
    coverage && coverage.fromStopIndex === 0 && coverage.toStopIndex === last && contiguous,
  );
  const note = whole
    ? segments.length > 1
      ? `Footage from ${segments.length} recordings, joined at stations.`
      : "Footage covers the whole journey."
    : coverage
      ? `Video coverage: ${coverage.fromStation} → ${coverage.toStation} only.`
      : uncalibrated.length
        ? "Footage exists for this line but has not been calibrated yet."
        : "No recorded footage for this journey yet.";
  return { segments, coverage, coversWholeJourney: whole, uncalibrated, note };
}

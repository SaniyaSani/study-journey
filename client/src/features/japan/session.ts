import type {
  Departure,
  Operator,
  RailwayRoute,
  RouteMediaManifest,
  RouteShape,
  Station,
  Trip,
  TripStop,
} from "@shared/types";
import { serviceDateFor, toMs, toTokyoIso } from "@shared/time";

export type JourneyKind = "ride" | "plan" | "scenic";

export interface JourneySession {
  id: string;
  kind: JourneyKind;
  operator: Operator;
  route: RailwayRoute;
  stations: Station[];
  trip: Trip;
  originStationId: string;
  destinationStationId: string;
  departure?: Departure;
  manifest: RouteMediaManifest | null;
  shape: RouteShape | null;
  createdAt: string;
}

export type StudyModeKind = "off" | "25" | "45" | "next" | "dest";

export interface StudyProgressState {
  focusedSeconds: number;
  /** focus counter value when the current study mode was chosen */
  modeStartFocus: number;
  mode: StudyModeKind;
  /** station index the "until next station" target refers to */
  modeTargetIndex?: number;
  paused: boolean;
  currentTaskId: string | null;
  maxDelaySeconds: number;
  lastTickAt: number | null;
}

const DEFAULT_STUDY: StudyProgressState = {
  focusedSeconds: 0,
  modeStartFocus: 0,
  mode: "dest",
  paused: false,
  currentTaskId: null,
  maxDelaySeconds: 0,
  lastTickAt: null,
};

const ACTIVE_KEY = "study-journey:active-journey";
const STUDY_KEY = (id: string) => `study-journey:journey-study:${id}`;
const ANNOUNCED_KEY = (id: string) => `study-journey:announced:${id}`;

function ls(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function saveActiveJourney(s: JourneySession | null): void {
  try {
    if (s) ls()?.setItem(ACTIVE_KEY, JSON.stringify(s));
    else ls()?.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadActiveJourney(): JourneySession | null {
  try {
    const t = ls()?.getItem(ACTIVE_KEY);
    return t ? (JSON.parse(t) as JourneySession) : null;
  } catch {
    return null;
  }
}

export function loadStudyProgress(id: string): StudyProgressState {
  try {
    const t = ls()?.getItem(STUDY_KEY(id));
    if (t) return { ...DEFAULT_STUDY, ...(JSON.parse(t) as Partial<StudyProgressState>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_STUDY };
}

export function saveStudyProgress(id: string, s: StudyProgressState): void {
  try {
    ls()?.setItem(STUDY_KEY(id), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadAnnounced(id: string): Set<string> {
  try {
    const t = ls()?.getItem(ANNOUNCED_KEY(id));
    return new Set(t ? (JSON.parse(t) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveAnnounced(id: string, ids: Set<string>): void {
  try {
    ls()?.setItem(ANNOUNCED_KEY(id), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function clearJourneyStorage(id: string): void {
  try {
    ls()?.removeItem(STUDY_KEY(id));
    ls()?.removeItem(ANNOUNCED_KEY(id));
    ls()?.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Scenic focus: a journey driven only by the recorded route (no real train tracking).
 * The schedule is the recording's own station markers, starting `leadSeconds` from now.
 * When a route has no media, a template trip's relative running times are used instead.
 */
export function buildScenicTrip(input: {
  route: RailwayRoute;
  originStationId: string;
  destinationStationId: string;
  manifest: RouteMediaManifest | null;
  template: Trip | null;
  startMs: number;
}): Trip {
  const { route, originStationId, destinationStationId, manifest, template, startMs } = input;
  let stops: TripStop[] = [];
  const markers = manifest?.stationMarkers ?? [];
  const oi = markers.findIndex((m) => m.stationId === originStationId);
  const di = markers.findIndex((m) => m.stationId === destinationStationId);
  if (oi >= 0 && di > oi) {
    const leg = markers.slice(oi, di + 1);
    const base = leg[0].departureFrameSeconds ?? leg[0].videoTimeSeconds;
    stops = leg.map((m, i) => {
      const arr = (m.arrivalFrameSeconds ?? m.videoTimeSeconds) - base;
      const dep = (m.departureFrameSeconds ?? m.videoTimeSeconds) - base;
      return {
        stationId: m.stationId,
        sequence: i + 1,
        scheduledArrival: toTokyoIso(startMs + Math.max(0, i === 0 ? 0 : arr) * 1000),
        scheduledDeparture: toTokyoIso(startMs + Math.max(0, i === 0 ? 0 : dep) * 1000),
      };
    });
  } else if (template) {
    const ti = template.stops.findIndex((s) => s.stationId === originStationId);
    const tj = template.stops.findIndex((s, i) => i > ti && s.stationId === destinationStationId);
    if (ti >= 0 && tj > ti) {
      const leg = template.stops.slice(ti, tj + 1);
      const t0 = toMs(leg[0].scheduledDeparture ?? leg[0].scheduledArrival!);
      stops = leg.map((s, i) => ({
        stationId: s.stationId,
        sequence: i + 1,
        scheduledArrival: toTokyoIso(
          startMs + (toMs(s.scheduledArrival ?? s.scheduledDeparture!) - t0),
        ),
        scheduledDeparture: toTokyoIso(
          startMs + (toMs(s.scheduledDeparture ?? s.scheduledArrival!) - t0),
        ),
      }));
      stops[0].scheduledArrival = stops[0].scheduledDeparture;
    }
  }
  if (stops.length < 2)
    throw new Error("This route has no recorded view or timetable to build a scenic journey from.");
  const last = route.stationIds.includes(destinationStationId)
    ? destinationStationId
    : stops[stops.length - 1].stationId;
  return {
    id: `scenic:${route.id}:${originStationId}>${destinationStationId}:${startMs}`,
    routeId: route.id,
    operatorId: route.operatorId,
    serviceDate: serviceDateFor(startMs),
    headsignJa: last,
    headsignEn: last,
    stops,
    dataMode: "offline",
  };
}

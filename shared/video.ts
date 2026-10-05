/**
 * Route footage model. A TrainVideo is a recording of (part of) a real railway line in one
 * direction. Footage is NEVER live: it is a synchronised visualisation of the timetable.
 */

export type VideoProviderId = "youtube" | "self-hosted" | "illustrated";

export type RecordingPeriod = "morning" | "day" | "sunset" | "night";

export type CalibrationStatus =
  /** station markers verified against the footage — usable for synchronised rides */
  | "calibrated"
  /** real footage whose station timestamps have not been measured yet */
  | "needs-calibration";

export interface VideoStationMarker {
  /** namespaced station id (e.g. "odpt:odpt.Station:JR-East.Yokosuka.Tokyo") when known */
  stationId?: string;
  /** English station name — used to match stations across data providers */
  stationName: string;
  /** seconds into the video where the train stops at (or passes) the station */
  videoTime: number;
  /** optional: frame where the train comes to a stop */
  arrivalTime?: number;
  /** optional: frame where the train starts moving again */
  departureTime?: number;
}

export interface TrainVideo {
  id: string;
  provider: VideoProviderId;
  /** provider id (YouTube video id) */
  videoId?: string;
  /** self-hosted file URL */
  url?: string;
  title: string;
  /** channel / author */
  creator: string;
  sourceUrl: string;
  /** how the footage may be used */
  licenseStatus: "platform-embed" | "permission-granted" | "owned" | "demo";
  /** embedding checked by a human (YouTube embedding can be disabled by the owner) */
  embedStatus: "verified" | "unverified" | "not-applicable";
  railwayOperator: string;
  /** namespaced route ids this footage belongs to (any provider) */
  lineIds: string[];
  /** English line names used to match routes from other providers, e.g. "Yokosuka" */
  lineNames: string[];
  direction: "outbound" | "inbound" | string;
  /** first and last station visible in the footage (English names) */
  coverage: { from: string; to: string };
  serviceTypes: string[];
  /** usable part of the video (intro/outro excluded) */
  videoStartSeconds: number;
  videoEndSeconds?: number;
  durationSeconds?: number;
  recordingPeriod?: RecordingPeriod;
  season?: string;
  weather?: string;
  sceneryTags?: string[];
  calibration: CalibrationStatus;
  /** station markers in travel order (empty until calibrated) */
  stationMarkers: VideoStationMarker[];
  notes?: string;
}

/** One continuous piece of footage used for part of a journey. */
export interface JourneyVideoSegment {
  video: TrainVideo;
  /** journey stop indices covered by this segment (inclusive) */
  fromStopIndex: number;
  toStopIndex: number;
  fromStation: string;
  toStation: string;
  /** resolved video frames for each covered stop (same length as covered stops) */
  frames: Array<{ arrival: number; departure: number; interpolated: boolean }>;
}

export interface VideoPlan {
  segments: JourneyVideoSegment[];
  /** stop index range that has footage (null when none) */
  coverage: {
    fromStopIndex: number;
    toStopIndex: number;
    fromStation: string;
    toStation: string;
  } | null;
  coversWholeJourney: boolean;
  /** footage that matches the line but cannot be synchronised yet */
  uncalibrated: TrainVideo[];
  /** short human explanation for the UI */
  note: string;
}

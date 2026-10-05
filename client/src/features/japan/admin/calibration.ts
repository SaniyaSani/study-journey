import type { RecordingPeriod, TrainVideo, VideoStationMarker } from "@shared/video";

/** Pure helpers for the calibration tool (unit-tested). */

/** Accepts a bare 11-char id or any common YouTube URL form. Returns null when unsure. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return idOrNull(u.pathname.slice(1));
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return idOrNull(u.searchParams.get("v")!);
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
const idOrNull = (s: string) => (/^[\w-]{11}$/.test(s) ? s : null);

/** "1:02:03.5", "62:03", "125.25", "2m5s" → seconds */
export function parseTimecode(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const parts = s.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function formatTimecode(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export interface CalibrationDraft {
  id: string;
  provider: "youtube" | "self-hosted";
  videoId?: string;
  url?: string;
  title: string;
  creator: string;
  sourceUrl: string;
  railwayOperator: string;
  lineIds: string[];
  lineNames: string[];
  direction: string;
  serviceTypes: string[];
  videoStartSeconds: number;
  videoEndSeconds?: number;
  recordingPeriod?: RecordingPeriod;
  season?: string;
  weather?: string;
  embedStatus: "verified" | "unverified";
  markers: VideoStationMarker[];
  notes?: string;
}

/** markers sorted by time; problems listed so the editor can show them */
export function validateMarkers(markers: VideoStationMarker[]): string[] {
  const out: string[] = [];
  const at = (m: VideoStationMarker) => m.arrivalTime ?? m.videoTime;
  const dt = (m: VideoStationMarker) => m.departureTime ?? m.videoTime;
  markers.forEach((m, i) => {
    if (m.arrivalTime != null && m.departureTime != null && m.departureTime < m.arrivalTime) {
      out.push(`${m.stationName}: departure is before arrival.`);
    }
    if (i > 0 && at(m) <= dt(markers[i - 1])) {
      out.push(`${m.stationName}: comes before ${markers[i - 1].stationName} in the video.`);
    }
  });
  if (markers.length < 2) out.push("At least two stations are needed to synchronise.");
  return out;
}

export function sortMarkers(markers: VideoStationMarker[]): VideoStationMarker[] {
  return [...markers].sort(
    (a, b) => (a.arrivalTime ?? a.videoTime) - (b.arrivalTime ?? b.videoTime),
  );
}

/** The catalog entry exactly as it goes into server/data/videos/catalog.json */
export function toCatalogEntry(d: CalibrationDraft): TrainVideo {
  const markers: VideoStationMarker[] = d.markers.map((m) => ({
    ...(m.stationId ? { stationId: m.stationId } : {}),
    stationName: m.stationName,
    videoTime: round1(m.videoTime),
    ...(m.arrivalTime != null ? { arrivalTime: round1(m.arrivalTime) } : {}),
    ...(m.departureTime != null ? { departureTime: round1(m.departureTime) } : {}),
  }));
  const ok = validateMarkers(markers).length === 0;
  return JSON.parse(
    JSON.stringify({
      id: d.id,
      provider: d.provider,
      videoId: d.provider === "youtube" ? d.videoId : undefined,
      url: d.provider === "self-hosted" ? d.url : undefined,
      title: d.title,
      creator: d.creator,
      sourceUrl: d.sourceUrl,
      licenseStatus: d.provider === "youtube" ? "platform-embed" : "permission-granted",
      embedStatus: d.embedStatus,
      railwayOperator: d.railwayOperator,
      lineIds: d.lineIds,
      lineNames: d.lineNames,
      direction: d.direction,
      coverage: {
        from: markers[0]?.stationName ?? "",
        to: markers[markers.length - 1]?.stationName ?? "",
      },
      serviceTypes: d.serviceTypes,
      videoStartSeconds: d.videoStartSeconds,
      videoEndSeconds: d.videoEndSeconds,
      recordingPeriod: d.recordingPeriod,
      season: d.season,
      weather: d.weather,
      calibration: ok ? "calibrated" : "needs-calibration",
      stationMarkers: markers,
      notes: d.notes,
    }),
  ) as TrainVideo;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

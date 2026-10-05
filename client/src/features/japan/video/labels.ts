import type { RideState } from "@shared/journeySync";
import type { DataMode } from "@shared/types";
import type { TrainVideo } from "@shared/video";

/**
 * What the picture is, said plainly. Footage is never "live": LIVE is only ever said about
 * train data that comes from a real-time feed.
 */
export function footageLabel(
  video: TrainVideo | null,
  source: DataMode | "scenic",
  realClock: boolean,
): string {
  if (!video) return "";
  if (video.provider === "illustrated") {
    return source === "demo"
      ? "ILLUSTRATED VIEW · DEMO LINE · SYNCHRONIZED TO THE TIMETABLE"
      : "ILLUSTRATED VIEW · SYNCHRONIZED TO THE TIMETABLE";
  }
  const realTimetable = realClock && (source === "timetable" || source === "live");
  const base = realTimetable
    ? "REAL ROUTE FOOTAGE · SYNCHRONIZED TO TODAY'S TIMETABLE"
    : "RECORDED TRAIN VIEW · SYNCHRONIZED JOURNEY";
  return source === "live" && realClock ? `${base} · LIVE TRAIN DATA` : base;
}

export const RIDE_STATE_TEXT: Record<RideState, { en: string; ja: string }> = {
  WAITING: { en: "WAITING TO DEPART", ja: "発車待ち" },
  DEPARTING: { en: "DEPARTING", ja: "発車" },
  MOVING: { en: "MOVING", ja: "走行中" },
  ARRIVING: { en: "ARRIVING", ja: "まもなく到着" },
  AT_STATION: { en: "AT STATION", ja: "停車中" },
  ARRIVED: { en: "ARRIVED", ja: "到着" },
  CANCELLED: { en: "CANCELLED", ja: "運休" },
};

export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

import type { DataMode, Station } from "@shared/types";
import { formatLocalClock, formatTokyoClock, userIsOnTokyoTime, userTimeZone } from "@shared/time";
import type { JourneyStatus } from "@shared/journey";

export type BadgeStatus = JourneyStatus | "scenic";

const BADGE_TEXT: Record<BadgeStatus, string> = {
  live: "Live",
  timetable: "Timetable",
  delayed: "Delayed",
  cancelled: "Cancelled",
  demo: "Demo",
  offline: "Offline",
  scenic: "Scenic",
};

const BADGE_HELP: Record<BadgeStatus, string> = {
  live: "Position and delays come from a real-time railway feed.",
  timetable: "Following the published timetable; no live position is available right now.",
  delayed: "The train is running late.",
  cancelled: "This service has been cancelled.",
  demo: "Demo railway data — a fictional line, not real trains.",
  offline: "No connection — following the last known timetable.",
  scenic: "Scenic focus — recorded route only, no train tracking.",
};

export function StatusBadge({
  status,
  delaySeconds,
}: {
  status: BadgeStatus;
  delaySeconds?: number;
}) {
  const mins = Math.round((delaySeconds ?? 0) / 60);
  return (
    <span className={`badge badge-${status}`} title={BADGE_HELP[status]}>
      <span className="badge-dot" aria-hidden="true" />
      {BADGE_TEXT[status]}
      {status === "delayed" && mins > 0 ? ` +${mins} min` : ""}
      <span className="sr-only"> — {BADGE_HELP[status]}</span>
    </span>
  );
}

/** Japan time, with the user's local time underneath when it differs. */
export function JapanTime({
  iso,
  showLocal,
  strike,
}: {
  iso: string;
  showLocal: boolean;
  strike?: boolean;
}) {
  const local = showLocal && !userIsOnTokyoTime(Date.parse(iso));
  return (
    <span className="jtime">
      <time dateTime={iso} className={strike ? "strike" : undefined}>
        {formatTokyoClock(iso)}
      </time>
      <span className="jtime-zone"> JST</span>
      {local && (
        <span className="jtime-local">
          {formatLocalClock(iso)} {shortZone()}
        </span>
      )}
    </span>
  );
}

function shortZone(): string {
  const tz = userTimeZone();
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

export function routeViewLabel(source: DataMode | "scenic", view: "video" | "illustrated"): string {
  const train =
    source === "live"
      ? "Live train data"
      : source === "demo"
        ? "Demo railway data"
        : source === "offline"
          ? "Offline · timetable"
          : source === "scenic"
            ? "No train tracking"
            : "Timetable data";
  const v = view === "video" ? "Recorded route view" : "Illustrated route view";
  return `${train} · ${v}`;
}

export function stationName(stations: Map<string, Station>, id: string | undefined) {
  const s = id ? stations.get(id) : undefined;
  return { ja: s?.nameJa ?? "—", en: s?.nameEn ?? "—" };
}

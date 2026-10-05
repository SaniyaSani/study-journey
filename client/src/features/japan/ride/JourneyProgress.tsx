import { formatDuration, formatTokyoClock } from "@shared/time";
import { Label } from "../../../design/ui";
import type { Journey } from "./useJourney";

/** ━━━━━●━━━━ — the whole ride on one printed line. */
export function JourneyProgress({ j }: { j: Journey }) {
  const { timeline, progress, journeyStations } = j;
  const t0 = timeline.stops[0].estimatedDeparture;
  const t1 = timeline.stops[timeline.stops.length - 1].estimatedArrival;
  const pos = (ms: number) => ((ms - t0) / Math.max(1, t1 - t0)) * 100;
  const pct = progress.overallFraction * 100;
  return (
    <div className="jp">
      <div className="jp-end">
        <Label en={progress.phase === "before-departure" ? "Departs" : "Departed"} />
        <span className="jp-clock">{formatTokyoClock(t0)}</span>
      </div>
      <div
        className="jp-track"
        role="progressbar"
        aria-label="Journey progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${Math.round(pct)}% — ${formatDuration(progress.remainingSeconds)} to arrival`}
      >
        <div className="jp-done" style={{ width: `${pct}%` }} />
        {timeline.stops.map((s, i) => {
          const passed = i <= progress.currentIndex && progress.phase !== "before-departure";
          const last = timeline.stops.length - 1;
          const show =
            i === 0 || i === last || i === progress.nextIndex || i === progress.currentIndex;
          return (
            <span
              key={s.stationId}
              title={journeyStations[i]?.nameEn}
              className={`jp-stop${show ? " show" : ""}${i === 0 ? " first" : ""}${i === last ? " last" : ""}${passed ? " passed" : ""}${i === progress.nextIndex && progress.phase === "running" ? " next" : ""}`}
              style={{ left: `${i === 0 ? 0 : pos(s.estimatedArrival)}%` }}
            >
              <span className="jp-tick" />
              <span className="jp-name">{journeyStations[i]?.nameEn}</span>
            </span>
          );
        })}
        <span
          className={`jp-train${progress.positionApproximate ? " approx" : ""}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="jp-end jp-end--arr">
        <Label en="Arrival" />
        <span className="jp-clock">{formatTokyoClock(t1)}</span>
        <span className="jp-remaining">
          <Label en="Time to arrival" /> {formatDuration(progress.remainingSeconds)}
        </span>
      </div>
    </div>
  );
}

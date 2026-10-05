import { formatTokyoClock } from "@shared/time";
import { StationNameBoard, stationNumbering } from "../../../design/station";
import { Label } from "../../../design/ui";
import type { Journey } from "./useJourney";

/**
 * 現在地 / 次の駅 — the station you are at (or just left) as a station name board with its
 * neighbours on the band, and the next stop as a platform sign with its arrival time.
 */
export function StationIndicator({ j }: { j: Journey }) {
  const { progress, journeyStations, timeline } = j;
  const cur = journeyStations[progress.currentIndex];
  const next = journeyStations[progress.nextIndex];
  const prevSt = journeyStations[progress.currentIndex - 1];
  const nextStop = timeline.stops[progress.nextIndex];
  const arrived = progress.phase === "arrived";
  const between = progress.phase === "running";
  const code = stationNumbering(cur);
  return (
    <div className="si" aria-live="polite">
      <div className="si-now">
        <Label en={between ? "Between" : arrived ? "Arrived at" : "Now at"} ja="現在地" />
        <p className="sr-only">{between ? `${cur?.nameEn} – ${next?.nameEn}` : cur?.nameEn}</p>
        <StationNameBoard
          className={`si-board${between ? " si-board--left" : ""}`}
          color="var(--line)"
          ja={cur?.nameJa}
          en={cur?.nameEn}
          code={code ? { line: code.line, num: code.num } : undefined}
          note={between ? "DEPARTED · 発車" : arrived ? "ARRIVED · 到着" : "NOW · 停車中"}
          prev={prevSt ? { ja: prevSt.nameJa, en: prevSt.nameEn } : null}
          next={!arrived && next && next !== cur ? { ja: next.nameJa, en: next.nameEn } : null}
        />
        {between && (
          <p className="si-name si-name--between" aria-hidden="true">
            <span>
              {cur?.nameEn} – {next?.nameEn}
            </span>
            <small lang="ja">
              {cur?.nameJa} ─ {next?.nameJa}
            </small>
          </p>
        )}
      </div>
      {!arrived && next && (
        <div className="si-next">
          <Label en="Next station" ja="次の駅" />
          <div className="si-next-sign">
            <span className="si-next-tag" aria-hidden="true">
              <span lang="ja">次は</span>
              <small>NEXT</small>
            </span>
            <p className="si-name si-name--next">
              <span>{next.nameEn}</span>
              <small lang="ja">{next.nameJa}</small>
            </p>
            <svg className="si-next-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12h15M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>
          <p className="si-time led led--amber">
            {formatTokyoClock(nextStop.estimatedArrival)}
            {timeline.delaySeconds >= 60 && <s>{formatTokyoClock(nextStop.scheduledArrival)}</s>}
          </p>
        </div>
      )}
    </div>
  );
}

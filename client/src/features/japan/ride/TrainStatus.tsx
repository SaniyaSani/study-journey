import { formatTokyoClock } from "@shared/time";
import { Label, RedDot } from "../../../design/ui";
import { routeViewLabel } from "../components";
import type { Journey } from "./useJourney";

const STATUS: Record<string, { ja: string; en: string }> = {
  live: { ja: "定刻", en: "On time" },
  timetable: { ja: "時刻表どおり", en: "Scheduled" },
  delayed: { ja: "遅れ", en: "Delayed" },
  cancelled: { ja: "運休", en: "Cancelled" },
  demo: { ja: "デモ運行", en: "Demo" },
  offline: { ja: "オフライン", en: "Offline" },
  scenic: { ja: "景色のみ", en: "Scenic · no tracking" },
};

/** TRAIN / STATUS / DATA — honest about live vs scheduled vs demo. */
export function TrainStatus({ j, lineName }: { j: Journey; lineName: { ja: string; en: string } }) {
  const st = STATUS[j.status] ?? STATUS.timetable;
  const delayMin = Math.round(j.timeline.delaySeconds / 60);
  const lastUpdated =
    j.rt.lastOkAt && (j.rt.offline || j.rt.meta?.stale)
      ? formatTokyoClock(j.rt.lastOkAt, true)
      : null;
  return (
    <dl className="ts">
      <div>
        <dt>
          <Label en="Train" />
        </dt>
        <dd>
          <span>{lineName.en}</span>
          <small lang="ja">{lineName.ja}</small>
        </dd>
      </div>
      <div>
        <dt>
          <Label en="Status" />
        </dt>
        <dd className={`ts-status ts-status--${j.status}`}>
          {j.status === "live" && <RedDot pulse />}
          <span>{j.status === "delayed" ? `Delayed +${delayMin} min` : st.en}</span>
          <small lang="ja">{j.status === "delayed" ? `約${delayMin}分遅れ` : st.ja}</small>
        </dd>
      </div>
      <div>
        <dt>
          <Label en="Data" />
        </dt>
        <dd>
          <small className="ts-source">
            {routeViewLabel(
              j.source,
              j.viewKind === "illustrated" || j.footageSegment?.video.provider === "illustrated"
                ? "illustrated"
                : "video",
            )}
          </small>
          {lastUpdated && <small>LAST UPDATED {lastUpdated} JST</small>}
          {j.timeOffset !== 0 && (
            <small>PREVIEW CLOCK {Math.round(j.timeOffset / 60000)} MIN</small>
          )}
        </dd>
      </div>
    </dl>
  );
}

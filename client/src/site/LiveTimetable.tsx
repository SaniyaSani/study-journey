import { useEffect, useState } from "react";
import type { Departure } from "@shared/types";
import { formatLocalClock, formatTokyoClock, toMs, userIsOnTokyoTime } from "@shared/time";
import { DepartureBoard, serviceColor, TrackNumber } from "../design/station";
import { RedDot } from "../design/ui";
import { departureStatus, type Planner } from "../features/japan/planner/usePlanner";
import { useStudy } from "../store/studyStore";

/** One character cell that "flips" when its value changes, like a split-flap board. */
function Flap({ value, className = "" }: { value: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (value === shown) return;
    setFlipping(true);
    const t = setTimeout(() => {
      setShown(value);
      setFlipping(false);
    }, 260);
    return () => clearTimeout(t);
  }, [value, shown]);
  return <span className={`flap${flipping ? " flipping" : ""} ${className}`}>{shown}</span>;
}

const STATUS_TEXT: Record<string, { ja: string; en: string }> = {
  live: { ja: "定刻", en: "On time" },
  timetable: { ja: "時刻表", en: "Scheduled" },
  demo: { ja: "デモ", en: "Demo" },
  offline: { ja: "記録", en: "Cached" },
  delayed: { ja: "遅れ", en: "Delayed" },
  cancelled: { ja: "運休", en: "Cancelled" },
};

export function boardMode(deps: Departure[] | undefined, fromCache?: boolean) {
  if (fromCache) return { label: "CACHED", live: false };
  if (deps?.some((d) => d.dataMode === "live")) return { label: "LIVE", live: true };
  if (deps?.some((d) => d.dataMode === "demo")) return { label: "DEMO DATA", live: false };
  return { label: "TIMETABLE", live: false };
}

/**
 * 次の列車 — departure board for the selected section. Rows are selectable; status says
 * honestly whether it is live, scheduled, demo or cached data.
 */
export function LiveTimetable({
  planner: p,
  compact = false,
}: {
  planner: Planner;
  compact?: boolean;
}) {
  const showLocal = useStudy((s) => s.settings.showLocalTime);
  const deps = p.departures.data ?? [];
  const mode = boardMode(p.departures.data, p.departures.fromCache);
  const operator = p.operator;
  const rows = compact ? deps.slice(0, 5) : deps;

  return (
    <DepartureBoard
      id="timetable"
      className={`board${compact ? " board--compact" : ""}`}
      compact={compact}
      titleJa="次の列車"
      titleEn="Next trains"
      status={
        <span className={`board-mode${mode.live ? " is-live" : ""}`}>
          {mode.label} {mode.live ? <RedDot pulse /> : <span className="board-mode-dot" />}
        </span>
      }
      columns={[
        { ja: "時刻", en: "Time" },
        { ja: "種別", en: "Type", className: "col-type" },
        { ja: "行先", en: "Destination" },
        { ja: "番線", en: "Track", className: "col-op" },
        { ja: "備考", en: "Status" },
      ]}
      footer={
        <>
          <span>JST</span>
          <span>{operator ? operator.nameEn.toUpperCase() : ""}</span>
          <span>
            {p.departures.meta ? `SOURCE · ${p.departures.meta.source.toUpperCase()}` : ""}
          </span>
          {p.departures.fromCache && p.departures.meta && (
            <span>LAST UPDATED {formatTokyoClock(p.departures.meta.fetchedAt)}</span>
          )}
        </>
      }
    >
      {p.departures.state === "loading" && deps.length === 0 && (
        <p className="board-empty">Loading timetable…</p>
      )}
      {p.departures.state === "error" && (
        <p className="board-empty" role="alert">
          {p.departures.error}
        </p>
      )}
      {p.departures.state === "ok" && deps.length === 0 && (
        <p className="board-empty">No trains for this section at this time.</p>
      )}

      {rows.length > 0 && (
        <ul className="board-rows" role="listbox" aria-label="Departures — choose a train">
          {rows.map((d) => {
            const st = departureStatus(d, p.departures.fromCache);
            const dep = d.estimatedDeparture ?? d.scheduledDeparture;
            const enRoute = toMs(dep) < Date.now();
            const delayMin = Math.round((d.delaySeconds ?? 0) / 60);
            const txt = STATUS_TEXT[st] ?? STATUS_TEXT.timetable;
            const statusLed =
              st === "cancelled"
                ? "led--red"
                : st === "delayed"
                  ? "led--orange"
                  : st === "live"
                    ? "led--green"
                    : "led--white";
            return (
              <li key={d.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.selected === d.id}
                  disabled={d.cancelled}
                  className={`board-row status-${st}${p.selected === d.id ? " is-selected" : ""}`}
                  onClick={() => p.setSelected(d.id)}
                >
                  <span className="board-time">
                    <Flap value={formatTokyoClock(dep)} className="led led--amber" />
                    {showLocal && !userIsOnTokyoTime(toMs(dep)) && (
                      <small>{formatLocalClock(dep)} local</small>
                    )}
                  </span>
                  <span className="board-type">
                    <span
                      className="board-type-chip"
                      style={{ ["--svc" as string]: serviceColor(d.trainTypeEn ?? d.trainTypeJa) }}
                    >
                      {d.trainTypeJa && <span lang="ja">{d.trainTypeJa}</span>}
                      <span>{d.trainTypeEn ?? "Train"}</span>
                    </span>
                    <small>{d.trainNumber ? `No. ${d.trainNumber}` : ""}</small>
                  </span>
                  <span className="board-dest">
                    <span className="board-dest-main">
                      <span className="board-dest-ja" lang="ja">
                        {d.destinationNameJa}行
                      </span>
                      <span className="board-dest-for">for</span> {d.destinationNameEn}
                    </span>
                    {enRoute && <small className="board-enroute">EN ROUTE</small>}
                    <small className="board-compact-meta">
                      {(d.trainTypeEn ?? "TRAIN").toUpperCase()}
                      {d.trainNumber ? ` ${d.trainNumber}` : ""}
                      {d.platform ? ` · PL ${d.platform}` : ""}
                    </small>
                  </span>
                  <span className="board-op">
                    {d.platform ? <TrackNumber n={d.platform} label={false} /> : <span>—</span>}
                    <small>{operator ? operator.nameEn : ""}</small>
                  </span>
                  <span className="board-status">
                    <Flap
                      value={st === "delayed" ? `+${delayMin} min` : txt.en}
                      className={`led ${statusLed}`}
                    />
                    <small lang="ja">{txt.ja}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DepartureBoard>
  );
}

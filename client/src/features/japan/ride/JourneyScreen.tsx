import { useRef, useState } from "react";
import { formatTokyoClock } from "@shared/time";
import { Icon, Label } from "../../../design/ui";
import { NotesPanel } from "../../desk/NotesPanel";
import type { JourneySession } from "../session";
import { DEV_TOOLS } from "../devtools";
import { DebugOverlay } from "./DebugOverlay";
import { JourneyMap } from "./JourneyMap";
import { JourneyPlayer } from "./JourneyPlayer";
import { JourneyProgress } from "./JourneyProgress";
import { SoundControls } from "./SoundControls";
import { StationIndicator } from "./StationIndicator";
import { StudyMode } from "./StudyMode";
import { TrainStatus } from "./TrainStatus";
import { useJourney, type JourneySummaryData } from "./useJourney";

type Sheet = "study" | "sound" | "map" | "notes" | null;

/**
 * The ride. Most of the screen is the window; information sits quietly around it like
 * printed carriage signage.
 */
export function JourneyScreen({
  session,
  onFinish,
}: {
  session: JourneySession;
  onFinish: (s: JourneySummaryData) => void;
}) {
  const j = useJourney(session, onFinish);
  const [sheet, setSheet] = useState<Sheet>(null);
  const root = useRef<HTMLDivElement>(null);
  const lineColor = session.route.color ?? "#2e7d5b";
  const first = j.journeyStations[0];
  const last = j.journeyStations[j.journeyStations.length - 1];
  const dep = j.timeline.stops[0];
  const type = session.trip.trainTypeEn ?? (j.scenic ? "SCENIC" : "TRAIN");

  const toggle = (s: Exclude<Sheet, null>) => setSheet((cur) => (cur === s ? null : s));
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen?.();
    } catch {
      /* not allowed */
    }
  };

  return (
    <div ref={root} className="ride" style={{ ["--line" as string]: lineColor }}>
      <header className="ride-head">
        <div className="ride-route">
          <h1 className="ride-route-title">
            <span>
              {first.nameEn} <span className="arrow">→</span> {last.nameEn}
            </span>
            <small lang="ja">
              {first.nameJa} → {last.nameJa}
            </small>
          </h1>
          <p className="ride-route-meta">
            <span className="ride-clock">{formatTokyoClock(dep.estimatedDeparture)}</span>
            <span>{type.toUpperCase()}</span>
            {session.trip.trainNumber && <span>No. {session.trip.trainNumber}</span>}
            <span className="ride-line-chip" />
            <span>{session.route.nameEn}</span>
          </p>
        </div>
        <TrainStatus j={j} lineName={{ ja: session.route.nameJa, en: session.route.nameEn }} />
        <div className="ride-head-actions">
          <button className="ink-icon" onClick={fullscreen} aria-label="Fullscreen">
            <Icon name="full" />
          </button>
          <button className="ink-btn ink-btn--ghost" onClick={() => j.finish(false)}>
            End ride
          </button>
        </div>
      </header>

      {(j.timeline.cancelled ||
        (j.rt.notice && !j.scenic && j.status !== "demo" && j.status !== "live")) && (
        <p className={`ride-notice${j.timeline.cancelled ? " severe" : ""}`} role="status">
          {j.timeline.cancelled
            ? "This train has been cancelled. You can keep studying on the timetable view or end the ride."
            : j.rt.notice}
        </p>
      )}
      {j.alerts.length > 0 && (
        <p className="ride-ticker" role="status">
          <Label en="Service info" />
          <span>
            {j.alerts[0].statusEn ?? j.alerts[0].statusJa ?? ""} —{" "}
            {j.alerts[0].textEn ?? j.alerts[0].textJa}
            {j.alerts[0].dataMode === "demo" ? " (demo)" : ""}
          </span>
        </p>
      )}

      <main className="ride-main">
        <JourneyPlayer j={j} lineColor={lineColor} />
        <p className="ride-vertical" lang="ja" aria-hidden="true">
          {j.progress.phase === "running"
            ? `次は ${j.journeyStations[j.progress.nextIndex]?.nameJa}`
            : "車窓より"}
        </p>
      </main>

      <section className="ride-info">
        <StationIndicator j={j} />
        <JourneyProgress j={j} />
      </section>

      <nav className="ride-dock" aria-label="Ride tools">
        {(
          [
            ["study", "Study", "勉強", "study"],
            ["sound", "Sound", "音", "sound"],
            ["map", "Map", "地図", "map"],
            ["notes", "Notes", "手帳", "book"],
          ] as const
        ).map(([id, en, ja, icon]) => (
          <button
            key={id}
            type="button"
            aria-expanded={sheet === id}
            aria-controls={`sheet-${id}`}
            onClick={() => toggle(id)}
            className="dock-btn"
          >
            <Icon name={icon} />
            <span>{en}</span>
            <small lang="ja">{ja}</small>
            {id === "study" && j.studyRemaining != null && j.study.mode !== "dest" && (
              <span className="dock-badge">{Math.ceil(j.studyRemaining / 60)}′</span>
            )}
          </button>
        ))}
        <span className="dock-sync" aria-hidden="true">
          SYNC{" "}
          {j.sync
            ? `${j.sync.mode.toUpperCase()} ${j.sync.drift >= 0 ? "+" : ""}${j.sync.drift.toFixed(1)}s`
            : "—"}
        </span>
      </nav>

      {DEV_TOOLS && <DebugOverlay j={j} />}

      {sheet && (
        <aside className="sheet" id={`sheet-${sheet}`} aria-label={sheet}>
          <button
            className="ink-icon sheet-close"
            onClick={() => setSheet(null)}
            aria-label="Close panel"
          >
            <Icon name="close" />
          </button>
          {sheet === "study" && <StudyMode j={j} />}
          {sheet === "sound" && <SoundControls j={j} />}
          {sheet === "map" && (
            <JourneyMap
              shape={session.shape}
              routeStations={session.stations}
              journeyStations={j.journeyStations}
              progress={j.progress}
              lineColor={lineColor}
            />
          )}
          {sheet === "notes" && <NotesPanel journeyId={session.id} compact />}
        </aside>
      )}
    </div>
  );
}

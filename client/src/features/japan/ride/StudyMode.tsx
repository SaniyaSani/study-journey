import { formatCountdown, formatDuration } from "@shared/time";
import { Label } from "../../../design/ui";
import { useStudy } from "../../../store/studyStore";
import { TasksPanel } from "../../desk/TasksPanel";
import type { StudyModeKind } from "../session";
import type { Journey } from "./useJourney";

const MODES: Array<{ id: StudyModeKind; ja: string; en: string }> = [
  { id: "25", ja: "25分", en: "25 min" },
  { id: "45", ja: "45分", en: "45 min" },
  { id: "next", ja: "次の駅まで", en: "Until next station" },
  { id: "dest", ja: "終点まで", en: "Until destination" },
];

/**
 * 勉強モード — study while riding. The train keeps to the timetable whatever happens here;
 * pausing study only pauses the focus counter.
 */
export function StudyMode({ j, compact = false }: { j: Journey; compact?: boolean }) {
  const tasks = useStudy((s) => s.tasks);
  const current = tasks.find((t) => t.id === j.study.currentTaskId);
  const waiting = j.progress.phase === "before-departure";
  return (
    <section className="sm" aria-label="Study mode">
      <header className="sm-head">
        <Label en="Study mode" />
        <span className="sm-focused">FOCUSED {formatDuration(j.study.focusedSeconds)}</span>
      </header>
      <div className="sm-modes" role="radiogroup" aria-label="Study block">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={j.study.mode === m.id}
            onClick={() => j.setStudyMode(m.id)}
          >
            <span>{m.en}</span>
            <small lang="ja">{m.ja}</small>
          </button>
        ))}
      </div>
      <div className="sm-clock" role="timer" aria-live="off">
        {j.studyRemaining != null ? formatCountdown(j.studyRemaining) : "--:--"}
      </div>
      <p className="sm-state">
        {waiting
          ? "Waiting on the platform — study starts when the train departs"
          : j.studyBlockDone
            ? "Block complete — well done. The train rolls on."
            : j.study.paused
              ? "Study paused — the train keeps moving"
              : "Focusing"}
      </p>
      <div className="sm-actions">
        <button
          type="button"
          className="ink-btn"
          onClick={() => j.updateStudy({ paused: !j.study.paused })}
          aria-pressed={j.study.paused}
        >
          {j.study.paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="sm-task">
        <Label en="Current task" />
        <strong>{current ? current.title : "—"}</strong>
      </div>
      {!compact && (
        <TasksPanel
          compact
          title="Tasks"
          currentTaskId={j.study.currentTaskId}
          onSelectCurrent={(id) => j.updateStudy({ currentTaskId: id })}
        />
      )}
    </section>
  );
}

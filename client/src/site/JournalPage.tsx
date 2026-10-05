import { formatDuration } from "@shared/time";
import { Label } from "../design/ui";
import { FocusTimer } from "../features/desk/FocusTimer";
import { NotesPanel } from "../features/desk/NotesPanel";
import { TasksPanel } from "../features/desk/TasksPanel";
import { RouteStampCard } from "../features/japan/summary/RouteStampCard";
import { useStudy } from "../store/studyStore";
import { PageHead } from "./PageHead";

/** 旅の記録 — stamps, focus history, tasks and notes (the former Study Desk). */
export function JournalPage() {
  const stamps = useStudy((s) => s.stamps);
  const sessions = useStudy((s) => s.focusSessions);
  const total = sessions.reduce((a, s) => a + s.focusSeconds, 0);
  const recent = [...sessions].reverse().slice(0, 8);
  return (
    <div className="journal page-ink">
      <PageHead
        ja="旅の記録"
        kana="たびのきろく"
        en="Journal"
        color="var(--line-blue)"
        prev={{ ja: "ライブ", en: "Live" }}
        next={{ ja: "について", en: "About" }}
      >
        <p className="page-head-stat">
          <span className="page-head-stat-cell">
            <Label en="Total focus" />{" "}
            <strong className="led led--amber">{formatDuration(total)}</strong>
          </span>
          <span className="page-head-stat-cell">
            <Label en="Rides" /> <strong className="led led--amber">{stamps.length}</strong>
          </span>
        </p>
      </PageHead>

      <section className="journal-stamps" aria-label="Route stamps">
        <h2 className="section-label">
          <Label en="Route stamps" ja="駅スタンプ" />
        </h2>
        {stamps.length === 0 ? (
          <p className="ink-empty">No stamps yet — finish a ride to collect your first one.</p>
        ) : (
          <div className="stamp-row">
            {stamps.map((s) => (
              <RouteStampCard key={s.id} stamp={s} size={170} />
            ))}
          </div>
        )}
      </section>

      <div className="journal-grid">
        <section className="ink-panel ink-panel--board">
          <FocusTimer />
          <h3 className="section-label">
            <Label en="Recent sessions" />
          </h3>
          <ul className="ink-list">
            {recent.length === 0 && <li className="ink-empty">—</li>}
            {recent.map((s) => (
              <li key={s.id}>
                <span>{new Date(s.endedAt).toLocaleDateString()}</span>
                <span>{s.label ?? (s.kind === "journey" ? "Journey" : "Focus")}</span>
                <span>{formatDuration(s.focusSeconds)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="ink-panel ink-panel--notice">
          <TasksPanel title="Tasks" />
        </section>
        <section className="ink-panel ink-panel--paper">
          <NotesPanel />
        </section>
      </div>
    </div>
  );
}

import { useState } from "react";
import { actions, useStudy } from "../../store/studyStore";

interface Props {
  /** when set, the panel lets the user pick the "current" task */
  currentTaskId?: string | null;
  onSelectCurrent?: (id: string | null) => void;
  compact?: boolean;
  title?: string;
}

export function TasksPanel({ currentTaskId, onSelectCurrent, compact, title = "Tasks" }: Props) {
  const tasks = useStudy((s) => s.tasks);
  const [draft, setDraft] = useState("");
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const shown = compact ? [...open, ...done.slice(-3)] : [...open, ...done];

  return (
    <section className="tasks-panel" aria-label={title}>
      <h2>{title}</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          actions.addTask(draft);
          setDraft("");
        }}
      >
        <label className="sr-only" htmlFor={`task-input-${compact ? "c" : "f"}`}>
          New task
        </label>
        <input
          id={`task-input-${compact ? "c" : "f"}`}
          className="input"
          value={draft}
          placeholder="Add a task…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn" type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {shown.length === 0 ? (
        <p className="muted">No tasks yet.</p>
      ) : (
        <ul className="list">
          {shown.map((t) => (
            <li key={t.id} className={currentTaskId === t.id ? "is-current" : undefined}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => actions.toggleTask(t.id)}
                aria-label={`Mark "${t.title}" as ${t.done ? "not done" : "done"}`}
              />
              <span className={t.done ? "task-done" : undefined} style={{ flex: 1 }}>
                {t.title}
              </span>
              {onSelectCurrent && !t.done && (
                <button
                  className="btn btn-small btn-ghost"
                  aria-pressed={currentTaskId === t.id}
                  onClick={() => onSelectCurrent(currentTaskId === t.id ? null : t.id)}
                >
                  {currentTaskId === t.id ? "Current" : "Focus"}
                </button>
              )}
              {!compact && (
                <button
                  className="icon-btn"
                  aria-label={`Delete "${t.title}"`}
                  onClick={() => actions.removeTask(t.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

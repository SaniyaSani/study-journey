import { useEffect, useRef, useState } from "react";
import { formatCountdown } from "@shared/time";
import { actions, useStudy } from "../../store/studyStore";

/** Classic focus (pomodoro) timer from the Study Desk. */
export function FocusTimer() {
  const minutes = useStudy((s) => s.settings.pomodoroMinutes);
  const [remaining, setRemaining] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<string | null>(null);
  const focused = useRef(0);

  useEffect(() => {
    if (!running) setRemaining(minutes * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      focused.current += 1;
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    setRunning(false);
    actions.addFocusSession({
      kind: "pomodoro",
      startedAt: startedAt.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      focusSeconds: focused.current,
    });
    focused.current = 0;
    startedAt.current = null;
    setRemaining(minutes * 60);
  }, [remaining, running, minutes]);

  return (
    <section aria-label="Focus timer">
      <h2>Focus timer</h2>
      <div className="timer-face" role="timer" aria-live="off">
        {formatCountdown(remaining)}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!running && !startedAt.current) startedAt.current = new Date().toISOString();
            setRunning((r) => !r);
          }}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setRunning(false);
            if (focused.current > 60) {
              actions.addFocusSession({
                kind: "pomodoro",
                startedAt: startedAt.current ?? new Date().toISOString(),
                endedAt: new Date().toISOString(),
                focusSeconds: focused.current,
              });
            }
            focused.current = 0;
            startedAt.current = null;
            setRemaining(minutes * 60);
          }}
        >
          Reset
        </button>
      </div>
      <label className="row muted" style={{ justifyContent: "center", marginTop: 10 }}>
        Length
        <select
          className="select"
          style={{ width: "auto" }}
          value={minutes}
          disabled={running}
          onChange={(e) => actions.updateSettings({ pomodoroMinutes: Number(e.target.value) })}
        >
          {[15, 25, 45, 50, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

import { useState } from "react";
import { actions, useStudy } from "../../store/studyStore";

interface Props {
  journeyId?: string;
  compact?: boolean;
}

/** Notes editor. In journey mode, new notes are linked to the journey. */
export function NotesPanel({ journeyId, compact }: Props) {
  const allNotes = useStudy((s) => s.notes);
  const notes = journeyId ? allNotes.filter((n) => n.journeyId === journeyId) : allNotes;
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  return (
    <section className="notes-panel" aria-label="Notes">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Notes</h2>
        <button
          className="btn btn-small"
          onClick={() =>
            setActiveId(actions.addNote(journeyId ? "Journey note" : "New note", "", journeyId))
          }
        >
          + New note
        </button>
      </div>
      {!active ? (
        <p className="muted">
          {journeyId ? "Notes you write during this journey appear here." : "No notes yet."}
        </p>
      ) : (
        <div className="note-editor">
          {!compact && notes.length > 1 && (
            <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              {notes.map((n) => (
                <button
                  key={n.id}
                  className="btn btn-small btn-ghost"
                  aria-pressed={n.id === active.id}
                  onClick={() => setActiveId(n.id)}
                >
                  {n.title}
                </button>
              ))}
            </div>
          )}
          <label className="sr-only" htmlFor={`note-title-${active.id}`}>
            Note title
          </label>
          <input
            id={`note-title-${active.id}`}
            className="input"
            value={active.title}
            onChange={(e) => actions.updateNote(active.id, { title: e.target.value })}
          />
          <label className="sr-only" htmlFor={`note-body-${active.id}`}>
            Note text
          </label>
          <textarea
            id={`note-body-${active.id}`}
            className="textarea"
            style={{ marginTop: 6, minHeight: compact ? 80 : 160 }}
            value={active.body}
            placeholder="Write while the landscape passes by…"
            onChange={(e) => actions.updateNote(active.id, { body: e.target.value })}
          />
          {!compact && (
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
              <button
                className="btn btn-small btn-ghost"
                onClick={() => actions.removeNote(active.id)}
              >
                Delete note
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

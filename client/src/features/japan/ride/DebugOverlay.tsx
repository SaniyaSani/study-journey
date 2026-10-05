import { useEffect, useState } from "react";
import { formatTokyoClock } from "@shared/time";
import { devToolsEnabled, queryParam } from "../devtools";
import type { Journey } from "./useJourney";

const fmt = (s: number | undefined) => {
  if (s == null || !Number.isFinite(s)) return "—";
  const sign = s < 0 ? "−" : "";
  const a = Math.abs(s);
  return `${sign}${Math.floor(a / 60)}:${(a % 60).toFixed(1).padStart(4, "0")}`;
};

/**
 * Developer-only sync diagnostics (?debug=1 or Shift+D). Returns null in public builds, so it
 * is never shown to passengers.
 */
export function DebugOverlay({ j }: { j: Journey }) {
  const enabled = devToolsEnabled();
  const [open, setOpen] = useState(() => enabled && queryParam("debug") === "1");
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d") && !(e.target instanceof HTMLInputElement))
        setOpen((o) => !o);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled]);
  if (!enabled || !open) return null;

  const t0 = j.timeline.stops[0].estimatedDeparture;
  const snap = j.syncState.snapshot;
  const drift = snap ? j.desired.time - snap.currentTime : undefined;
  const seg = j.footageSegment;
  const sim = j.clock.mode === "simulation";
  const c = j.clock.controls;
  return (
    <aside className="debug-overlay" aria-label="Sync debug (development only)">
      <strong>SYNC DEBUG · DEV ONLY</strong>
      <dl>
        <dt>JAPAN TIME</dt>
        <dd>{formatTokyoClock(j.now, true)}</dd>
        <dt>CLOCK</dt>
        <dd>
          {sim
            ? `SIMULATION ${j.clock.config.speed}×${j.clock.paused ? " PAUSED" : ""}`
            : "REAL TIME"}
          {j.timeOffset ? ` (offset ${Math.round(j.timeOffset / 1000)} s)` : ""}
        </dd>
        <dt>JOURNEY ELAPSED</dt>
        <dd>{fmt((j.now - t0) / 1000)}</dd>
        <dt>RIDE STATE</dt>
        <dd>{j.ride}</dd>
        <dt>VIEW</dt>
        <dd>{j.viewKind}</dd>
        <dt>CURRENT SEGMENT</dt>
        <dd>
          {seg
            ? `${(j.footage?.segmentIndex ?? 0) + 1}/${j.videoPlan.segments.length} ${seg.video.id} (${seg.fromStation}→${seg.toStation})`
            : "none"}
        </dd>
        <dt>VIDEO PHASE</dt>
        <dd>
          {j.footage
            ? `${j.footage.position.phase}${j.footage.position.hold ? " · hold" : ""}`
            : "—"}
        </dd>
        <dt>EXPECTED VIDEO</dt>
        <dd>{fmt(j.desired.time)}</dd>
        <dt>ACTUAL VIDEO</dt>
        <dd>{fmt(snap?.currentTime)}</dd>
        <dt>DRIFT</dt>
        <dd className={drift != null && Math.abs(drift) > 5 ? "bad" : undefined}>
          {drift == null ? "—" : `${drift >= 0 ? "+" : ""}${drift.toFixed(2)} s`}
        </dd>
        <dt>PLAYBACK RATE</dt>
        <dd>
          {snap ? `${snap.rate}${snap.supportsFineRate ? "" : " (coarse)"}` : "—"} ·{" "}
          {snap?.playing ? "playing" : "paused"}
        </dd>
        <dt>SYNC MODE</dt>
        <dd>{j.sync?.mode ?? "—"}</dd>
        <dt>PLAN</dt>
        <dd>{j.videoPlan.note}</dd>
      </dl>
      <div className="row">
        <button type="button" aria-pressed={!sim} onClick={c.setRealTime}>
          REAL TIME
        </button>
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sim && j.clock.config.speed === s}
            onClick={() => c.simulate(s)}
          >
            SIM {s}×
          </button>
        ))}
        {sim && (
          <button type="button" onClick={j.clock.paused ? c.resume : c.pause}>
            {j.clock.paused ? "RESUME JOURNEY" : "PAUSE JOURNEY"}
          </button>
        )}
        <button
          type="button"
          onClick={() => c.simulate(sim ? j.clock.config.speed : 1, t0 - 30_000)}
        >
          DEPARTURE −30 s
        </button>
      </div>
    </aside>
  );
}

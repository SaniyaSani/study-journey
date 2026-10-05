import { formatTokyoClock } from "@shared/time";
import { countdown, footageLabel, RIDE_STATE_TEXT } from "../video/labels";
import type { Journey } from "./useJourney";

/**
 * The strip directly under the window. Everything we print about the footage lives here —
 * outside the YouTube player's rectangle — so the player itself is never covered.
 */
export function FootageBand({ j }: { j: Journey }) {
  const { progress, timeline, ride, videoPlan } = j;
  const dep = timeline.stops[0];
  const waiting = progress.phase === "before-departure";
  const delayMin = Math.round(timeline.delaySeconds / 60);
  // a delay is only printed when it comes from real-time data
  const realDelay = j.status === "delayed" && delayMin > 0 && j.source === "live";
  const label = footageLabel(
    j.footageSegment?.video ?? null,
    j.source,
    j.clock.mode === "real" && j.timeOffset === 0,
  );
  const state = RIDE_STATE_TEXT[ride];
  const partial = videoPlan.coverage && !videoPlan.coversWholeJourney;

  return (
    <div className="fband" role="group" aria-label="Ride status">
      <div className="fband-state">
        <span className={`fband-ride fband-ride--${ride.toLowerCase()}`} aria-live="polite">
          {state.en}
          <small lang="ja">{state.ja}</small>
        </span>
        {waiting && (
          <span className="fband-countdown" aria-live="off">
            DEPARTURE IN <b>{countdown((dep.estimatedDeparture - j.now) / 1000)}</b>
            <small>{formatTokyoClock(dep.estimatedDeparture)} JST</small>
          </span>
        )}
        {realDelay && <span className="fband-delay">+{delayMin} MIN DELAY</span>}
        {j.clock.mode === "simulation" && (
          <span className="fband-sim">
            SIMULATION {j.clock.config.speed}×{j.clock.paused ? " · PAUSED" : ""}
          </span>
        )}
      </div>

      <div className="fband-source">
        {j.footageSegment ? (
          <>
            <span className="fband-label">{label}</span>
            {partial && videoPlan.coverage && (
              <span className="fband-coverage">
                VIDEO COVERAGE {videoPlan.coverage.fromStation} → {videoPlan.coverage.toStation}
              </span>
            )}
            {videoPlan.segments.length > 1 && (
              <span className="fband-coverage">
                RECORDING {(j.footage?.segmentIndex ?? 0) + 1} OF {videoPlan.segments.length}
              </span>
            )}
          </>
        ) : videoPlan.coverage ? (
          <span className="fband-coverage">
            VIDEO COVERAGE {videoPlan.coverage.fromStation} → {videoPlan.coverage.toStation}
          </span>
        ) : (
          videoPlan.uncalibrated.length > 0 && (
            <span className="fband-coverage">
              Footage of this line is not calibrated yet ·{" "}
              {videoPlan.uncalibrated.slice(0, 2).map((v, i) => (
                <span key={v.id}>
                  {i > 0 && " · "}
                  <a href={v.sourceUrl} target="_blank" rel="noreferrer noopener">
                    Watch {v.coverage.from} → {v.coverage.to} (not synchronized) ↗
                  </a>
                </span>
              ))}
            </span>
          )
        )}
      </div>

      <div className="fband-actions">
        {j.syncState.viewerPaused && (
          <button type="button" className="fband-btn" onClick={j.syncState.resume}>
            ▶ Back to the train
            <small>Video paused — the train kept running</small>
          </button>
        )}
        {j.syncState.needsTap && !j.syncState.viewerPaused && (
          <button type="button" className="fband-btn" onClick={j.syncState.resume}>
            ▶ Start the window view
          </button>
        )}
        {j.realFootage && (
          <button
            type="button"
            className={`fband-btn fband-sound${j.videoMuted ? "" : " on"}`}
            aria-pressed={!j.videoMuted}
            onClick={() => void j.applySoundPreset(j.videoMuted ? "train" : "quiet")}
          >
            {j.videoMuted ? (
              <>
                <span lang="ja">音をオン</span> TURN SOUND ON
              </>
            ) : (
              "TRAIN SOUND ON"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

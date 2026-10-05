import { useCallback, useEffect, useMemo, useState } from "react";
import {
  journeyNow,
  pauseClock,
  realClock,
  resumeClock,
  setSpeed as setClockSpeed,
  simulationClock,
  type JourneyClockConfig,
} from "@shared/journeyClock";
import { devToolsEnabled, queryParam } from "../devtools";
import { readTimeOffsetMs } from "./useNow";

/**
 * The journey clock for a ride. REAL TIME by default: the timetable position is recomputed
 * from absolute time on every tick, so a sleeping tab, a paused video or buffering never
 * makes the train fall behind. SIMULATION (1×/2×/4×, pausable) exists for development only
 * (?sim=4 or the debug overlay).
 */
export function useJourneyClock(tickMs = 1000) {
  const offsetMs = useMemo(readTimeOffsetMs, []);
  const [cfg, setCfg] = useState<JourneyClockConfig>(() => {
    const sim = devToolsEnabled() ? Number(queryParam("sim")) : NaN;
    return Number.isFinite(sim) && sim > 0
      ? simulationClock(Date.now() + offsetMs, sim, Date.now())
      : realClock(offsetMs);
  });
  const [now, setNow] = useState(() => journeyNow(cfg, Date.now()));

  useEffect(() => {
    const tick = () => setNow(journeyNow(cfg, Date.now()));
    tick();
    const interval =
      cfg.mode === "simulation" && cfg.speed > 1 ? Math.max(250, tickMs / cfg.speed) : tickMs;
    const t = setInterval(tick, interval);
    // returning to the tab: recompute immediately from absolute time
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [cfg, tickMs]);

  const dev = devToolsEnabled();
  const controls = {
    setRealTime: useCallback(() => setCfg(realClock(offsetMs)), [offsetMs]),
    simulate: useCallback(
      (speed: number, fromMs?: number) =>
        dev &&
        setCfg((c) =>
          c.mode === "simulation" && fromMs == null
            ? setClockSpeed(c, speed, Date.now())
            : simulationClock(fromMs ?? journeyNow(c, Date.now()), speed, Date.now()),
        ),
      [dev],
    ),
    pause: useCallback(() => setCfg((c) => pauseClock(c, Date.now())), []),
    resume: useCallback(() => setCfg((c) => resumeClock(c, Date.now())), []),
  };

  return {
    now,
    config: cfg,
    offsetMs,
    mode: cfg.mode,
    /** nominal playback rate for the footage */
    speed: cfg.mode === "simulation" && cfg.pausedAtJourneyMs == null ? cfg.speed : 1,
    paused: cfg.pausedAtJourneyMs != null,
    controls,
  };
}

export type JourneyClock = ReturnType<typeof useJourneyClock>;

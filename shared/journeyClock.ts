/**
 * The journey clock. Always derived from ABSOLUTE wall-clock time (Date.now()), never from
 * a counter that increments while a tab is awake — so sleeping tabs, paused videos and
 * buffering never desynchronise the virtual train.
 *
 *  real        journey time = real time (+ optional preview offset)
 *  simulation  journey time = anchor + (real − anchorReal) × speed   (dev/testing only)
 */
export type ClockMode = "real" | "simulation";

export interface JourneyClockConfig {
  mode: ClockMode;
  /** simulation speed: 1, 2, 4 … */
  speed: number;
  /** real mode: constant offset (preview / time travel), ms */
  offsetMs: number;
  /** simulation: real time and journey time at the moment the simulation (re)started */
  anchorRealMs: number;
  anchorJourneyMs: number;
  /** simulation only: journey time frozen while paused */
  pausedAtJourneyMs: number | null;
}

export function realClock(offsetMs = 0): JourneyClockConfig {
  return {
    mode: "real",
    speed: 1,
    offsetMs,
    anchorRealMs: 0,
    anchorJourneyMs: 0,
    pausedAtJourneyMs: null,
  };
}

export function simulationClock(
  startJourneyMs: number,
  speed: number,
  realNow: number,
): JourneyClockConfig {
  return {
    mode: "simulation",
    speed: Math.max(0.1, speed),
    offsetMs: 0,
    anchorRealMs: realNow,
    anchorJourneyMs: startJourneyMs,
    pausedAtJourneyMs: null,
  };
}

export function journeyNow(cfg: JourneyClockConfig, realNow: number): number {
  if (cfg.mode === "real") return realNow + cfg.offsetMs;
  if (cfg.pausedAtJourneyMs != null) return cfg.pausedAtJourneyMs;
  return cfg.anchorJourneyMs + (realNow - cfg.anchorRealMs) * cfg.speed;
}

/** Simulation only — in real mode the train never stops because the viewer paused. */
export function pauseClock(cfg: JourneyClockConfig, realNow: number): JourneyClockConfig {
  if (cfg.mode === "real" || cfg.pausedAtJourneyMs != null) return cfg;
  return { ...cfg, pausedAtJourneyMs: journeyNow(cfg, realNow) };
}

export function resumeClock(cfg: JourneyClockConfig, realNow: number): JourneyClockConfig {
  if (cfg.mode === "real" || cfg.pausedAtJourneyMs == null) return cfg;
  return {
    ...cfg,
    anchorJourneyMs: cfg.pausedAtJourneyMs,
    anchorRealMs: realNow,
    pausedAtJourneyMs: null,
  };
}

export function setSpeed(
  cfg: JourneyClockConfig,
  speed: number,
  realNow: number,
): JourneyClockConfig {
  if (cfg.mode === "real") return cfg;
  const at = journeyNow(cfg, realNow);
  return { ...cfg, speed: Math.max(0.1, speed), anchorJourneyMs: at, anchorRealMs: realNow };
}

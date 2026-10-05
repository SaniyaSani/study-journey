import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  DEFAULT_SYNC_CONFIG,
  SyncController,
  type DesiredPosition,
  type PlayerSnapshot,
  type SyncCommand,
  type SyncConfig,
} from "@shared/sync";
import type { RoutePlayer } from "../players/types";

export interface VideoSyncOptions {
  active: boolean;
  /** changes whenever a different video / segment becomes active */
  key: string;
  /** how often drift is corrected (real footage: 5 s; illustrated view: 1 s) */
  correctionMs?: number;
  config?: SyncConfig;
}

export interface VideoSyncState {
  cmd: SyncCommand | null;
  /** the viewer paused the video in real-time mode — the train keeps running */
  viewerPaused: boolean;
  /** the browser blocked autoplay; a tap is needed */
  needsTap: boolean;
  snapshot: PlayerSnapshot | null;
  /** resume after a viewer pause: jumps straight to the current timetable position */
  resume: () => void;
}

/**
 * Applies the pure SyncController (shared/sync.ts) to whichever player is mounted.
 *
 * The timetable is the master clock. The player is observed every second, but corrected only
 * every `correctionMs` (avoids constant seeking) — and immediately when something changed:
 * a new segment, the tab becoming visible again, or playback resuming after buffering or a
 * viewer pause (the cooldown is cleared so the video jumps straight back into place).
 */
export function useVideoSync(
  player: RefObject<RoutePlayer | null>,
  desired: DesiredPosition | null,
  { active, key, correctionMs = 1000, config = DEFAULT_SYNC_CONFIG }: VideoSyncOptions,
): VideoSyncState {
  const controller = useRef(new SyncController(config));
  const desiredRef = useRef(desired);
  desiredRef.current = desired;
  const [cmd, setCmd] = useState<SyncCommand | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const st = useRef({
    lastCorrection: -Infinity,
    wasPlaying: false,
    everPlayed: false,
    weHeld: false,
    viewerPaused: false,
    playAttempts: 0,
    urgent: true,
  });

  useEffect(() => {
    controller.current.setConfig(config);
  }, [config]);

  useEffect(() => {
    controller.current.reset();
    st.current = {
      ...st.current,
      lastCorrection: -Infinity,
      everPlayed: false,
      weHeld: false,
      viewerPaused: false,
      playAttempts: 0,
      urgent: true,
    };
    setViewerPaused(false);
    setNeedsTap(false);
  }, [key]);

  const tick = useCallback(() => {
    const p = player.current;
    const d = desiredRef.current;
    if (!p || !d) return;
    const snap = p.snapshot();
    setSnapshot(snap);
    if (!snap) return;
    const s = st.current;
    const now = Date.now();

    // "really playing" excludes buffering; a seek or a slow network is not a pause
    const rolling = snap.playing && !snap.buffering;
    // detect a pause the viewer made through the player's own controls
    if (s.wasPlaying && !snap.playing && s.everPlayed && !s.weHeld && !d.hold) {
      s.viewerPaused = true;
      setViewerPaused(true);
    }
    if (!s.wasPlaying && rolling) {
      // resumed (by the viewer, after buffering, or for the first time): snap back into place now
      s.everPlayed = true;
      s.playAttempts = 0;
      if (s.viewerPaused) {
        s.viewerPaused = false;
        setViewerPaused(false);
      }
      setNeedsTap(false);
      controller.current.forceNextSeek();
      s.urgent = true;
    }
    if (rolling || !snap.playing) s.wasPlaying = rolling;
    if (s.viewerPaused) return;

    if (!s.urgent && now - s.lastCorrection < correctionMs) return;
    s.urgent = false;
    s.lastCorrection = now;
    const c = controller.current.step(d, snap, now);
    if (c.seekTo != null) p.seek(c.seekTo);
    if (c.setRate != null) p.setRate(c.setRate);
    if (c.pause) {
      s.weHeld = true;
      p.pause();
    }
    if (c.play) {
      s.weHeld = false;
      p.play();
      if (!s.everPlayed && ++s.playAttempts >= 3) setNeedsTap(true);
    }
    if (!c.pause && !d.hold) s.weHeld = false;
    if (d.hold && !snap.playing) s.weHeld = true;
    setCmd((prev) =>
      prev?.mode === c.mode &&
      Math.abs((prev?.drift ?? 0) - c.drift) < 0.25 &&
      prev.setRate === c.setRate
        ? prev
        : c,
    );
  }, [player, correctionMs]);

  useEffect(() => {
    if (!active) return;
    tick();
    const t = setInterval(tick, 1000);
    const vis = () => {
      if (document.visibilityState !== "visible") return;
      controller.current.forceNextSeek();
      st.current.urgent = true;
      tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [active, tick, key]);

  const resume = useCallback(() => {
    const s = st.current;
    s.viewerPaused = false;
    s.urgent = true;
    s.wasPlaying = false;
    setViewerPaused(false);
    controller.current.forceNextSeek();
    const d = desiredRef.current;
    const p = player.current;
    if (p && d) {
      p.seek(d.time);
      if (!d.hold) p.play();
    }
    tick();
  }, [player, tick]);

  return { cmd, viewerPaused, needsTap, snapshot, resume };
}

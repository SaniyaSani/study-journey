import type { PlayerSnapshot } from "@shared/sync";

/** Common control surface for YouTube, self-hosted <video> and the illustrated view. */
export interface RoutePlayer {
  snapshot(): PlayerSnapshot | null;
  seek(seconds: number): void;
  setRate(rate: number): void;
  play(): void;
  pause(): void;
  /** footage with its own sound track (YouTube / video file) */
  setMuted?(muted: boolean): void;
  isMuted?(): boolean;
}

export type PlayerStatus = "loading" | "ready" | "failed";

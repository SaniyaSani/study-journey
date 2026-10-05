import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { RoutePlayer } from "./types";

/**
 * Embeds a YouTube video through the official IFrame Player API
 * (https://developers.google.com/youtube/iframe_api_reference).
 * - The video is never downloaded; YouTube controls and branding stay visible.
 * - It starts muted (browsers forbid audible autoplay); TRAIN SOUND ON unmutes the video's own audio.
 * - Error codes 100/101/150 (removed, private, embedding disabled) trigger the fallback view.
 */

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(r: number): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
  PlayerState: { PLAYING: number; BUFFERING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
export function loadYouTubeApi(timeoutMs = 10_000): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      apiPromise = null;
      reject(new Error("YouTube IFrame API did not load"));
    }, timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      apiPromise = null;
      reject(new Error("YouTube IFrame API could not be loaded"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

interface Props {
  videoId: string;
  title: string;
  startSeconds: number;
  /** false: cue the video paused at startSeconds (used to preload the next segment) */
  autoplay?: boolean;
  onReady: () => void;
  onFailed: (reason: string) => void;
}

export const YouTubeRoutePlayer = forwardRef<RoutePlayer, Props>(function YouTubeRoutePlayer(
  { videoId, title, startSeconds, autoplay = true, onReady, onFailed },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const fineRate = useRef(false);
  const cb = useRef({ onReady, onFailed });
  cb.current = { onReady, onFailed };
  const start = useRef(startSeconds);
  const auto = useRef(autoplay);

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement("div");
    host.current?.appendChild(el);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(el, {
          videoId,
          width: "100%",
          height: "100%",
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: auto.current ? 1 : 0,
            mute: 1,
            playsinline: 1,
            rel: 0,
            controls: 1,
            start: Math.floor(start.current),
          },
          events: {
            onReady: () => {
              const p = player.current!;
              p.mute();
              const rates = p.getAvailablePlaybackRates?.() ?? [1];
              fineRate.current =
                rates.some((r) => r > 0.9 && r < 1 && r !== 0.75) || rates.length > 8;
              ready.current = true;
              cb.current.onReady();
            },
            onError: (e: { data: number }) => {
              const reason =
                e.data === 101 || e.data === 150
                  ? "The video owner does not allow embedding."
                  : e.data === 100
                    ? "The video is no longer available."
                    : "The video could not be played.";
              cb.current.onFailed(reason);
            },
          },
        });
      })
      .catch((err: Error) => cb.current.onFailed(err.message));
    return () => {
      cancelled = true;
      try {
        player.current?.destroy();
      } catch {
        /* ignore */
      }
      player.current = null;
      el.remove();
    };
  }, [videoId]);

  useImperativeHandle(
    ref,
    () => ({
      snapshot() {
        const p = player.current;
        if (!p || !ready.current) return null;
        const state = p.getPlayerState();
        return {
          currentTime: p.getCurrentTime(),
          playing: state === 1 || state === 3,
          rate: p.getPlaybackRate(),
          supportsFineRate: fineRate.current,
          duration: p.getDuration() || undefined,
          buffering: state === 3,
        };
      },
      seek: (s) => player.current?.seekTo(s, true),
      setRate: (r) => player.current?.setPlaybackRate(r),
      play: () => player.current?.playVideo(),
      pause: () => player.current?.pauseVideo(),
      setMuted: (m) => {
        const p = player.current;
        if (!p || !ready.current) return;
        if (m) p.mute();
        else p.unMute();
      },
      isMuted: () => (ready.current ? (player.current?.isMuted?.() ?? true) : true),
    }),
    [],
  );

  return <div className="yt-host" ref={host} title={title} />;
});

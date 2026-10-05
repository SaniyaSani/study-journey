import { forwardRef, useImperativeHandle, useRef } from "react";
import type { RoutePlayer } from "./types";

interface Props {
  url: string;
  title: string;
  onReady: () => void;
  onFailed: (reason: string) => void;
}

/** Self-hosted MP4/WebM route video — only for footage the project owns or may use. */
export const VideoFileRoutePlayer = forwardRef<RoutePlayer, Props>(function VideoFileRoutePlayer(
  { url, title, onReady, onFailed },
  ref,
) {
  const v = useRef<HTMLVideoElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      snapshot() {
        const el = v.current;
        if (!el || el.readyState < 1) return null;
        return {
          currentTime: el.currentTime,
          playing: !el.paused,
          rate: el.playbackRate,
          supportsFineRate: true,
          duration: Number.isFinite(el.duration) ? el.duration : undefined,
        };
      },
      seek: (s) => {
        if (v.current) v.current.currentTime = s;
      },
      setRate: (r) => {
        if (v.current) v.current.playbackRate = r;
      },
      play: () => {
        v.current?.play().catch(() => undefined);
      },
      pause: () => v.current?.pause(),
      setMuted: (m) => {
        if (v.current) v.current.muted = m;
      },
      isMuted: () => v.current?.muted ?? true,
    }),
    [],
  );
  return (
    <video
      ref={v}
      className="route-video"
      src={url}
      title={title}
      muted
      playsInline
      preload="auto"
      controls
      onLoadedMetadata={onReady}
      onError={() => onFailed("The route video file could not be loaded.")}
    />
  );
});

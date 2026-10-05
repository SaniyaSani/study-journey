import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { JourneyVideoSegment } from "@shared/video";
import { IllustratedRouteView } from "../players/IllustratedRouteView";
import { VideoFileRoutePlayer } from "../players/VideoFileRoutePlayer";
import { YouTubeRoutePlayer } from "../players/YouTubeRoutePlayer";
import type { RoutePlayer } from "../players/types";

interface Props {
  segments: JourneyVideoSegment[];
  activeIndex: number;
  /** preload the following segment (cued, paused, muted) because its station is near */
  preloadNext: boolean;
  /** video second the active segment should start at (join-in-progress) */
  startSeconds: number;
  muted: boolean;
  lineColor?: string;
  reducedMotion: boolean;
  dayPeriod: "day" | "evening" | "night";
  /** names for the illustrated provider, one per covered stop of each segment */
  names: (segment: JourneyVideoSegment) => Array<{ nameJa: string; nameEn: string }>;
  onFailed: (videoKey: string, reason: string) => void;
}

export const segmentKey = (s: JourneyVideoSegment) => `${s.video.id}@${s.fromStopIndex}`;

/**
 * <TrainVideoPlayer/> — one control surface over route footage of any provider, across several
 * recordings. The active segment is exposed to the synchroniser through the ref; the next
 * segment is cued in the background when its boundary station is near, so the switch at the
 * station is a short black "tunnel" cut instead of a loading spinner. The journey clock does
 * not care: it keeps running through the cut.
 */
export const TrainVideoPlayer = forwardRef<RoutePlayer, Props>(function TrainVideoPlayer(
  {
    segments,
    activeIndex,
    preloadNext,
    startSeconds,
    muted,
    lineColor,
    reducedMotion,
    dayPeriod,
    names,
    onFailed,
  },
  ref,
) {
  const slots = useRef(new Map<string, RoutePlayer | null>());
  const active = segments[activeIndex];
  const next = preloadNext ? segments[activeIndex + 1] : undefined;
  const activeKey = active ? segmentKey(active) : "";
  const [cut, setCut] = useState(false);
  const prevKey = useRef(activeKey);

  useEffect(() => {
    if (prevKey.current === activeKey) return;
    prevKey.current = activeKey;
    setCut(true);
    const t = setTimeout(() => setCut(false), reducedMotion ? 0 : 700);
    return () => clearTimeout(t);
  }, [activeKey, reducedMotion]);

  const current = () => slots.current.get(activeKey) ?? null;
  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => current()?.snapshot() ?? null,
      seek: (s) => current()?.seek(s),
      setRate: (r) => current()?.setRate(r),
      play: () => current()?.play(),
      pause: () => current()?.pause(),
      setMuted: (m) => current()?.setMuted?.(m),
      isMuted: () => current()?.isMuted?.() ?? true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey],
  );

  // keep the audible state on the active slot; background slots are always muted
  const applied = useRef(new Map<string, boolean>());
  useEffect(() => {
    slots.current.forEach((p, k) => {
      const want = k === activeKey ? muted : true;
      if (applied.current.get(k) === want && p?.isMuted?.() === want) return;
      p?.setMuted?.(want);
      applied.current.set(k, want);
    });
  });

  const render = (seg: JourneyVideoSegment, isActive: boolean) => {
    const key = segmentKey(seg);
    const v = seg.video;
    const setRef = (p: RoutePlayer | null) => {
      if (p) slots.current.set(key, p);
      else slots.current.delete(key);
    };
    const start = isActive ? startSeconds : seg.frames[0].arrival;
    const fail = (reason: string) => onFailed(v.id, reason);
    let el: JSX.Element;
    if (v.provider === "youtube" && v.videoId) {
      el = (
        <YouTubeRoutePlayer
          ref={setRef}
          videoId={v.videoId}
          title={v.title}
          startSeconds={start}
          autoplay={isActive}
          onReady={() => undefined}
          onFailed={fail}
        />
      );
    } else if (v.provider === "self-hosted" && v.url) {
      el = (
        <VideoFileRoutePlayer
          ref={setRef}
          url={v.url}
          title={v.title}
          onReady={() => undefined}
          onFailed={fail}
        />
      );
    } else {
      const n = names(seg);
      el = (
        <IllustratedRouteView
          ref={setRef}
          stations={seg.frames.map((f, i) => ({
            nameJa: n[i]?.nameJa ?? "",
            nameEn: n[i]?.nameEn ?? "",
            arrivalFrame: f.arrival,
            departureFrame: f.departure,
          }))}
          durationSeconds={
            v.videoEndSeconds ??
            v.durationSeconds ??
            seg.frames[seg.frames.length - 1].departure + 30
          }
          lineColor={lineColor}
          reducedMotion={reducedMotion}
          dayPeriod={dayPeriod}
          initialTime={start}
          label={`Illustrated cab view: ${v.title}`}
        />
      );
    }
    return (
      <div
        key={key}
        className={`tvp-slot${isActive ? " is-active" : " is-preloading"}`}
        aria-hidden={isActive ? undefined : true}
        data-provider={v.provider}
      >
        {el}
      </div>
    );
  };

  return (
    <div className="tvp">
      {active && render(active, true)}
      {next && segmentKey(next) !== activeKey && render(next, false)}
      <div className={`tvp-cut${cut ? " on" : ""}`} aria-hidden="true" />
    </div>
  );
});

import { ANNOUNCEMENT_LABEL } from "@shared/announcements";
import { routeViewLabel } from "../components";
import { TrainVideoPlayer } from "../video/TrainVideoPlayer";
import { FootageBand } from "./FootageBand";
import { RouteView } from "./RouteView";
import type { Journey } from "./useJourney";

/**
 * 車窓 — the window. YouTube / owned video is shown whole (letterboxed) so its controls and
 * branding stay visible; the illustrated view fills the frame. Our overlays never cover a
 * third-party player.
 */
export function JourneyPlayer({ j, lineColor }: { j: Journey; lineColor: string }) {
  // never print over a third-party player
  const outside = j.realFootage || j.viewKind === "youtube" || j.viewKind === "self-hosted";
  const label = routeViewLabel(j.source, j.viewKind === "illustrated" ? "illustrated" : "video");
  return (
    <div
      className={`window window--${j.viewKind}${j.footageSegment ? ` window--src-${j.footageSegment.video.provider}` : ""}`}
    >
      {j.viewKind === "footage" && j.footage ? (
        <figure className="route-view route-view--footage" aria-label="Route footage">
          <div className="route-view-frame">
            <TrainVideoPlayer
              ref={j.playerRef}
              segments={j.videoPlan.segments}
              activeIndex={j.footage.segmentIndex}
              preloadNext={j.preloadNext}
              startSeconds={j.initialTime}
              muted={j.videoMuted}
              lineColor={lineColor}
              reducedMotion={j.reducedMotion}
              dayPeriod={dayPeriodFor(j.now)}
              names={(seg) => j.journeyStations.slice(seg.fromStopIndex, seg.toStopIndex + 1)}
              onFailed={j.failVideo}
            />
          </div>
          {j.footageSegment && j.footageSegment.video.provider !== "illustrated" && (
            <p className="route-view-credit">
              Video: {j.footageSegment.video.title} — {j.footageSegment.video.creator}
              {" · "}
              <a href={j.footageSegment.video.sourceUrl} target="_blank" rel="noreferrer noopener">
                Source
              </a>
              {" · "}
              {j.footageSegment.video.provider === "youtube"
                ? "Embedded via YouTube"
                : "Used with permission"}
              {" · recorded footage, not a live camera"}
            </p>
          )}
        </figure>
      ) : (
        <RouteView
          ref={j.playerRef}
          key={j.playerKey}
          kind={j.viewKind}
          manifest={j.manifest}
          markers={j.markers}
          names={j.stationsMap}
          lineColor={lineColor}
          reducedMotion={j.reducedMotion}
          label={label}
          fallbackReason={j.fallbackReason}
          initialTime={j.initialTime}
          onVideoFailed={(r) => j.setVideoFailure(r)}
          onReady={() => undefined}
        />
      )}
      <FootageBand j={j} />
      {j.settings.captions && (
        <div
          className={`captions${j.subtitle ? " visible" : ""}${outside ? " captions--outside" : ""}`}
          role="status"
          aria-live="polite"
        >
          {j.subtitle && (
            <>
              <span className="captions-label">{ANNOUNCEMENT_LABEL}</span>
              {j.settings.announcementLanguage !== "en" && (
                <span className="captions-ja" lang="ja">
                  {j.subtitle.event.textJa}
                </span>
              )}
              {j.settings.announcementLanguage !== "ja" && (
                <span className="captions-en">{j.subtitle.event.textEn}</span>
              )}
              {j.subtitle.silentLanguages.includes("ja-JP") && (
                <span className="captions-note">No Japanese voice available — text only.</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function dayPeriodFor(ms: number): "day" | "evening" | "night" {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    }).format(ms),
  );
  if (h >= 7 && h < 16) return "day";
  if (h >= 16 && h < 20) return "evening";
  return "night";
}

import { forwardRef } from "react";
import type { RouteMediaManifest } from "@shared/types";
import type { ResolvedMarker } from "@shared/sync";
import { IllustratedRouteView, type IllustratedStation } from "../players/IllustratedRouteView";
import { VideoFileRoutePlayer } from "../players/VideoFileRoutePlayer";
import { YouTubeRoutePlayer } from "../players/YouTubeRoutePlayer";
import type { RoutePlayer } from "../players/types";

export type ViewKind = "youtube" | "self-hosted" | "illustrated" | "footage";

interface Props {
  kind: ViewKind;
  manifest: RouteMediaManifest | null;
  markers: ResolvedMarker[];
  names: Map<string, { nameJa: string; nameEn: string }>;
  lineColor?: string;
  reducedMotion: boolean;
  label: string;
  fallbackReason: string | null;
  initialTime: number;
  onVideoFailed: (reason: string) => void;
  onReady: () => void;
}

export const RouteView = forwardRef<RoutePlayer, Props>(function RouteView(props, ref) {
  const {
    kind,
    manifest,
    markers,
    names,
    lineColor,
    reducedMotion,
    label,
    fallbackReason,
    initialTime,
  } = props;
  const video = manifest?.video;

  const illustrated: IllustratedStation[] = markers.map((m) => ({
    nameJa: names.get(m.stationId)?.nameJa ?? "",
    nameEn: names.get(m.stationId)?.nameEn ?? "",
    arrivalFrame: m.arrivalFrame,
    departureFrame: m.departureFrame,
  }));
  const duration =
    (kind === "illustrated" && video?.provider === "illustrated"
      ? video.durationSeconds
      : undefined) ?? (markers[markers.length - 1]?.departureFrame ?? 0) + 30;

  return (
    <figure className="route-view" aria-label="Route view">
      <figcaption className="route-view-label">
        <span className="rec-dot" aria-hidden="true" />
        {label}
      </figcaption>
      <div className="route-view-frame">
        {kind === "youtube" && video?.videoId ? (
          <YouTubeRoutePlayer
            ref={ref}
            videoId={video.videoId}
            title={video.title}
            startSeconds={initialTime}
            onReady={props.onReady}
            onFailed={props.onVideoFailed}
          />
        ) : kind === "self-hosted" && video?.url ? (
          <VideoFileRoutePlayer
            ref={ref}
            url={video.url}
            title={video.title}
            onReady={props.onReady}
            onFailed={props.onVideoFailed}
          />
        ) : (
          <>
            <IllustratedRouteView
              ref={ref}
              stations={illustrated}
              durationSeconds={duration}
              lineColor={lineColor}
              reducedMotion={reducedMotion}
              dayPeriod={manifest?.tags?.dayPeriod ?? dayPeriodNow()}
              initialTime={initialTime}
              label={`Illustrated cab view. ${label}`}
            />
            {fallbackReason && (
              <div className="route-view-notice" role="status">
                <strong>Route video not available</strong>
                <span>{fallbackReason}</span>
                <span className="muted-on-dark">
                  The map, stations and timetable keep running as normal.
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {video && kind !== "illustrated" && (
        <p className="route-view-credit">
          Video: {video.title} — {video.creator}
          {" · "}
          <a href={video.sourceUrl} target="_blank" rel="noreferrer noopener">
            Source
          </a>
          {" · "}
          {video.licenseStatus === "platform-embed"
            ? "Embedded via YouTube"
            : video.licenseStatus === "permission-granted"
              ? "Used with permission"
              : video.licenseStatus === "owned"
                ? "Owned footage"
                : "Demo"}
        </p>
      )}
    </figure>
  );
});

function dayPeriodNow(): "day" | "evening" | "night" {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    }).format(new Date()),
  );
  if (h >= 7 && h < 16) return "day";
  if (h >= 16 && h < 20) return "evening";
  return "night";
}

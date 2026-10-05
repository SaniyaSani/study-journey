import { z } from "zod";
import bundledManifests from "./data/media/manifests.json";
import type { RouteMediaManifest } from "@shared/types";

const marker = z.object({
  stationId: z.string().min(1),
  videoTimeSeconds: z.number().min(0),
  arrivalFrameSeconds: z.number().min(0).optional(),
  departureFrameSeconds: z.number().min(0).optional(),
});

export const manifestSchema = z
  .object({
    routeId: z.string().min(1),
    operatorId: z.string().min(1),
    direction: z.string(),
    originStationId: z.string().min(1),
    destinationStationId: z.string().min(1),
    video: z
      .object({
        provider: z.enum(["youtube", "self-hosted", "illustrated"]),
        videoId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{6,20}$/)
          .optional(),
        url: z.string().optional(),
        title: z.string().min(1),
        creator: z.string().min(1),
        sourceUrl: z.string().min(1),
        licenseStatus: z.enum(["permission-granted", "platform-embed", "owned", "demo"]),
        attributionRequired: z.boolean(),
        durationSeconds: z.number().positive().optional(),
      })
      .refine(
        (v) => v.provider !== "youtube" || Boolean(v.videoId),
        "YouTube videos need a videoId",
      )
      .refine(
        (v) => v.provider !== "self-hosted" || Boolean(v.url),
        "Self-hosted videos need a url",
      )
      .refine(
        (v) =>
          v.provider !== "self-hosted" ||
          v.licenseStatus === "owned" ||
          v.licenseStatus === "permission-granted",
        "Self-hosted footage must be owned or used with explicit permission",
      )
      .optional(),
    stationMarkers: z.array(marker).min(2),
    audio: z
      .object({ ambienceUrl: z.string().optional(), announcementPackId: z.string().optional() })
      .optional(),
    tags: z
      .object({
        season: z.string().optional(),
        dayPeriod: z.enum(["day", "evening", "night"]).optional(),
        weather: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (m) =>
      m.stationMarkers.every(
        (s, i, arr) => i === 0 || s.videoTimeSeconds > arr[i - 1].videoTimeSeconds,
      ),
    "stationMarkers must be in travel order with increasing videoTimeSeconds",
  );

export class MediaLibrary {
  private manifests: RouteMediaManifest[] = [];
  readonly warnings: string[] = [];

  constructor(raw: unknown) {
    const list = Array.isArray(raw) ? raw : ((raw as { manifests?: unknown[] })?.manifests ?? []);
    list.forEach((entry, i) => {
      const parsed = manifestSchema.safeParse(entry);
      if (parsed.success) this.manifests.push(parsed.data as RouteMediaManifest);
      else
        this.warnings.push(
          `Manifest #${i} ignored: ${parsed.error.issues.map((x) => x.message).join("; ")}`,
        );
    });
  }

  /** The manifests bundled with the app (server/data/media/manifests.json). */
  static bundled(): MediaLibrary {
    const lib = new MediaLibrary(bundledManifests);
    for (const w of lib.warnings) console.warn(`[media] ${w}`);
    return lib;
  }

  forRoute(routeId: string): RouteMediaManifest[] {
    return this.manifests.filter((m) => m.routeId === routeId);
  }

  /** Best manifest whose markers cover origin → destination in travel order. */
  match(
    routeId: string,
    originStationId?: string,
    destinationStationId?: string,
  ): RouteMediaManifest | null {
    const candidates = this.forRoute(routeId);
    if (!originStationId || !destinationStationId) return candidates[0] ?? null;
    return (
      candidates.find((m) => {
        const o = m.stationMarkers.findIndex((s) => s.stationId === originStationId);
        const d = m.stationMarkers.findIndex((s) => s.stationId === destinationStationId);
        return o >= 0 && d > o;
      }) ?? null
    );
  }
}

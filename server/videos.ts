import { z } from "zod";
import type { TrainVideo } from "@shared/video";
import bundledCatalog from "./data/videos/catalog.json";

const marker = z.object({
  stationId: z.string().optional(),
  stationName: z.string().min(1),
  videoTime: z.number().min(0),
  arrivalTime: z.number().min(0).optional(),
  departureTime: z.number().min(0).optional(),
});

export const trainVideoSchema = z
  .object({
    id: z.string().min(3),
    provider: z.enum(["youtube", "self-hosted", "illustrated"]),
    videoId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{6,20}$/)
      .optional(),
    url: z.string().optional(),
    title: z.string().min(1),
    creator: z.string().min(1),
    sourceUrl: z.string().min(1),
    licenseStatus: z.enum(["platform-embed", "permission-granted", "owned", "demo"]),
    embedStatus: z.enum(["verified", "unverified", "not-applicable"]),
    railwayOperator: z.string(),
    lineIds: z.array(z.string()),
    lineNames: z.array(z.string()),
    direction: z.string(),
    coverage: z.object({ from: z.string(), to: z.string() }),
    serviceTypes: z.array(z.string()),
    videoStartSeconds: z.number().min(0),
    videoEndSeconds: z.number().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    recordingPeriod: z.enum(["morning", "day", "sunset", "night"]).optional(),
    season: z.string().optional(),
    weather: z.string().optional(),
    sceneryTags: z.array(z.string()).optional(),
    calibration: z.enum(["calibrated", "needs-calibration"]),
    stationMarkers: z.array(marker),
    notes: z.string().optional(),
  })
  .refine((v) => v.provider !== "youtube" || Boolean(v.videoId), "YouTube footage needs a videoId")
  .refine((v) => v.provider !== "self-hosted" || Boolean(v.url), "Self-hosted footage needs a url")
  .refine(
    (v) =>
      v.provider !== "self-hosted" ||
      v.licenseStatus === "owned" ||
      v.licenseStatus === "permission-granted",
    "Self-hosted footage must be owned or used with permission",
  )
  .refine(
    (v) => v.calibration !== "calibrated" || v.stationMarkers.length >= 2,
    "Calibrated footage needs at least two station markers",
  )
  .refine(
    (v) => v.stationMarkers.every((m, i, a) => i === 0 || m.videoTime > a[i - 1].videoTime),
    "Station markers must be in travel order with increasing times",
  );

/** Curated footage catalog (validated; invalid entries are skipped with a warning). */
export class VideoCatalog {
  readonly videos: TrainVideo[] = [];
  readonly warnings: string[] = [];

  constructor(raw: unknown) {
    const list = Array.isArray(raw) ? raw : ((raw as { videos?: unknown[] })?.videos ?? []);
    list.forEach((entry, i) => {
      const r = trainVideoSchema.safeParse(entry);
      if (r.success) this.videos.push(r.data as TrainVideo);
      else
        this.warnings.push(
          `Video #${i} ignored: ${r.error.issues.map((x) => x.message).join("; ")}`,
        );
    });
  }

  static bundled(): VideoCatalog {
    const c = new VideoCatalog(bundledCatalog);
    for (const w of c.warnings) console.warn(`[videos] ${w}`);
    return c;
  }
}

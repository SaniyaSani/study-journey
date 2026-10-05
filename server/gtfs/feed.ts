import { unzipSync, strFromU8 } from "fflate";
import { parseCsv } from "./csv";
import { fetchWithRetry } from "../http";

export const GTFS_FILES = [
  "agency.txt",
  "routes.txt",
  "stops.txt",
  "trips.txt",
  "stop_times.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "shapes.txt",
  "translations.txt",
  "feed_info.txt",
  // GTFS-JP extensions
  "agency_jp.txt",
  "routes_jp.txt",
] as const;

export type GtfsTable = Array<Record<string, string>>;
export type GtfsFeed = Partial<Record<(typeof GTFS_FILES)[number], GtfsTable>>;

const REQUIRED = ["agency.txt", "routes.txt", "stops.txt", "trips.txt", "stop_times.txt"] as const;

export function parseFeedFiles(files: Record<string, string>): GtfsFeed {
  const feed: GtfsFeed = {};
  for (const name of GTFS_FILES) {
    // zips sometimes contain a top-level folder
    const key = Object.keys(files).find((k) => k === name || k.endsWith(`/${name}`));
    if (key) feed[name] = parseCsv(files[key]);
  }
  const missing = REQUIRED.filter((r) => !feed[r]);
  if (missing.length) throw new Error(`GTFS feed is missing required files: ${missing.join(", ")}`);
  if (!feed["calendar.txt"] && !feed["calendar_dates.txt"]) {
    throw new Error("GTFS feed needs calendar.txt and/or calendar_dates.txt");
  }
  return feed;
}

export function readZip(buf: Uint8Array): Record<string, string> {
  const entries = unzipSync(buf, { filter: (f) => f.name.endsWith(".txt") });
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(entries)) out[name] = strFromU8(data);
  return out;
}

/** Downloads an authorised remote GTFS zip (works on Node and Cloudflare Workers). */
export async function loadFeedFromUrl(url: string): Promise<GtfsFeed> {
  const res = await fetchWithRetry(url, { timeoutMs: 60_000, retries: 2 });
  return parseFeedFiles(readZip(new Uint8Array(await res.arrayBuffer())));
}

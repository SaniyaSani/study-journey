import fs from "node:fs";
import path from "node:path";
import { parseFeedFiles, readZip, type GtfsFeed } from "./feed";
import { fetchWithRetry } from "../http";

/** Node only: loads a GTFS/GTFS-JP feed from a directory or a .zip file. */
export function loadFeedFromPath(p: string): GtfsFeed {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    const files: Record<string, string> = {};
    for (const f of fs.readdirSync(p)) {
      if (f.endsWith(".txt")) files[f] = fs.readFileSync(path.join(p, f), "utf8");
    }
    return parseFeedFiles(files);
  }
  return parseFeedFiles(readZip(new Uint8Array(fs.readFileSync(p))));
}

/** Node only: downloads a remote feed and keeps a disk copy for offline restarts. */
export async function loadFeedFromUrlCached(url: string, cacheDir: string): Promise<GtfsFeed> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, "gtfs-feed.zip");
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 60_000, retries: 2 });
    const buf = new Uint8Array(await res.arrayBuffer());
    const feed = parseFeedFiles(readZip(buf));
    fs.writeFileSync(cacheFile, buf);
    return feed;
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      console.warn("[gtfs] remote feed unavailable, using cached copy");
      return parseFeedFiles(readZip(new Uint8Array(fs.readFileSync(cacheFile))));
    }
    throw err;
  }
}

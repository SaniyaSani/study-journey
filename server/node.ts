import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app";
import { readConfig } from "./config";
import { loadFeedFromPath, loadFeedFromUrlCached } from "./gtfs/feedNode";
import { MediaLibrary } from "./media";
import { mediaFromFile } from "./mediaNode";
import { createRegistry } from "./providers/registry";

/** Loads .env (if present) without overriding real environment variables. */
function loadDotEnv(file = path.resolve(process.cwd(), ".env")): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadDotEnv();
const cfg = readConfig(process.env);
const cacheDir = path.resolve(process.cwd(), ".cache");
const registry = createRegistry(cfg, {
  loadGtfsFeed: cfg.gtfsLocalPath
    ? () => loadFeedFromPath(path.resolve(process.cwd(), cfg.gtfsLocalPath!))
    : cfg.gtfsFeedUrl
      ? () => loadFeedFromUrlCached(cfg.gtfsFeedUrl!, cacheDir)
      : undefined,
});
const media = cfg.mediaManifestPath
  ? mediaFromFile(path.resolve(process.cwd(), cfg.mediaManifestPath))
  : MediaLibrary.bundled();

const app = createApp(registry, media);

// Self-hosted, licensed media (videos, announcement packs) — see docs/ROUTE_MEDIA.md
app.use("/media/*", serveStatic({ root: "./" }));
// Built client (npm run build); SPA fallback to index.html
const clientDir = "dist/client";
if (fs.existsSync(path.join(clientDir, "index.html"))) {
  app.use("/*", serveStatic({ root: `./${clientDir}` }));
  app.get("*", serveStatic({ path: `./${clientDir}/index.html` }));
}

serve({ fetch: app.fetch, port: cfg.port }, () => {
  console.log(`[study-journey] listening on http://localhost:${cfg.port}`);
  for (const p of registry.status()) {
    console.log(
      `  provider ${p.id.padEnd(9)} ${p.enabled ? "enabled " : "disabled"}${p.active ? " (active)" : ""}${p.reason ? ` — ${p.reason}` : ""}`,
    );
  }
});

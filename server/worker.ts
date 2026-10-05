import type { Hono } from "hono";
import { createApp } from "./app";
import { readConfig, type EnvLike } from "./config";
import { MediaLibrary } from "./media";
import { createRegistry } from "./providers/registry";

/**
 * Cloudflare Workers entry. /api/* is handled here; everything else is served from the
 * built client through the static-assets binding (SPA fallback configured in wrangler.jsonc).
 * Secrets (ODPT_API_KEY, …) are Worker secrets: `npx wrangler secret put ODPT_API_KEY`.
 */
// Minimal Workers runtime types (avoids pulling global Workers typings into the Node build)
interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}
interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface Env {
  ASSETS: AssetsBinding;
  [binding: string]: unknown;
}

let app: Hono | null = null;

function getApp(env: Env): Hono {
  // one registry per isolate: keeps the in-memory caches warm between requests
  if (!app) {
    const vars: EnvLike = {};
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") vars[k] = v;
    const cfg = readConfig(vars);
    app = createApp(createRegistry(cfg), MediaLibrary.bundled());
  }
  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/"))
      return getApp(env).fetch(request, env, ctx as unknown as Parameters<Hono["fetch"]>[2]);
    return env.ASSETS.fetch(request);
  },
};

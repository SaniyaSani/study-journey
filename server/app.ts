import { Hono } from "hono";
import { createJapanApi } from "./api";
import type { MediaLibrary } from "./media";
import type { ProviderRegistry } from "./providers/registry";

/**
 * Platform-neutral HTTP app (Hono). Used by the Node server (server/node.ts) and by the
 * Cloudflare Worker (server/worker.ts). Static files are served by the platform entry.
 */
export function createApp(registry: ProviderRegistry, media: MediaLibrary): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/japan", createJapanApi(registry, media));
  app.all("/api/*", (c) =>
    c.json({ error: { code: "NOT_FOUND", message: "Unknown endpoint" } }, 404),
  );
  return app;
}

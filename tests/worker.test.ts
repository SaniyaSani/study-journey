import { describe, expect, it } from "vitest";
import worker from "../server/worker";

/** The Cloudflare Worker entry: /api/* is handled by the app, everything else by ASSETS. */
describe("Cloudflare Worker entry", () => {
  const assets = {
    fetch: async (req: Request) => new Response(`asset:${new URL(req.url).pathname}`),
  };
  const env = { ASSETS: assets, RAILWAY_PROVIDER: "demo", ODPT_API_KEY: "" };
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined };

  it("serves the API from the bundled demo data (no filesystem)", async () => {
    const res = await worker.fetch(new Request("https://x.dev/api/japan/operators"), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }>; meta: { dataMode: string } };
    expect(body.data[0].id).toBe("demo:SJDEMO");
    expect(body.meta.dataMode).toBe("demo");
    const media = await worker.fetch(
      new Request("https://x.dev/api/japan/routes/demo%3ASAKURA/media"),
      env,
      ctx,
    );
    expect(
      ((await media.json()) as { data: { available: unknown[] } }).data.available,
    ).toHaveLength(2);
  });

  it("delegates pages and static files to the assets binding", async () => {
    const res = await worker.fetch(new Request("https://x.dev/ride"), env, ctx);
    expect(await res.text()).toBe("asset:/ride");
  });

  it("returns structured 404s for unknown API paths", async () => {
    const res = await worker.fetch(new Request("https://x.dev/api/nope"), env, ctx);
    expect(res.status).toBe(404);
  });
});

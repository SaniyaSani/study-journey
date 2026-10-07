# Deploying

The API is a [Hono](https://hono.dev) app that runs unchanged on **Node** and on
**Cloudflare Workers**. Railway credentials stay on the server in both cases.

## Cloudflare Workers (recommended)

One Worker serves both the API (`/api/*`) and the built site (static assets binding with
SPA fallback). Configuration: `wrangler.jsonc`.

1. Create a free Cloudflare account and install dependencies: `npm install`.
2. Log in once: `npx wrangler login`.
3. Deploy: `npm run cf:deploy` (builds the client, then `wrangler deploy`).
   Wrangler prints the URL, e.g. `https://study-journey.<your-subdomain>.workers.dev`.
4. Real data works without any key: with `RAILWAY_PROVIDER=odpt` and no `ODPT_API_KEY`, the
   keyless public ODPT endpoint (`api-public.odpt.org`) is used — Toei subway lines, Nippori-Toneri
   Liner and Sakura Tram with timetables, live positions and service information (CC BY 4.0).
   Note: timetable payloads are 1–2 MB; on the Workers **Free** plan (10 ms CPU per request) the
   first load of a line can exceed the CPU limit (error 1102). Reload once (the result is cached
   in the isolate) or use Workers Paid if it happens often.
5. Optional full ODPT data — store secrets (never in `wrangler.jsonc`):
   ```bash
   npx wrangler secret put ODPT_API_KEY
   ```
   and set plain variables in `wrangler.jsonc → vars` (e.g. `"RAILWAY_PROVIDER": "odpt"`,
   `"ODPT_OPERATORS": "odpt.Operator:TokyoMetro"`), then deploy again.
6. Optional custom domain: Cloudflare dashboard → Workers & Pages → your Worker →
   Settings → Domains & Routes.

Local preview of the real Worker runtime: `npm run cf:dev` (http://localhost:8787).
Bundle check without deploying: `npm run cf:check`.

### Deploy from GitHub automatically

Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick the repo.
Build command `npm run build:client`, deploy command `npx wrangler deploy`. Add
`ODPT_API_KEY` as a secret in the Worker's settings.

### Differences from Node

| Feature                                 | Node                                                         | Workers                                                                         |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Demo railway                            | bundled                                                      | bundled                                                                         |
| GTFS feed                               | `GTFS_LOCAL_PATH` (dir/zip) or `GTFS_FEED_URL` (disk-cached) | `GTFS_FEED_URL` only (kept in memory per isolate)                               |
| Route media manifests                   | file (`ROUTE_MEDIA_MANIFEST`) or bundled                     | bundled `server/data/media/manifests.json` — edit and redeploy                  |
| Self-hosted videos / announcement packs | `media/` folder at `/media/...`                              | put them in `client/public/media/...` (served as assets; 25 MiB per file limit) |
| Caches                                  | per process                                                  | per isolate (in-memory)                                                         |

## Node hosts (Render, Railway, Fly.io, VPS)

Build command `npm install && npm run build`, start command `npm start`. Set environment
variables from `.env.example` in the host's dashboard.

// Cloudflare Worker entry: /api/* -> AI endpoints, everything else -> static files from ./public
import { onRequest } from "./functions/api/[[path]].js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  },
};

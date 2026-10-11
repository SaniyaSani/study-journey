// Cloudflare Pages Function: the AI endpoints of server.mjs, without the Node-only parts.
// PDF/PPTX text extraction and speech-to-text need real binaries (pdftotext, whisper) and are reported as unavailable here.
import { analyzeLecture, rescue, explainSelection } from "../../stages.mjs";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const segs = a => (Array.isArray(a) ? a : []).slice(0, 1500).map((s, i) => ({ i: Number.isInteger(s.i) ? s.i : i, t: +s.t || 0, text: String(s.text || "").slice(0, 1200), unclear: !!s.unclear }));

export async function onRequest({ request, env }) {
  const path = new URL(request.url).pathname.replace(/^\/api\//, "");
  if (path === "status") return json({ llm: Boolean(env.ANTHROPIC_API_KEY), stt: null, extract: { pdf: false, pptx: false } });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no API key" }, 503);
  let b; try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  try {
    if (path === "analyze") return json({ concepts: await analyzeLecture({ course: String(b.course || "this course").slice(0, 80), segments: segs(b.segments) }) });
    if (path === "rescue") return json(await rescue({ segments: segs(b.segments), known: (b.known || []).slice(0, 40).map(String) }));
    if (path === "explain") return json(await explainSelection({ course: String(b.course || "this course").slice(0, 80), mode: String(b.mode || "simple"), text: String(b.text || "").slice(0, 3000), context: String(b.context || "").slice(0, 3000), question: String(b.question || "").slice(0, 500) }));
  } catch (e) { return json({ error: "server error" }, e.status || 500); } // transcripts are never logged
  return json({ error: "not available on this host" }, 501);
}

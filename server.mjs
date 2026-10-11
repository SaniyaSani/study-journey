import http from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomUUID } from "node:crypto";
import { sttProvider, sttInfo, sttInit, transcribe } from "./stt.mjs";
import { llmAvailable } from "./llm.mjs";
import { analyzeLecture, rescue, explainSelection } from "./stages.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const has = async cmd => { try { await run(cmd, ["-v"], { timeout: 4000 }).catch(e => { if (e.code === "ENOENT") throw e; }); return true; } catch (e) { return false; } };
await sttInit();
const CAN = { pdf: await has("pdftotext"), pptx: await has("unzip") };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const PUB = path.resolve(new URL("./public", import.meta.url).pathname);

const PORT = process.env.PORT || 8787;
const jobs = new Map(); // transcription jobs, kept 30 min after they finish
async function startJob(req, url) {
  if (!sttProvider()) throw Object.assign(new Error("no transcription service"), { status: 503 });
  if ([...jobs.values()].filter(j => j.status === "working").length >= 2) throw Object.assign(new Error("busy, try again in a minute"), { status: 429 });
  const dir = await mkdtemp(path.join(tmpdir(), "kitten-")), file = path.join(dir, "upload");
  try {
    let n = 0; const max = (+process.env.MAX_AUDIO_MB || 300) * 1e6;
    await pipeline(req, new Transform({ transform(c, _e, cb) { n += c.length; n > max ? cb(Object.assign(new Error("recording too large"), { status: 413 })) : cb(null, c); } }), createWriteStream(file));
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
  const id = randomUUID(), job = { status: "working", progress: 0 }; jobs.set(id, job);
  const prompt = (url.searchParams.get("prompt") || "").slice(0, 800), glossary = (url.searchParams.get("glossary") || "").slice(0, 600), lang = /^(auto|[a-z]{2,3})$/.test(url.searchParams.get("lang") || "") ? url.searchParams.get("lang") : "auto";
  transcribe(file, dir, { prompt, glossary, lang, onProgress: p => { job.progress = p; } })
    .then(s => { job.segments = s; job.meta = s.meta || { engine: sttProvider() }; job.status = "done"; job.progress = 1; })
    .catch(e => { console.error("transcription failed:", String(e.message).slice(0, 400)); job.status = "error"; })
    .finally(() => { rm(dir, { recursive: true, force: true }); setTimeout(() => jobs.delete(id), 30 * 60e3).unref(); }); // audio is deleted from the server right away
  return { job: id };
}
async function saveUpload(req, max) {
  const dir = await mkdtemp(path.join(tmpdir(), "kitten-x-")), file = path.join(dir, "upload");
  try {
    let n = 0;
    await pipeline(req, new Transform({ transform(c, _e, cb) { n += c.length; n > max ? cb(Object.assign(new Error("file too large"), { status: 413 })) : cb(null, c); } }), createWriteStream(file));
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
  return { dir, file };
}
const decodeXml = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/* Text of a PDF (one entry per page) or a PPTX (one per slide). The file is deleted right afterwards. */
async function extractText(kind, file) {
  if (kind === "pdf") {
    if (!CAN.pdf) throw Object.assign(new Error("pdf text extraction is not installed on this server"), { status: 501 });
    const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { maxBuffer: 80e6, timeout: 60000 });
    const pages = stdout.split("\f").map((t, i) => ({ n: i + 1, text: t.replace(/[ \t]+\n/g, "\n").trim() })).filter((p, i, a) => p.text || i < a.length - 1);
    return { pages, via: "pdftotext", scanned: pages.every(p => !p.text) };
  }
  if (kind === "pptx") {
    if (!CAN.pptx) throw Object.assign(new Error("slide text extraction is not installed on this server"), { status: 501 });
    const { stdout: list } = await run("unzip", ["-Z1", file], { maxBuffer: 4e6, timeout: 20000 });
    const slides = list.split("\n").filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
    const pages = [];
    for (const [i, f] of slides.entries()) {
      const { stdout: xml } = await run("unzip", ["-p", file, f], { maxBuffer: 20e6, timeout: 20000 });
      const text = xml.split(/<\/a:p>/).map(p => [...p.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m => decodeXml(m[1])).join("")).filter(Boolean).join("\n");
      pages.push({ n: i + 1, text });
    }
    return { pages, via: "unzip", scanned: false };
  }
  throw Object.assign(new Error("unsupported kind"), { status: 400 });
}
const hits = new Map(); // tiny per-IP rate limit: 30 requests / minute
const limited = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000); a.push(now); hits.set(ip, a); return a.length > 30; };
const readBody = req => new Promise((res, rej) => { let n = 0, b = ""; req.on("data", c => { n += c.length; if (n > 2e6) { rej(Object.assign(new Error("too big"), { status: 413 })); req.destroy() } else b += c }); req.on("end", () => { try { res(JSON.parse(b || "{}")) } catch (e) { rej(Object.assign(e, { status: 400 })) } }); });
const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const cleanSegs = a => (Array.isArray(a) ? a : []).slice(0, 1500).map((s, i) => ({ i: Number.isInteger(s.i) ? s.i : i, t: +s.t || 0, text: String(s.text || "").slice(0, 1200), unclear: !!s.unclear }));

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname), file = path.resolve(PUB, "." + rel);
      if (!file.startsWith(PUB + path.sep)) return send(res, 403, { error: "no" });
      try { const buf = await readFile(file); res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" }); return res.end(buf); }
      catch (e) { return send(res, 404, { error: "not found" }); }
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
    if (url.pathname === "/api/status") return send(res, 200, { llm: llmAvailable(), stt: sttProvider(), sttInfo: sttInfo(), extract: CAN });
    const jm = url.pathname.match(/^\/api\/job\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && jm) { const j = jobs.get(jm[1]); return j ? send(res, 200, j) : send(res, 404, { error: "gone" }); }
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: "slow down" });
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    if (url.pathname === "/api/transcribe") return send(res, 202, await startJob(req, url));
    if (url.pathname === "/api/extract") {
      const kind = url.searchParams.get("kind"); if (kind !== "pdf" && kind !== "pptx") return send(res, 400, { error: "kind must be pdf or pptx" });
      const { dir, file } = await saveUpload(req, (+process.env.MAX_FILE_MB || 60) * 1e6);
      try { return send(res, 200, await extractText(kind, file)); }
      catch (e) { throw e.status ? e : Object.assign(new Error("could not read that file"), { status: 422 }); }
      finally { rm(dir, { recursive: true, force: true }); }
    }
    const body = await readBody(req);
    if (url.pathname === "/api/analyze") return send(res, 200, { concepts: await analyzeLecture({ course: String(body.course || "this course").slice(0, 80), segments: cleanSegs(body.segments) }) });
    if (url.pathname === "/api/rescue") return send(res, 200, await rescue({ segments: cleanSegs(body.segments), known: (body.known || []).slice(0, 40).map(String) }));
    if (url.pathname === "/api/explain") return send(res, 200, await explainSelection({ course: String(body.course || "this course").slice(0, 80), mode: String(body.mode || "simple"), text: String(body.text || "").slice(0, 3000), context: String(body.context || "").slice(0, 3000), question: String(body.question || "").slice(0, 500) }));
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : "server error" }); } // transcripts are never logged
}).listen(PORT, () => console.log(`Kitten Mode on http://localhost:${PORT}  (LLM ${llmAvailable() ? "ready" : "OFF — set ANTHROPIC_API_KEY"})`));

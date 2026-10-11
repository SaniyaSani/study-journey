// Speech-to-text adapter. One function for every provider: transcribe(file, dir, opts) -> [{t, end?, text, unclear?, reasons?, low?, lowconf?}]
//   faster  faster-whisper (large-v3 by default) on this machine via stt_fw.py. Audio never leaves it. Best quality, handles German + English + accents.
//           Needs: ffmpeg, python3, `pip install faster-whisper`. Picked automatically when installed. FW_MODEL, FW_COMPUTE, FW_DEVICE tune it.
//   local   whisper.cpp on this machine. Needs ffmpeg, whisper-cli, WHISPER_MODEL=/path/ggml-*.bin
//   openai  OpenAI audio API (audio is sent to OpenAI). Needs ffmpeg, OPENAI_API_KEY. Chunked into 10-minute pieces.
//   fake    canned output, only for automated tests (STT_PROVIDER=fake)
// Cloud is never picked automatically: it must be chosen explicitly.
// Nothing here rewrites speech. Uncertain passages are flagged, never "fixed".
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const run = promisify(execFile);
const CHUNK = 600;
const HERE = path.dirname(new URL(import.meta.url).pathname);
let FAST = false;
export async function sttInit() {
  try { await run(process.env.PYTHON || "python3", ["-c", "import " + (process.env.FW_MODULE || "faster_whisper")], { timeout: 20000 }); await run("ffmpeg", ["-version"], { timeout: 5000 }); FAST = true; } catch { FAST = false; }
  return sttProvider();
}
export function sttProvider() {
  const p = process.env.STT_PROVIDER;
  if (p === "fake") return "fake";
  if (p === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (p === "faster") return FAST ? "faster" : null;
  if (p === "local") return process.env.WHISPER_MODEL ? "local" : null;
  if (!p && FAST) return "faster";
  if (!p && process.env.WHISPER_MODEL) return "local";
  return null;
}
export const sttInfo = () => { const p = sttProvider(); return p ? { provider: p, model: p === "faster" ? (process.env.FW_MODEL || "large-v3") : p === "openai" ? (process.env.OPENAI_STT_MODEL || "whisper-1") : p === "local" ? path.basename(process.env.WHISPER_MODEL || "") : "fake" } : null; };
const LANG = /^(auto|[a-z]{2,3})$/;

function faster(file, dir, { lang = "auto", glossary = "", onProgress }) {
  const out = path.join(dir, "fw.json"), args = [process.env.STT_FW_SCRIPT || path.join(HERE, "stt_fw.py"), file, "--out", out, "--lang", LANG.test(lang) ? lang : "auto"];
  if (glossary) args.push("--glossary", glossary);
  return new Promise((resolve, reject) => {
    const ch = spawn(process.env.PYTHON || "python3", args, { stdio: ["ignore", "ignore", "pipe"] });
    let buf = "", tail = "";
    ch.stderr.on("data", d => { buf += d; tail = (tail + d).slice(-600); const m = [...buf.matchAll(/PROGRESS ([\d.]+)/g)].pop(); if (m) onProgress?.(+m[1]); buf = buf.slice(-200); });
    ch.on("error", reject);
    ch.on("close", async code => {
      if (code !== 0) return reject(new Error("stt exit " + code + ": " + tail.replace(/PROGRESS [\d.]+\s*/g, "").trim().split("\n").slice(-3).join(" | ")));
      try {
        const j = JSON.parse(await readFile(out, "utf8"));
        resolve(Object.assign(j.segments.map(s => ({ t: Math.floor(s.t), end: s.end, text: s.text, unclear: s.unclear, reasons: s.reasons, low: s.low, lowconf: s.unclear })).filter(s => s.text),
          { meta: { engine: j.engine, model: j.model, language: j.language, languageProbability: j.language_probability, forcedLanguage: j.forced_language, seconds: j.seconds } }));
      } catch (e) { reject(e); }
    });
  });
}

async function fake() {
  const segs = [{ t: 0, text: "Heute sprechen wir über den Speicher.", unclear: false }, { t: 6, text: "Der Wert ist etwa vierzig, glaube ich.", unclear: true, reasons: ["low-confidence"], low: [[0, 3]], lowconf: true }];
  return Object.assign(segs, { meta: { engine: "fake", model: "fake", language: "de", languageProbability: 0.99, forcedLanguage: null, seconds: 0 } });
}

async function local(file, dir, { prompt, lang }) {
  const opts_lang = lang || "auto";
  const wav = path.join(dir, "in.wav");
  await run("ffmpeg", ["-y", "-i", file, "-ar", "16000", "-ac", "1", wav], { maxBuffer: 1e7 });
  const args = ["-m", process.env.WHISPER_MODEL, "-f", wav, "-oj", "-of", path.join(dir, "out"), "-l", (LANG.test(opts_lang) ? opts_lang : (process.env.WHISPER_LANG || "auto"))];
  if (prompt) args.push("--prompt", prompt);
  await run(process.env.WHISPER_BIN || "whisper-cli", args, { maxBuffer: 1e7, timeout: 3 * 3600e3 });
  const j = JSON.parse(await readFile(path.join(dir, "out.json"), "utf8"));
  return j.transcription.map(x => ({ t: Math.floor(x.offsets.from / 1000), text: String(x.text).trim() })).filter(s => s.text);
}

async function openai(file, dir, { prompt, onProgress, lang }) {
  await run("ffmpeg", ["-y", "-i", file, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", "-f", "segment", "-segment_time", String(CHUNK), "-reset_timestamps", "1", path.join(dir, "c%03d.ogg")], { maxBuffer: 1e7 });
  const chunks = (await readdir(dir)).filter(f => /^c\d+\.ogg$/.test(f)).sort();
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const fd = new FormData();
    fd.set("file", new Blob([await readFile(path.join(dir, chunks[i]))], { type: "audio/ogg" }), chunks[i]);
    fd.set("model", process.env.OPENAI_STT_MODEL || "whisper-1");
    fd.set("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");
    if (prompt) fd.set("prompt", prompt);
    if (lang && lang !== "auto" && LANG.test(lang)) fd.set("language", lang);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY }, body: fd });
    if (!r.ok) throw new Error("stt " + r.status);
    const j = await r.json();
    for (const s of j.segments || []) {
      const text = String(s.text || "").trim();
      if (text) out.push({ t: Math.floor(i * CHUNK + s.start), text, lowconf: typeof s.avg_logprob === "number" && s.avg_logprob < -1 });
    }
    onProgress?.((i + 1) / chunks.length);
  }
  return out;
}

export function transcribe(file, dir, opts = {}) {
  const p = sttProvider();
  if (p === "faster") return faster(file, dir, opts);
  if (p === "fake") return fake();
  if (p === "local") return local(file, dir, opts);
  if (p === "openai") return openai(file, dir, opts);
  throw new Error("no provider");
}

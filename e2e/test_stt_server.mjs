// Server -> stt.mjs hand-over with a stub engine: language codes and glossary arrive intact, results come back with meta.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const PORT = 8794, base = `http://localhost:${PORT}`;
const srv = spawn("node", ["server.mjs"], { env: { ...process.env, PORT, STT_PROVIDER: "faster", FW_MODULE: "json", STT_FW_SCRIPT: new URL("./stub_fw.py", import.meta.url).pathname }, stdio: "inherit" });
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + "/api/status")).ok) break; } catch { } await wait(150); }
  const st = await (await fetch(base + "/api/status")).json(); assert.equal(st.stt, "faster"); assert.equal(st.sttInfo.provider, "faster");
  const go = async q => {
    const r = await fetch(base + "/api/transcribe?" + q, { method: "POST", headers: { "content-type": "audio/webm" }, body: new Uint8Array([1, 2, 3, 4]) });
    assert.equal(r.status, 202); const { job } = await r.json();
    for (let i = 0; i < 50; i++) { const j = await (await fetch(base + "/api/job/" + job)).json(); if (j.status !== "working") return j; await wait(100); }
    throw new Error("timeout");
  };
  for (const [q, lang, gl] of [["lang=auto", "auto", ""], ["lang=de", "de", ""], ["lang=en&glossary=NFAT%2C+Schoch", "en", "NFAT, Schoch"], ["lang=%3Bbad", "auto", ""]]) {
    const j = await go(q);
    assert.equal(j.status, "done", q + " -> " + JSON.stringify(j));
    assert.equal(j.meta.forcedLanguage, lang, q); assert.equal(j.segments[0].text, "hello " + gl); assert.equal(j.meta.engine, "faster-whisper"); assert.equal(j.segments[0].t, 1);
  }
  console.log("stt server hand-over ok");
} finally { srv.kill(); }

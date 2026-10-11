// Getting a lecture in: record live, upload audio, paste a transcript. Then the "processing" screen and the recovery of anything interrupted.
import { D, uid, add, save, remove, saveMeta, lec, course, mod, modulesOf, lecturesOf, putChunk, getChunks, delChunks, touchRecent } from './store.js';
import { esc, fmt, todayISO, analyze, courseConcepts, segText } from './lib.js';
import { KB, registerConcepts, nm } from './kb.js';
import { KIT } from './pixel.js';
import { $, H, HC, V, register, go, ask, confirmSheet, toast, nav, api, render, sheet, closeSheet } from './core.js';
import { crumbs } from './ui.js';
import { parseTranscript, scanTasks } from './actions.js';
import { WEEK3_SAMPLE } from './fixtures.js';
import * as player from './player.js';
import { LANGS, SR_LOCALE } from './transcripts.js';
import { applyTranscript } from './transcripts-core.js';

const POLL_MS = 2000;
const STT = () => nav.api.stt;

/* ---------- "Bring a lecture in" ---------- */
const weekOptions = (cid, sel) => modulesOf(cid).map(m => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>${esc(m.title)}</option>`).join('');
register('add', {
  title: () => 'Bring a lecture in',
  html(V) {
    if (!D.courses.length) return `${crumbs([['Home', '#/'], ['Bring a lecture in', '']])}<div class="empty"><div class="empty-e">📕</div><h3>Make a course first</h3><p class="muted">Lectures live inside a course.</p><button class="btn" data-act="newCourse">＋ New course</button></div>`;
    const cid = V.c && course(V.c) ? V.c : (D.meta.cur && course(D.meta.cur) ? D.meta.cur : D.courses[0].id), mid = V.m && mod(V.m) ? V.m : '';
    const s = STT();
    const note = s === 'openai' ? `<p class="muted">Attach audio and I'll write the transcript with timestamps. <b>The audio is sent to OpenAI to be transcribed</b>, then deleted from the server. Prefer not to? Paste a transcript instead.</p><label class="small"><input type="checkbox" id="cons"> I understand my audio is sent to OpenAI.</label>`
      : s ? `<p class="muted">Attach audio and I'll write the transcript with timestamps. It is transcribed on this app's own server, not by a third party, and the server's copy is deleted afterwards. The original recording stays in your browser, so you can transcribe it again later.</p>`
        : `<p class="muted">No transcription service is connected, so audio can't be turned into text automatically. You can still attach the audio (it stays with your notes and you can jump to moments in it) and paste a transcript from your university or any other tool. Lines like <code>12:14 text…</code> keep their timestamps.</p>`;
    return `${crumbs([['Home', '#/'], ['Bring a lecture in', '']])}<h1>📎 Bring a lecture in</h1>
    <form id="addform" class="paper" novalidate>
      <label class="fld"><span>Title</span><input id="a-title" type="text" value="Lecture ${D.meta.seq}" autocomplete="off"></label>
      <label class="fld"><span>Course</span><select id="a-course" data-ch="addCourse">${D.courses.map(c => `<option value="${esc(c.id)}"${c.id === cid ? ' selected' : ''}>${esc(c.code ? c.code + ' · ' : '')}${esc(c.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Week / module</span><select id="a-mod"><option value="">Not in a week yet</option>${weekOptions(cid, mid)}</select></label>
      <label class="fld"><span>…or create a new week</span><input id="a-newmod" type="text" placeholder="e.g. Week 3 — Linking and compilation" autocomplete="off"></label>
      <label class="fld"><span>Date</span><input id="a-date" type="date" value="${todayISO()}"></label>
      <label class="fld"><span>Spoken language</span><select id="a-lang">${LANGS.map(l => `<option value="${l.v}"${l.v === (D.meta.sttLang || 'auto') ? ' selected' : ''}>${l.l}</option>`).join('')}</select></label>
      <p class="small muted">If the lecture is in one language, choose it: that is more accurate than detecting it. Lectures that mix German and English work best with the language the professor mostly speaks.</p>
      <h3>Audio</h3>${note}
      <p><input type="file" id="a-file" accept="audio/*,video/mp4" aria-label="Audio file"></p>
      <h3>Transcript</h3>
      <textarea id="a-tx" rows="7" placeholder="0:05 Okay, welcome back everyone…&#10;1:10 Every command hands back a number…"></textarea>
      <p class="small muted">Optional. If you leave this empty and attach audio, the transcript comes from the transcription service (if there is one).</p>
      <p><button class="btn ghost" type="button" data-act="useSample">🧪 Fill in a sample transcript (development fixture, not a real lecture)</button></p>
      <div class="row"><button class="btn" type="submit">Create lecture</button><button class="btn soft" type="button" data-act="startRec" data-c="${esc(cid)}" data-m="${esc(mid)}">🎤 Record live instead</button></div>
    </form>`;
  },
  after() { const f = $('#addform'); if (f) f.onsubmit = e => { e.preventDefault(); makeLecture(); }; }
});
HC.addCourse = el => { const m = $('#a-mod'); if (m) m.innerHTML = `<option value="">Not in a week yet</option>` + weekOptions(el.value, ''); };
H.useSample = () => { $('#a-tx').value = WEEK3_SAMPLE.map(s => `${fmt(s.t)} ${s.text}`).join('\n'); $('#a-tx').dataset.sample = '1'; if (/^Lecture \d+$/.test($('#a-title').value)) $('#a-title').value = 'Lecture 3 — Linking and compilation (sample)'; toast('🧪 Sample text filled in. It is labelled as a sample everywhere.'); };

async function audioLength(file) {
  const a = new Audio(URL.createObjectURL(file));
  await new Promise(r => { a.onloadedmetadata = r; a.onerror = r; setTimeout(r, 1500); });
  const d = isFinite(a.duration) ? Math.round(a.duration) : 0; URL.revokeObjectURL(a.src); return d;
}
async function makeLecture() {
  const f = $('#a-file').files[0], txEl = $('#a-tx'), tx = txEl.value.trim(), cid = $('#a-course').value;
  if (f && !tx && STT() === 'openai' && !($('#cons') || {}).checked) return toast('🌱 Tick the box first so I know you are okay with the audio going to OpenAI.');
  let mid = $('#a-mod').value; const nm2 = $('#a-newmod').value.trim();
  if (nm2) { mid = uid('m'); add('modules', { id: mid, courseId: cid, title: nm2, order: (modulesOf(cid).reduce((a, m) => Math.max(a, m.order || 0), 0)) + 1, created: Date.now() }); }
  const segs = tx ? parseTranscript(tx) : [];
  const L = {
    id: uid('L'), courseId: cid, moduleId: mid || null, title: $('#a-title').value.trim() || 'Lecture ' + D.meta.seq, date: $('#a-date').value || todayISO(), segments: segs, duration: segs.length ? segs[segs.length - 1].t + 30 : 0,
    status: segs.length || f ? 'processing' : 'draft', hasAudio: !!f, mime: f ? f.type : '', tags: [], cleanEdits: {}, cleanAdds: [], playPos: 0, created: Date.now(), order: lecturesOf(cid).length + 1,
    transcriptSource: tx ? (txEl.dataset.sample ? 'fixture' : 'pasted') : f ? 'pending' : 'none', lang: ($('#a-lang').value !== 'auto' ? $('#a-lang').value : '')
  };
  D.meta.sttLang = $('#a-lang').value;
  if (txEl.dataset.sample) L.fixture = 'esc401-w3-sample';
  D.meta.seq++; D.meta.cur = cid; saveMeta();
  if (f) { await putChunk(L.id + ':000000', f); const d = await audioLength(f); if (d) L.duration = Math.max(L.duration, d); }
  add('lectures', L);
  go(L.status === 'processing' ? 'proc' : 'lec', { id: L.id, tab: 'orig' });
}

/* ---------- processing: transcript (if needed) -> concepts -> ready ---------- */
const PROC = new Set();
export const isProcessing = id => PROC.has(id);
export async function transcribeLecture(L, opt = {}) {
  PROC.add(L.id);
  try {
    const parts = await getChunks(L.id + ':'); if (!parts.length) throw new Error('no audio');
    const blob = new Blob(parts, { type: L.mime || parts[0].type || 'application/octet-stream' });
    const glossary = (opt.glossary || '').slice(0, 600), lang = opt.lang || L.lang || 'auto';
    // Only an explicit glossary is passed on. Course names and concept lists are NOT fed to the recogniser: that can make it "hear" words nobody said.
    const r = await fetch('/api/transcribe?' + new URLSearchParams({ lang, glossary, prompt: glossary }), { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
    if (!r.ok) throw new Error('stt ' + r.status);
    const { job } = await r.json();
    for (; ;) {
      await new Promise(x => setTimeout(x, POLL_MS));
      const jr = await fetch('/api/job/' + job); if (!jr.ok) throw new Error('job lost');
      const j = await jr.json(), p = $('#ppct'); if (p && V.n === 'proc') p.textContent = j.progress ? Math.round(j.progress * 100) + '%' : '';
      if (j.status === 'done') {
        applyTranscript(L, j.segments, { source: 'stt', meta: j.meta || null, lang: lang !== 'auto' ? lang : '', label: opt.again ? 'transcribed again' : '' });
        L.lang = lang !== 'auto' ? lang : (j.meta && j.meta.language) || ''; L.langChosen = lang !== 'auto'; save('lectures', L); return;
      }
      if (j.status === 'error') throw new Error('stt failed');
    }
  } finally { PROC.delete(L.id); }
}
async function runProc(L) {
  let note = '';
  const again = L.pendingTx, wantLive = L.transcriptSource === 'live' && STT();
  if (L.hasAudio && (!L.segments.length || again || wantLive)) {
    if (!STT()) { note = '🌱 No transcription service is connected, so there is nothing to explain yet. Your audio is safe. Paste a transcript on the lecture page.'; }
    else {
      $('#ptitle').textContent = '🎧 Listening to your recording…';
      try { await transcribeLecture(L, { ...(again || {}), again: !!again || wantLive }); delete L.pendingTx; save('lectures', L); }
      catch (e) { if (L.segments.length) { L.status = 'ready'; save('lectures', L); } if (V.n === 'proc' && V.id === L.id) { $('#ptitle').textContent = "🎧 I couldn't process this recording yet. Your audio is safe" + (L.segments.length ? ' and your current transcript is unchanged' : '') + ". Let's try again."; $('#ppct').textContent = ''; $('#pdone').innerHTML = `<button class="btn" data-act="recover" data-id="${L.id}">Try again</button> <a class="btn ghost" href="#/l/${L.id}/orig">Open the lecture anyway</a>`; } return; }
    }
  }
  if (nav.api.llm && !L.fixture && L.segments.length && !L.concepts) {
    if (V.n === 'proc' && V.id === L.id) $('#ptitle').textContent = '🐱 Making this make sense…';
    try {
      const r = await api('/api/analyze', { course: course(L.courseId).name, segments: L.segments.map((s, i) => ({ i, t: s.t, text: segText(s), unclear: !!s.unclear })) });
      if (r.concepts && r.concepts.length) { L.concepts = r.concepts; L.cids = registerConcepts(r.concepts); } else note = '🌱 I need a little more of the lecture to explain this properly.';
    } catch (e) { note = '🎧 I could not reach the explainer, so I used the built-in vocabulary. Your transcript is safe.'; }
  }
  if (L.segments.length) scanTasks(L);
  L.status = L.segments.length || L.hasAudio ? 'ready' : 'draft'; save('lectures', L);
  if (V.n !== 'proc' || V.id !== L.id) return;
  const A = analyze(L), nw = A.order.length;
  const steps = L.segments.length ? ['transcript cleaned (the original is kept untouched)', `${A.topics.length} topic${A.topics.length === 1 ? '' : 's'} found`, `${nw} concept${nw === 1 ? '' : 's'} recognised`, 'tasks looked for (suggestions only)'] : ['audio saved on this device'];
  const ul = $('#steps'); let i = 0;
  (function nx() {
    if (V.n !== 'proc') return;
    if (i < steps.length) { ul.insertAdjacentHTML('beforeend', `<li>✓ ${esc(steps[i++])}</li>`); setTimeout(nx, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 350); }
    else { $('#ptitle').textContent = '🌸 Your lecture is ready.'; $('#pdone').innerHTML = (note ? `<p class="muted">${esc(note)}</p>` : '') + `<a class="btn" href="#/l/${L.id}/${L.segments.length ? 'notes' : 'orig'}">Open lecture</a>`; }
  })();
}
register('proc', {
  title: () => 'Preparing',
  html(V) { const L = lec(V.id); if (!L) return `<div class="empty"><div class="empty-e">🌱</div><h3>That lecture isn't here</h3><a class="btn" href="#/">Home</a></div>`; return `<div class="center" style="padding-top:40px"><span class="kit">${KIT}</span><h2 id="ptitle">🐱 Tidying up your lecture…</h2><p class="muted" id="ppct"></p><ul class="steps" id="steps"></ul><div id="pdone"></div></div>`; },
  after(V) { const L = lec(V.id); if (!L || PROC.has(L.id) || V.ran) return; V.ran = true; runProc(L); }
});
H.recover = d => { const L = lec(d.id); if (!L) return; if (L.segments.length) L.duration = Math.max(L.duration, L.segments[L.segments.length - 1].t + 30); L.status = 'processing'; save('lectures', L); go('proc', { id: L.id }); };

/* ---------- attach audio to an existing lecture ---------- */
H.attachAudio = async d => {
  closeSheet(); const L = lec(d.id); if (!L) return;
  if (L.hasAudio && !await confirmSheet({ title: 'Replace the recording?', intro: 'The current recording will be deleted from this device. This cannot be undone. If you only want a fresh transcript, use “Transcribe again” instead.', ok: 'Replace the recording', danger: true })) return;
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/mp4';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    await delChunks(L.id + ':'); await putChunk(L.id + ':000000', f);
    L.hasAudio = true; L.mime = f.type; const dur = await audioLength(f); if (dur) L.duration = Math.max(dur, L.fixture ? 0 : L.duration || 0); save('lectures', L);
    player.invalidate(L.id); toast('🎧 Audio attached. Tap any time to jump to that moment.');
    if (!L.segments.length) { if (STT()) offerTranscribe(L); else { render(); } } else render();
    if (V.n === 'lec') player.enter(L);
  };
  inp.click();
};
export function offerTranscribe(L) {
  const s = STT(); if (!s) return;
  sheet(`<h3>Write the transcript from this audio?</h3><p>${s === 'openai' ? '<b>The audio will be sent to OpenAI</b> to be transcribed, then deleted from the server.' : 'The audio goes to this app\'s own server to be transcribed, and the server\'s copy is deleted afterwards.'}</p><div class="row"><button class="btn" data-act="transcribeGo" data-id="${L.id}">Yes, transcribe</button><button class="btn ghost" data-act="closeSheet">Not now</button></div>`, { label: 'Transcribe' });
}
H.transcribeGo = d => { closeSheet(); H.recover(d); };

/* ---------- live recording (audio chunks are written to IndexedDB every 4 s, so a crash loses almost nothing) ---------- */
let rec = null;
const elapsed = () => rec ? rec.base + (rec.paused ? 0 : (performance.now() - rec.t0) / 1000) : 0;
export const isRecording = () => !!rec;
H.startRec = async d => {
  if (rec) return go('rec');
  const cid = d.c || D.meta.cur || (D.courses[0] && D.courses[0].id); if (!cid) return toast('Make a course first.');
  let stream;
  try {
    // Lecture-hall speech is far from the microphone. Call-style noise suppression and echo cancellation can gate quiet speech and add warble,
    // so they are off; automatic gain stays on so a distant professor is not too quiet. Mono is enough and halves the data.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  } catch (e) { return toast("🎧 I can't reach the microphone. Allow microphone access in your browser, or upload a recording instead."); }
  const L = { id: uid('L'), courseId: cid, moduleId: d.m || null, title: 'Lecture ' + D.meta.seq, date: todayISO(), segments: [], duration: 0, status: 'recording', hasAudio: true, tags: [], cleanEdits: {}, cleanAdds: [], playPos: 0, created: Date.now(), order: lecturesOf(cid).length + 1, transcriptSource: 'live', lang: D.meta.sttLang && D.meta.sttLang !== 'auto' ? D.meta.sttLang : '' };
  const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)); L.mime = mt || '';
  let mr;
  try { mr = new MediaRecorder(stream, mt ? { mimeType: mt, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 }); } catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('🎧 This browser cannot record audio. Try Chrome or Safari, or upload a recording.'); }
  D.meta.seq++; D.meta.cur = cid; saveMeta(); add('lectures', L);
  rec = { L, stream, mr, n: 0, base: 0, t0: performance.now(), paused: false, interim: '' };
  mr.ondataavailable = e => { if (e.data && e.data.size) putChunk(L.id + ':' + String(rec ? rec.n++ : 900000).padStart(6, '0'), e.data); }; mr.start(4000);
  try { rec.ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = rec.ctx.createMediaStreamSource(stream); rec.an = rec.ctx.createAnalyser(); rec.an.fftSize = 512; src.connect(rec.an); } catch (e) { }
  try { rec.wake = await navigator.wakeLock.request('screen'); } catch (e) { }
  startSR(); go('rec');
};
function startSR() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { rec.noSR = true; return; }
  const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = SR_LOCALE[rec.L.lang || (navigator.language || 'en').slice(0, 2)] || navigator.language || 'en-US';
  r.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) { const tx = res[0].transcript.trim(); if (tx) { const t = Math.max(0, Math.floor(elapsed() - tx.length / 14)); rec.L.segments.push({ t, text: tx, lowconf: res[0].confidence && res[0].confidence < .6, ...(res[0].confidence && res[0].confidence < .6 ? { unclear: true, reasons: ['low-confidence'] } : {}) }); save('lectures', rec.L); } } else interim += res[0].transcript; } rec.interim = interim; updateLive(); };
  r.onend = () => { if (rec && !rec.paused && !rec.stopping) { try { r.start(); } catch (e) { } } };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { rec && (rec.noSR = true); updateLive(); } };
  try { r.start(); rec.sr = r; } catch (e) { rec.noSR = true; }
}
register('rec', {
  title: () => 'Recording',
  html() {
    if (!rec) return `<div class="empty"><div class="empty-e">🎤</div><h3>No recording is running</h3><p class="muted">Start one from a course, or bring in a file.</p><a class="btn" href="#/">Home</a></div>`;
    return `<div class="center"><div class="muted">● Recording on this device</div><div class="clock" id="clock">0:00</div></div>
    <canvas id="wave" width="680" height="110" aria-hidden="true"></canvas>
    <p class="center muted" id="topic">🌱 Listening…</p>
    <button class="rescuebtn" data-act="liveRescue">🆘 What is happening right now?</button>
    <div class="ctl"><button data-act="pauseRec" id="pausebtn">⏸ Pause</button><button class="stop" data-act="stopRec">⏹ Stop</button></div>
    <p class="center"><label class="small">Live draft language <select id="reclang" data-ch="recLang" aria-label="Live draft language">${LANGS.filter(l => l.v !== 'auto').map(l => `<option value="${l.v}"${l.v === (rec.L.lang || (navigator.language || 'en').slice(0, 2)) ? ' selected' : ''}>${l.l}</option>`).join('')}</select></label></p><p class="small muted center" id="srnote"></p><div class="live" id="live" aria-live="off"></div>
    <p class="small muted center">The recording stays on this device and is the real record. The live text below is only a rough preview from your browser's speech service (in Chrome it sends audio to Google). ${STT() ? 'When you stop, I will write a proper transcript from the recording.' : 'No transcription service is connected, so this preview is all the text you get until you add one.'}</p>`;
  },
  after() {
    if (!rec) return; updateLive();
    const cv = $('#wave'), cx = cv.getContext('2d'), col = getComputedStyle(document.documentElement).getPropertyValue('--berry').trim(), data = new Uint8Array(rec.an ? rec.an.fftSize : 1);
    (function loop() {
      if (!rec || V.n !== 'rec') return; const ck = $('#clock'); if (!ck) return; ck.textContent = fmt(elapsed()); cx.clearRect(0, 0, cv.width, cv.height);
      if (rec.an && !rec.paused) { rec.an.getByteTimeDomainData(data); cx.fillStyle = col; for (let i = 0; i < 64; i++) { let m = 0; for (let j = 0; j < 8; j++) m = Math.max(m, Math.abs(data[i * 8 + j] - 128)); const h = Math.max(8, Math.round(m / 128 * cv.height * 1.6 / 8) * 8); cx.fillRect(Math.round(i * 10.6 / 2) * 2 + 2, Math.round((cv.height - h) / 16) * 8, 8, h); } }
      rec.raf = requestAnimationFrame(loop);
    })();
  }
});
function updateLive() {
  if (!rec || V.n !== 'rec') return; const el = $('#live'); if (!el) return;
  el.innerHTML = rec.L.segments.slice(-6).map(s => `<p><span class="muted small">${fmt(s.t)}</span> ${esc(s.text)}</p>`).join('') + (rec.interim ? `<p class="muted">${esc(rec.interim)}…</p>` : ''); el.scrollTop = 1e6;
  $('#srnote').textContent = rec.noSR ? "Live text isn't available in this browser. Your audio is still being saved, and you can add a transcript afterwards." : '';
  const A = analyze(rec.L), last = A.order.length ? A.order[A.order.length - 1] : null; $('#topic').textContent = last ? `${KB[last].e} Right now: ${nm(last)}` : '🌱 Listening…';
}
HC.recLang = el => { if (!rec) return; rec.L.lang = el.value; D.meta.sttLang = el.value; saveMeta(); save('lectures', rec.L); try { if (rec.sr) { rec.sr.onend = null; rec.sr.stop(); } } catch (e) { } if (!rec.paused) startSR(); };
H.pauseRec = () => { if (!rec) return; if (!rec.paused) { rec.base = elapsed(); rec.paused = true; rec.mr.pause(); try { rec.sr && rec.sr.stop(); } catch (e) { } $('#pausebtn').textContent = '▶ Resume'; } else { rec.t0 = performance.now(); rec.paused = false; rec.mr.resume(); startSR(); $('#pausebtn').textContent = '⏸ Pause'; } };
H.stopRec = async () => {
  if (!rec) return; if (!await confirmSheet({ title: 'Stop and save this lecture?', intro: 'The recording is kept on this device.', ok: 'Stop and save' })) return;
  const R = rec; R.stopping = true; const dur = elapsed();
  await new Promise(r => { R.mr.onstop = r; try { R.mr.stop(); } catch (e) { r(); } });
  try { R.sr && R.sr.stop(); } catch (e) { } R.stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(R.raf); try { R.ctx && R.ctx.close(); } catch (e) { } try { R.wake && R.wake.release(); } catch (e) { }
  await new Promise(r => setTimeout(r, 250)); R.L.duration = Math.round(dur); R.L.status = 'processing'; save('lectures', R.L); rec = null; go('proc', { id: R.L.id });
};
window.addEventListener('beforeunload', e => { if (rec) { e.preventDefault(); e.returnValue = ''; } });
H.liveRescue = () => { if (rec) H.rescueSheet && H.rescueSheet({ id: rec.L.id, t: elapsed() }); };
export const interrupted = () => D.lectures.filter(l => (l.status === 'recording' && !(rec && rec.L === l)) || (l.status === 'processing' && !PROC.has(l.id) && !(V.n === 'proc' && V.id === l.id)));

// The persistent audio player for a lecture page: seeking from citations, current-segment highlight, remembered position.
import { lec, save, getChunks, D, saveMeta } from './store.js';
import { fmt, esc, segText } from './lib.js';
import { $, H, HI, HC, V, toast, onRender } from './core.js';

const urls = {};
let cur = null, loaded = null, follow = true, lastIdx = -2, lastSaved = 0;
export const el = () => $('#player');
export const current = () => cur;
export const time = () => (el() && loaded === (cur && cur.id)) ? el().currentTime : 0;

async function urlFor(L) {
  if (urls[L.id]) return urls[L.id];
  const chunks = await getChunks(L.id + ':');
  if (!chunks.length) return null;
  urls[L.id] = URL.createObjectURL(new Blob(chunks, { type: L.mime || chunks[0].type || 'audio/webm' }));
  return urls[L.id];
}
export function invalidate(id) { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } if (loaded === id) { loaded = null; const a = el(); if (a) { a.pause(); a.removeAttribute('src'); a.load(); } } }

async function ensureLoaded(L) {
  if (loaded === L.id) return true;
  const url = await urlFor(L); if (!url) return false;
  const a = el(); a.src = url; loaded = L.id;
  await new Promise(r => { a.onloadedmetadata = r; a.onerror = r; a.load(); });
  if (a.duration === Infinity) { a.currentTime = 1e101; await new Promise(r => { a.ontimeupdate = () => { a.ontimeupdate = null; r(); }; }); a.currentTime = 0; } // MediaRecorder files report no length
  return true;
}
const dur = () => { const a = el(); return isFinite(a.duration) && a.duration > 0 ? a.duration : (cur && cur.duration) || 0; };

function barHTML(L, state) {
  if (!L.hasAudio) {
    return `<div class="pl-off"><span>🎧 No audio is attached to this lecture.</span><button class="mini" data-act="attachAudio" data-id="${L.id}">Attach audio</button>${L.fixture ? '<span class="small">Sample lecture: tapping a time reads that line aloud with a robot voice.</span>' : ''}</div>`;
  }
  if (state === 'missing') return `<div class="pl-off"><span>🎧 The audio for this lecture isn't on this device any more.</span><button class="mini" data-act="attachAudio" data-id="${L.id}">Attach it again</button></div>`;
  return `<div class="pl"><button class="play" data-act="plPlay" aria-label="Play or pause" id="plplay">▶</button>
  <div><input type="range" id="plseek" min="0" max="${Math.max(1, Math.floor(dur()))}" value="0" step="1" data-in="plSeek" aria-label="Position in the lecture"><div class="t"><span id="plcur">0:00</span> / <span id="pltot">${fmt(dur())}</span></div></div>
  <select data-ch="plRate" aria-label="Playback speed" style="width:auto;margin:0;min-height:44px"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div>
  <div class="pl-more"><button data-act="plBack" aria-label="Back 10 seconds">⏪ 10 s</button><button data-act="plFwd" aria-label="Forward 10 seconds">10 s ⏩</button><button data-act="rescueNow">🆘 <span class="wide">What is happening right now?</span><span class="narrow">What's happening?</span></button><button data-act="plFollow" aria-pressed="${follow}" id="plfollow">${follow ? '📍 Following' : '📍 Not following'}</button></div>`;
}
function syncBar() {
  const a = el(), s = $('#plseek'); if (!s || !cur) return;
  s.max = Math.max(1, Math.floor(dur())); s.value = Math.floor(a.currentTime);
  $('#plcur').textContent = fmt(a.currentTime); $('#pltot').textContent = fmt(dur());
  const p = $('#plplay'); if (p) p.textContent = a.paused ? '▶' : '⏸';
}

export async function enter(L) {
  if (cur && cur.id !== L.id) { persist(); el().pause(); }
  cur = L; lastIdx = -2;
  document.body.classList.add('has-player');
  $('#playerbar').innerHTML = barHTML(L, 'loading');
  if (!L.hasAudio) return;
  const ok = await ensureLoaded(L);
  if (cur !== L) return;
  $('#playerbar').innerHTML = ok ? barHTML(L, 'ok') : barHTML(L, 'missing');
  if (ok) { const a = el(); if (a.currentTime < 1 && L.playPos > 1 && !a.dataset.restored) { a.currentTime = Math.min(L.playPos, dur() || L.playPos); } a.dataset.restored = L.id; const r = $('#plseek'); if (r) { const sel = $('#playerbar select'); if (sel) sel.value = String(a.playbackRate); } syncBar(); markNow(true); }
}
export function leave() {
  if (!cur) return;
  persist(); el().pause(); cur = null;
  document.body.classList.remove('has-player'); $('#playerbar').innerHTML = '';
}
onRender(v => { if (v.n !== 'lec' && cur) leave(); });

function persist() { if (!cur || loaded !== cur.id) return; const t = Math.floor(el().currentTime); if (t !== cur.playPos) { cur.playPos = t; save('lectures', cur); } lastSaved = Date.now(); }

/* highlight the segment being spoken */
export function markNow(force) {
  if (!cur || loaded !== cur.id) return;
  const t = el().currentTime; let idx = -1; cur.segments.forEach((s, i) => { if (s.t <= t + 0.25) idx = i; });
  if (idx === lastIdx && !force) return; lastIdx = idx;
  document.querySelectorAll('#app [data-seg].now').forEach(e => e.classList.remove('now'));
  const e = document.querySelector(`#app [data-seg="${idx}"]`);
  if (e) { e.classList.add('now'); if (follow && !el().paused && V.tab === 'orig') { const r = e.getBoundingClientRect(); if (r.top < 100 || r.bottom > innerHeight - 200) e.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }); } }
}
['timeupdate', 'play', 'pause', 'seeked', 'durationchange', 'ended'].forEach(ev => document.addEventListener('DOMContentLoaded', () => {
  el().addEventListener(ev, () => { syncBar(); markNow(); if (ev === 'pause' || ev === 'seeked' || ev === 'ended' || Date.now() - lastSaved > 10000) persist(); });
}));

/* play from a moment. Real audio if there is any; the sample lecture reads its line aloud. */
export async function playAt(L, t, { silent } = {}) {
  if (L.hasAudio) {
    if (!(cur && cur.id === L.id)) await enter(L);
    const ok = await ensureLoaded(L);
    if (!ok) { toast("The audio for this lecture isn't on this device any more."); return false; }
    const a = el(); a.currentTime = Math.max(0, t); if (!silent) a.play().catch(() => { }); syncBar(); markNow(true); return true;
  }
  if (L.fixture && window.speechSynthesis) {
    const seg = [...L.segments].reverse().find(s => s.t <= t) || L.segments[0];
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(segText(seg)); u.rate = .95; speechSynthesis.speak(u);
    toast('🔊 Sample lecture has no real audio. A robot voice reads the line instead.'); return true;
  }
  toast('🎧 There is no audio attached to this lecture. You can attach a recording from the player bar.');
  return false;
}

H.plPlay = () => { const a = el(); if (loaded !== (cur && cur.id)) return; a.paused ? a.play().catch(() => { }) : a.pause(); };
H.plBack = () => { const a = el(); a.currentTime = Math.max(0, a.currentTime - 10); };
H.plFwd = () => { const a = el(); a.currentTime = Math.min(dur(), a.currentTime + 10); };
H.plFollow = () => { follow = !follow; const b = $('#plfollow'); if (b) { b.textContent = follow ? '📍 Following' : '📍 Not following'; b.setAttribute('aria-pressed', follow); } };
HI.plSeek = e => { el().currentTime = +e.value; $('#plcur').textContent = fmt(+e.value); };
HC.plRate = e => { el().playbackRate = +e.value; };
document.addEventListener('keydown', e => {
  if (!cur || !cur.hasAudio || e.target.closest('input,textarea,select,[contenteditable=true],button')) return;
  if (e.key === ' ' && V.n === 'lec') { e.preventDefault(); H.plPlay(); }
});

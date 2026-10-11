// Select words in the transcript or clean notes and a small bar of actions appears (also reachable by the "⋯" button, for keyboards and touch).
import { $, V, H } from './core.js';
import { esc } from './lib.js';
import { ACTS, setSel, clearSel, selSheet } from './actions.js';
import { lec } from './store.js';

const SHOWN = ['mynotes', 'clean', 'simple', 'question'];
let cur = null, t = null;
function read() {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount || V.n !== 'lec') return null;
  const txt = s.toString().replace(/\s+/g, ' ').trim(); if (txt.length < 2) return null;
  const node = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode);
  const el = node && node.closest && node.closest('.segtext[data-seg],.cleantext[data-seg]'); if (!el) return null;
  const L = lec(V.id); if (!L) return null; const seg = +el.dataset.seg;
  return { lectureId: L.id, seg, t: L.segments[seg].t, text: txt };
}
function show() {
  cur = read(); const bar = $('#selbar');
  if (!cur) { document.body.classList.remove('has-sel'); if (bar) bar.innerHTML = ''; return; }
  setSel(cur);
  bar.innerHTML = `<div class="selbar" role="toolbar" aria-label="Actions for the selected words"><span class="q">“${esc(cur.text.slice(0, 40))}${cur.text.length > 40 ? '…' : ''}”</span>${SHOWN.map(id => { const a = ACTS.find(x => x.id === id); return `<button data-act="selAct" data-a="${a.id}">${a.emoji} ${a.label}</button>`; }).join('')}<button data-act="selMore">⋯ More</button></div>`;
  document.body.classList.add('has-sel');
}
document.addEventListener('selectionchange', () => { clearTimeout(t); t = setTimeout(show, 150); });
const bar = document.getElementById('selbar');
['mousedown', 'pointerdown', 'touchstart'].forEach(ev => bar.addEventListener(ev, e => { if (e.target.closest('button')) e.preventDefault(); }, { passive: false }));
H.selMore = () => { if (cur) { const s = cur; clearSel(); selSheet(s); } };

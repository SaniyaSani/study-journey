// Shared UI components (strings of HTML) and small shared actions.
import { D, save, saveMeta, lec, course, mod, note, mat, task } from './store.js';
import { esc, md, fmt, highlight, detectLang, normTag, refLabel, refIcon } from './lib.js';
import { H, ask, toast, render, go, refAttr } from './core.js';

/* breadcrumbs: items are [label, href?]; the last one is the current page */
export function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([l, h], i) => `<li>${i < items.length - 1 && h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`}</li>`).join('')}</ol></nav>`;
}
export function ctxOf(L) {
  const c = course(L.courseId), m = L.moduleId ? mod(L.moduleId) : null;
  return { c, m };
}
export function lectureCrumbs(L, last) {
  const { c, m } = ctxOf(L), sem = c && D.semesters.find(s => s.id === c.semesterId);
  const out = [[D.meta.ws.name, '#/']];
  if (sem) out.push([sem.name, '#/']);
  if (c) out.push([c.code || c.name, '#/c/' + c.id]);
  if (m) out.push([m.title.split('—')[0].trim(), '#/c/' + c.id]);
  out.push([last || L.title, '']);
  return crumbs(out);
}

/* provenance badges: the learner can always tell who said what */
export const PROV = {
  prof: ['🎓', 'Professor said', 't-prof'], ai: ['🐱', 'Explained by this app', 't-ai'], llm: ['✨', 'Written by AI', 't-ai'], you: ['✍️', 'Your note', 't-new'],
  outside: ['🌍', 'Added context, not from the course', 't-out'], edited: ['✏️', 'Edited by you', 't-new'], fixture: ['🧪', 'Sample text (development fixture)', 't-out'],
  rules: ['🧹', 'Tidied by rules, nothing added', 't-ai'], emph: ['✨', 'Professor emphasis', 't-out'], guess: ['🤔', 'Guess, please check', 't-out']
};
export const prov = k => `<span class="tag ${PROV[k][2]}">${PROV[k][0]} ${PROV[k][1]}</span>`;

/* a clickable citation that opens the exact source location */
export const refChip = (ref, label) => { const l = label || refLabel(ref), lead = /^\p{Extended_Pictographic}/u.test(l); return `<button class="ts" data-act="openRef" data-ref="${refAttr(ref)}" aria-label="Open source: ${esc(l)}">${lead ? '' : refIcon(ref) + ' '}${esc(l)}</button>`; };
export const tsChip = (ref, t) => refChip(ref, fmt(t));

/* code that keeps its whitespace, with highlighting, a language label and a copy button */
export function codeBlock(code, { lang, note: n, small } = {}) {
  const lg = detectLang(code, lang);
  return `<div class="code${small ? ' small' : ''}"><div class="code-h"><span class="chip">${esc(lg === 'slurm' ? 'slurm job' : lg)}</span>${n ? `<span class="muted small">${n}</span>` : ''}<button class="copy" data-act="copy" data-code="${esc(code)}" aria-label="Copy code">Copy</button></div><pre tabindex="0"><code>${highlight(code, lg)}</code></pre></div>`;
}
H.copy = async (d, el) => {
  const text = d.code;
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (er) { toast('Copy did not work here. Select the text and copy it by hand.'); t.remove(); return; } t.remove();
  }
  el.textContent = 'Copied ✓'; setTimeout(() => { el.textContent = 'Copy'; }, 1500);
};

export const empty = (emoji, title, body = '', actions = '') => `<div class="empty"><div class="empty-e">${emoji}</div><h3>${esc(title)}</h3>${body ? `<p class="muted">${body}</p>` : ''}${actions ? `<div class="row" style="justify-content:center">${actions}</div>` : ''}</div>`;

/* tags: small chips that can be added and removed on lectures, materials, notes and tasks */
export function tagChips(coll, doc, editable = true) {
  const t = doc.tags || [];
  return `<div class="tagrow" aria-label="Tags">${t.map(x => `<span class="chip tagchip"><a href="#/s/${encodeURIComponent('#' + x)}">#${esc(x)}</a>${editable ? `<button class="x" data-act="rmTag" data-coll="${coll}" data-id="${esc(doc.id)}" data-tag="${esc(x)}" aria-label="Remove tag ${esc(x)}">×</button>` : ''}</span>`).join('')}${editable ? `<button class="chip addtag" data-act="addTag" data-coll="${coll}" data-id="${esc(doc.id)}">＋ tag</button>` : ''}</div>`;
}
const docOf = (coll, id) => D[coll].find(x => x.id === id);
H.addTag = async d => {
  const doc = docOf(d.coll, d.id); if (!doc) return;
  const v = await ask({ title: 'Add a tag', intro: 'Tags show what something is connected to, for example <code>exam</code> or <code>mpi</code>.', fields: [{ id: 'tag', label: 'Tag', ph: 'exam', required: true }], ok: 'Add tag' });
  if (!v) return; const t = normTag(v.tag); if (!t) return;
  doc.tags = doc.tags || []; if (!doc.tags.includes(t)) doc.tags.push(t); save(d.coll, doc); render();
};
H.rmTag = d => { const doc = docOf(d.coll, d.id); if (!doc) return; doc.tags = (doc.tags || []).filter(x => x !== d.tag); save(d.coll, doc); render(); };

export function statusChip(L) {
  const s = L.status;
  const map = { ready: ['sage', 'Ready'], processing: ['peach', 'Processing'], recording: ['peach', 'Recording'], draft: ['lav', 'Waiting for audio or transcript'], error: ['peach', 'Needs another try'] };
  const [tone, label] = map[s] || ['lav', s];
  return `<span class="tag t-${tone}">${esc(label)}</span>`;
}
export const kindEmoji = k => ({ pdf: '📄', slides: '🖼️', image: '📷', audio: '🎧', code: '💻', text: '📝', data: '📊', url: '🔗', exercise: '🧪', doc: '📃', other: '📎' }[k] || '📎');
export const kindLabel = k => ({ pdf: 'PDF', slides: 'Slides', image: 'Image', audio: 'Audio', code: 'Code file', text: 'Text', data: 'Data', url: 'Link', exercise: 'Exercise sheet', doc: 'Document', other: 'File' }[k] || 'File');
export const dateLabel = iso => { try { return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso || ''; } };
export const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return dateLabel(new Date(ts).toISOString().slice(0, 10)); };
export const sizeLabel = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

// Shared data operations: notes, tasks, transcript parsing, and the "act on a selected passage" actions.
import { D, uid, save, add, remove, saveMeta, lec, course, note, task as getTask, touchRecent, modulesOf } from './store.js';
import { esc, md, fmt, segText, codeOf, stripTags, todayISO, search, excerpt, noteText, despeak } from './lib.js';
import { KB, ids } from './kb.js';
import { H, $, V, ask, sheet, closeSheet, toast, go, nav, api, render, openRef } from './core.js';
import { prov, refChip } from './ui.js';

/* ---------- blocks and notes ---------- */
export const mkBlock = (type, o = {}) => Object.assign({ id: uid('b'), type }, type === 'code' ? { text: '', lang: 'auto' } : type === 'todo' ? { html: '', checked: false } : type === 'ref' || type === 'img' ? {} : { html: '' }, o);
export const NOTE_TITLES = { lecture: 'Lecture notes', question: 'My Questions', exercise: 'Exercises', cheat: 'Cheat Sheet', exam: 'Exam Preparation', understood: 'Things I Finally Understood', confusing: 'Still Confusing' };
export function newNote({ courseId, lectureId = null, kind = 'lecture', title = '', blocks, tags = [], auto = false }) {
  const n = { id: uid('n'), courseId, lectureId, kind, title, blocks: blocks || [mkBlock('p')], tags, important: false, rev: [], auto, created: Date.now() };
  return add('notes', n);
}
/* the one running note of a kind (per course, or per lecture for lecture notes), created the first time it is needed */
export function autoNote(courseId, kind, lectureId = null) {
  let n = D.notes.find(x => x.auto && x.courseId === courseId && x.kind === kind && (kind !== 'lecture' || x.lectureId === lectureId));
  if (!n) {
    const L = lectureId && lec(lectureId);
    n = newNote({ courseId, lectureId: kind === 'lecture' ? lectureId : null, kind, title: kind === 'lecture' && L ? `My notes · ${L.title}` : NOTE_TITLES[kind], blocks: [], auto: true });
  }
  return n;
}
export function appendRef(n, ref, quote, extra = []) {
  n.blocks.push(mkBlock('ref', { ref, quote: quote || '' }), ...extra);
  if (!n.blocks.length || n.blocks[n.blocks.length - 1].type !== 'p') n.blocks.push(mkBlock('p'));
  save('notes', n);
}
export const segRef = (L, i) => ({ type: 'seg', lectureId: L.id, seg: i, t: L.segments[i] ? L.segments[i].t : 0 });
export const noteExcerpt = n => stripTags(noteText(n)).slice(0, 140);

/* ---------- tasks ---------- */
export function addTask(o) {
  return add('tasks', Object.assign({ id: uid('t'), kind: 'personal', status: 'open', deadline: '', desc: '', tags: [], created: Date.now() }, o));
}
/* Scan a lecture for things that sound like tasks. They are only suggestions, and each shows where it was heard. */
export function scanTasks(L) {
  const found = extractTasksCached(L); let n = 0;
  found.forEach(f => {
    const ref = { type: 'seg', lectureId: L.id, seg: f.seg, t: f.t };
    if (D.tasks.some(t => t.ref && t.ref.type === 'seg' && t.ref.lectureId === L.id && t.ref.seg === f.seg)) return;
    addTask({ courseId: L.courseId, moduleId: L.moduleId, lectureId: L.id, kind: 'suggested', auto: true, title: f.title, desc: f.desc, deadline: f.deadline, deadlineGuess: f.deadlineGuess, deadlineFrom: f.deadlineFrom, ref }); n++;
  });
  L.tasksScanned = true; save('lectures', L); return n;
}
import { extractTasks } from './lib.js';
const extractTasksCached = L => extractTasks(L);

/* ---------- transcript text pasted by the learner. "12:14 text" keeps its time; other lines are spaced 30 s apart ---------- */
export function parseTranscript(txt) {
  const segs = []; let prev = -30;
  String(txt).split(/\n+/).filter(x => x.trim()).forEach(line => {
    const m = line.match(/^\s*\[?(?:(\d+):)?(\d{1,2}):(\d\d)\]?\s+(.*)$/); let t, text = line.trim();
    if (m) { t = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); text = m[4]; } else t = prev + 30;
    prev = t; segs.push({ t, text });
  });
  return segs;
}

/* ---------- what is selected in the transcript ---------- */
export let SEL = null;
export const setSel = s => { SEL = s; };
const ctxText = (L, i) => L.segments.slice(Math.max(0, i - 2), i + 3).map(segText).join(' ');

const doneToast = (msg, ref) => toast(msg, ref ? { act: 'openRef', id: '', label: 'Open' } : undefined);
function toastOpen(msg, ref) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = `<div class="toast" role="status">${esc(msg)} ${ref ? `<button class="link" data-act="openRef" data-ref="${esc(JSON.stringify(ref))}">Open</button>` : ''}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, 6500);
}

export const ACTS = [
  { id: 'clean', emoji: '🧹', label: 'Add to Clean Notes', run(s) {
    const L = lec(s.lectureId); L.cleanAdds = L.cleanAdds || [];
    L.cleanAdds.push({ id: uid('ca'), text: s.text, ref: segRef(L, s.seg), at: Date.now() }); save('lectures', L);
    toastOpen('Added to Clean Notes (under “Added by you”).', { type: 'lecture', lectureId: L.id, tab: 'notes' }); } },
  { id: 'mynotes', emoji: '📝', label: 'Add to My Notes', run(s) {
    const L = lec(s.lectureId), n = autoNote(L.courseId, 'lecture', L.id); appendRef(n, segRef(L, s.seg), s.text);
    toastOpen('Added to your notes for this lecture, with a link back to ' + fmt(L.segments[s.seg].t) + '.', { type: 'note', noteId: n.id }); } },
  { id: 'simple', emoji: '🌸', label: 'Explain more simply', run: s => explain(s, 'simple') },
  { id: 'example', emoji: '🧪', label: 'Explain with an example', run: s => explain(s, 'example') },
  { id: 'question', emoji: '❓', label: 'Create a question', async run(s) {
    const L = lec(s.lectureId);
    const v = await ask({ title: 'Write your question', intro: 'It will wait in your open questions, linked to this moment of the lecture.', fields: [{ id: 'q', label: 'Question', type: 'textarea', rows: 3, value: '', ph: 'What does … mean here?' }], ok: 'Save question' });
    if (!v || !v.q.trim()) return;
    const t = addTask({ courseId: L.courseId, moduleId: L.moduleId, lectureId: L.id, kind: 'question', title: v.q.trim().slice(0, 140), desc: '“' + s.text.slice(0, 200) + '”', ref: segRef(L, s.seg) });
    toastOpen('Saved to your open questions.', { type: 'task', id: t.id }); } },
  { id: 'important', emoji: '⭐', label: 'Mark important', run(s) {
    const L = lec(s.lectureId), sg = L.segments[s.seg]; sg.imp = !sg.imp; save('lectures', L); render(); toast(sg.imp ? '⭐ Marked as important.' : 'Mark removed.'); } },
  { id: 'cheat', emoji: '🗒️', label: 'Add to Cheat Sheet', run(s) {
    const L = lec(s.lectureId), n = autoNote(L.courseId, 'cheat'); appendRef(n, segRef(L, s.seg), s.text);
    toastOpen('Added to your Cheat Sheet.', { type: 'note', noteId: n.id }); } },
  { id: 'flash', emoji: '🃏', label: 'Create a flashcard', async run(s) {
    const L = lec(s.lectureId);
    const v = await ask({ title: 'Make a flashcard', intro: 'Write the front and the back yourself. Cards are saved in your “Flashcards” note. (A review mode comes later.)', fields: [{ id: 'f', label: 'Front (question)', type: 'textarea', rows: 2, value: '' }, { id: 'b', label: 'Back (answer)', type: 'textarea', rows: 3, value: s.text.slice(0, 300) }], ok: 'Save card' });
    if (!v || !v.f.trim()) return;
    let n = D.notes.find(x => x.auto && x.courseId === L.courseId && x.title === 'Flashcards');
    if (!n) n = newNote({ courseId: L.courseId, kind: 'cheat', title: 'Flashcards', blocks: [], auto: true });
    n.blocks.push(mkBlock('callout', { html: `<b>Q:</b> ${esc(v.f.trim())}<br><b>A:</b> ${esc(v.b.trim())}`, prov: 'you', ref: segRef(L, s.seg) }), mkBlock('p')); save('notes', n);
    toastOpen('Flashcard saved.', { type: 'note', noteId: n.id }); } },
  { id: 'confusing', emoji: '😭', label: 'Add to Still Confusing', run(s) {
    const L = lec(s.lectureId), n = autoNote(L.courseId, 'confusing'); appendRef(n, segRef(L, s.seg), s.text);
    toastOpen('Added to Still Confusing. No shame, this is the useful list.', { type: 'note', noteId: n.id }); } },
  { id: 'tutor', emoji: '🎓', label: 'Ask the course tutor', run: s => tutor(s) },
  { id: 'task', emoji: '✅', label: 'Create a task', async run(s) {
    const L = lec(s.lectureId);
    const v = await ask({ title: 'New task', fields: [{ id: 'title', label: 'What needs doing?', value: s.text.slice(0, 90), required: true }, { id: 'deadline', label: 'Deadline (optional)', type: 'date', value: '' }], ok: 'Save task' });
    if (!v || !v.title.trim()) return;
    const t = addTask({ courseId: L.courseId, moduleId: L.moduleId, lectureId: L.id, kind: 'personal', title: v.title.trim(), deadline: v.deadline || '', desc: '“' + s.text.slice(0, 200) + '”', ref: segRef(L, s.seg) });
    toastOpen('Task saved.', { type: 'task', id: t.id }); } },
];
H.selAct = d => { const a = ACTS.find(x => x.id === d.a); if (!a || !SEL) return; const s = SEL; closeSheet(); clearSel(); Promise.resolve(a.run(s)).then(() => { if (V.n === 'lec') render(); }); };
export function clearSel() { SEL = null; document.body.classList.remove('has-sel'); const b = $('#selbar'); if (b) b.innerHTML = ''; try { getSelection().removeAllRanges(); } catch (e) { } }
export function selSheet(sel) {
  SEL = sel; const L = lec(sel.lectureId);
  sheet(`<h3>What would you like to do with this?</h3><blockquote class="quote">${esc(sel.text.slice(0, 260))}${sel.text.length > 260 ? '…' : ''}<br><span class="small muted">${L ? esc(L.title) + ' · ' + fmt(sel.t) : ''}</span></blockquote>
  <div class="grid2 acts">${ACTS.map(a => `<button class="btn soft" data-act="selAct" data-a="${a.id}">${a.emoji} ${a.label}</button>`).join('')}</div>
  <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Cancel</button></div>`, { label: 'Actions for this passage' });
}
H.segMenu = d => { const L = lec(d.id); if (!L) return; const i = +d.i; selSheet({ lectureId: L.id, seg: i, t: L.segments[i].t, text: segText(L.segments[i]) }); };

/* ---------- explain a passage ---------- */
const localConcepts = text => ids().filter(id => KB[id].re.test(text)).slice(0, 2);
async function explain(s, mode) {
  const L = lec(s.lectureId), local = localConcepts(s.text + ' ' + codeOf(L.segments[s.seg] || {}));
  const title = mode === 'example' ? '🧪 An example' : '🌸 In simpler words';
  const quote = `<blockquote class="quote">${esc(s.text.slice(0, 220))}${s.text.length > 220 ? '…' : ''}</blockquote>`;
  const save2 = html => `<div class="row" style="margin-top:12px"><button class="btn soft" data-act="saveExplain">📝 Save to My Notes</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`;
  let body = '', saved = '';
  if (local.length) {
    body = local.map(id => { const k = KB[id]; const ex = mode === 'example' ? (k.ex || (k.steps && k.steps.length ? k.steps.map((x, j) => `${j + 1}. ${x}`).join('\n') : '') || k.cats) : ''; saved += `${k.name}: ${mode === 'example' ? ex : k.kitten}\n`; return `<h4>${k.e} ${esc(k.name)}</h4><p>${md(mode === 'example' ? '' : k.kitten)}</p>${mode === 'example' ? (k.ex ? `<pre>${esc(k.ex)}</pre>` : k.steps && k.steps.length ? `<ol>${k.steps.map(x => `<li>${md(x)}</li>`).join('')}</ol>` : `<p>${md(k.cats)}</p>`) : ''}<p><span class="small">${k.remote ? prov('llm') : prov('ai')}</span> <button class="link" data-act="concept" data-id="${id}">Open full explanation</button></p>`; }).join('');
    sheet(`<h3>${title}</h3>${quote}${body}${nav.api.llm ? `<p><button class="btn ghost" data-act="explainAI" data-mode="${mode}">✨ Ask the AI for a fresh explanation</button></p>` : ''}${save2()}`, { label: title });
    explain.last = { s, text: saved.trim(), prov: local.some(i => KB[i].remote) ? 'llm' : 'ai' }; return;
  }
  if (nav.api.llm) { await explainAI(s, mode); return; }
  sheet(`<h3>${title}</h3>${quote}<p>I can only explain what is in this course's built-in vocabulary, and nothing in this passage matches it. I don't want to invent an explanation.</p><p class="muted">With an AI key connected to this app's server I could explain any passage. For now you can save it to <b>Still Confusing</b> or write your own question.</p><div class="row"><button class="btn soft" data-act="selActAgain" data-a="confusing">😭 Add to Still Confusing</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: title });
  SEL = s;
}
H.selActAgain = d => { const a = ACTS.find(x => x.id === d.a); const s = SEL || (explain.last && explain.last.s); closeSheet(); if (a && s) a.run(s); };
async function explainAI(s, mode, question) {
  const L = lec(s.lectureId), title = mode === 'ask' ? '🎓 Course tutor' : mode === 'example' ? '🧪 An example' : '🌸 In simpler words';
  sheet(`<h3>${title}</h3><p>🐱 Thinking…</p>`, { label: title });
  try {
    const r = await api('/api/explain', { course: course(L.courseId).name, mode, text: s.text, context: ctxText(L, s.seg), question });
    explain.last = { s, text: r.answer + (r.outside ? '\n(Outside the course: ' + r.outside + ')' : ''), prov: 'llm' };
    sheet(`<h3>${title}</h3><blockquote class="quote">${esc(s.text.slice(0, 200))}</blockquote><p>${esc(r.answer)}</p><p>${prov('llm')}</p>${r.outside ? `<p>${prov('outside')} ${esc(r.outside)}</p>` : ''}<p class="small muted">Written by an AI from this passage and the lines around it. Check it against what the lecturer said.</p><div class="row"><button class="btn soft" data-act="saveExplain">📝 Save to My Notes</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: title });
  } catch (e) { sheet(`<h3>${title}</h3><p>I couldn't reach the AI just now. Nothing was lost. Try again in a moment.</p><div class="row"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: title }); }
}
H.explainAI = d => { const l = explain.last; const s = SEL || (l && l.s); if (s) explainAI(s, d.mode); };
H.saveExplain = () => {
  const l = explain.last; if (!l) return; const L = lec(l.s.lectureId), n = autoNote(L.courseId, 'lecture', L.id);
  n.blocks.push(mkBlock('ref', { ref: segRef(L, l.s.seg), quote: l.s.text }), mkBlock('callout', { html: esc(l.text).replace(/\n/g, '<br>'), prov: l.prov }), mkBlock('p')); save('notes', n);
  closeSheet(); toastOpen('Saved to your notes, labelled as an explanation and not as what the lecturer said.', { type: 'note', noteId: n.id });
};
async function tutor(s) {
  const L = lec(s.lectureId);
  const v = await ask({ title: '🎓 Ask the course tutor', intro: nav.api.llm ? 'The question goes to the AI together with this passage. Your audio never leaves your device.' : 'No AI is connected, so I can’t write an answer. I can show you where your own course material talks about it.', fields: [{ id: 'q', label: 'Your question', type: 'textarea', rows: 3, value: '', ph: 'Why does this need …?' }], ok: nav.api.llm ? 'Ask' : 'Find it in my course' });
  if (!v || !v.q.trim()) return;
  SEL = s;
  if (nav.api.llm) return explainAI(s, 'ask', v.q.trim());
  const hits = search(v.q.trim() + '', { courseId: L.courseId, limit: 6 }).filter(h => h.type !== 'glossary');
  sheet(`<h3>🎓 Where this comes up in your course</h3><p class="muted">This is a search through what you already have, not an AI answer.</p>${hits.length ? hits.map(h => `<button class="res" data-act="openRef" data-ref="${esc(JSON.stringify(h.ref))}"><span class="src">${esc(h.title)}</span><span class="tx">${excerpt(h.text, v.q.trim())}</span></button>`).join('') : '<p>Nothing in your course matches those words yet.</p>'}<div class="row"><button class="btn soft" data-act="selActAgain" data-a="question">❓ Save as a question instead</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Course search' });
}

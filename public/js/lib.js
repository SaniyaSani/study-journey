// Pure learning logic: no DOM. Reads the in-memory documents from store.js, so it can be unit-tested in Node.
import { D } from './store.js';
import { KB, GROUPS, ids, ancestors } from './kb.js';

/* ---------- small helpers ---------- */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
export const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const stripTags = h => String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
export const despeak = t => String(t).replace(/\s*\bunderscore\b\s*/gi, '_');
export const groupName = g => g === '_' ? 'Introduction' : (GROUPS[g] || g);
export const fam = id => (D.meta && D.meta.fam[id]) || 0;

/* ---------- transcript text: the raw words are never changed; a correction sits on top ---------- */
export const segText = sg => (sg.edit && sg.edit.text) ? sg.edit.text : sg.text;
export const codeOf = sg => sg.fixed || sg.code || '';
export function cleanText(t) {
  return t.replace(/\b(um+|uh+|erm?|you know|kind of|I think)\b,?\s*/gi, '').replace(/^(okay|ok|so|now|right)[, ]+(so[, ]+)?/i, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/^./, c => c.toUpperCase()).trim();
}
export const EMPH = /(this is important|remember this|this will be on the exam|the key point is|you should understand|we'll use this later|we will use this later|be careful here|common mistake)/i;
export const WARN = /(be careful|common mistake|watch out|warning|don't forget|do not forget|never |avoid |pitfall|order matters)/i;
export const emphasisOf = sg => (segText(sg).match(EMPH) || [])[0] || null;

/* ---------- analysis of one lecture (concepts, topics, emphasis) ---------- */
export const poolOf = L => (L.cids && L.cids.length) ? L.cids.filter(i => KB[i]) : ids().filter(i => !KB[i].remote);
export function analyze(L) {
  const pool = poolOf(L), found = {}, order = [], topics = [], info = [];
  let g = '_';
  L.segments.forEach((sg, i) => {
    const txt = segText(sg) + ' ' + codeOf(sg);
    const hit = pool.filter(id => KB[id].re.test(txt));
    hit.forEach(id => { if (!found[id]) { found[id] = { id, seg: i, t: sg.t }; order.push(id); } });
    if (hit.length) g = KB[hit[hit.length - 1]].g;
    info.push({ g, hit, emph: emphasisOf(sg) });
    if (!topics.length || topics[topics.length - 1].g !== g) topics.push({ g, idx: [] });
    topics[topics.length - 1].idx.push(i);
  });
  if (L.cids) L.cids.forEach(id => { if (KB[id] && !found[id]) { const i = Math.min(KB[id].firstSeg || 0, Math.max(0, L.segments.length - 1)); found[id] = { id, seg: i, t: L.segments[i] ? L.segments[i].t : 0, assumed: true }; order.push(id); } });
  return { found, order, topics, info };
}
export function courseConcepts(courseId) {
  const m = {};
  D.lectures.filter(l => l.courseId === courseId && l.status === 'ready').forEach(L => { const A = analyze(L); A.order.forEach(id => { if (!m[id]) m[id] = { id, lec: L, t: A.found[id].t, seg: A.found[id].seg, assumed: !!A.found[id].assumed }; }); });
  return m;
}
export function courseProgress(courseId) {
  const cs = Object.keys(courseConcepts(courseId)), clicks = D.meta.clicks || {};
  return { total: cs.length, understood: cs.filter(i => fam(i) >= 80).length, confusing: cs.filter(i => clicks[i] > 0 && fam(i) < 70).length, fresh: cs.filter(i => !fam(i) && !clicks[i]).length };
}

/* where a concept shows up: transcript passages, material pages, notes */
export function conceptSources(id, courseId) {
  const k = KB[id], out = { segs: [], pages: [], notes: [] };
  if (!k) return out;
  D.lectures.filter(l => !courseId || l.courseId === courseId).forEach(L => L.segments.forEach((sg, i) => { if (k.re.test(segText(sg) + ' ' + codeOf(sg))) out.segs.push({ L, i, t: sg.t, text: segText(sg) }); }));
  D.materials.filter(m => m.status === 'filed' && (!courseId || m.courseId === courseId)).forEach(m => ((m.extract && m.extract.pages) || []).forEach(p => { if (k.re.test(p.text)) out.pages.push({ m, page: p.n }); }));
  D.notes.filter(n => !courseId || n.courseId === courseId).forEach(n => { if (k.re.test(noteText(n))) out.notes.push(n); });
  return out;
}
export function materialHits(re, scope) {
  const out = [];
  D.materials.filter(m => m.status === 'filed' && m.courseId === scope.courseId && (!scope.lectureId || m.lectureId === scope.lectureId || (!m.lectureId && (!m.moduleId || m.moduleId === scope.moduleId))))
    .forEach(m => ((m.extract && m.extract.pages) || []).forEach(p => { if (re.test(p.text)) out.push({ materialId: m.id, page: p.n, name: m.name, kind: m.kind }); }));
  return out;
}

/* ---------- code: language detection and highlighting ---------- */
export function detectLang(code, hint) {
  if (hint && hint !== 'auto') return hint;
  if (/^\s*#SBATCH|^\s*(sbatch|srun|squeue|scancel|salloc)\b/m.test(code)) return 'slurm';
  if (/#\s*include|\bint\s+main\b|\bMPI_\w+\s*\(|\b(?:printf|malloc|free)\s*\(|;\s*$/m.test(code) && !/^\s*(gcc|mpicc|mpirun|\.\/)/m.test(code)) return 'c';
  return 'bash';
}
const STR = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/;
const LANGS = {
  c: [['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//], ['p', /^[ \t]*#[ \t]*\w+[^\n]*/m], ['s', STR], ['f', /\bMPI_\w+/], ['k', /\b(?:int|char|double|float|void|long|short|unsigned|const|struct|typedef|return|if|else|for|while|do|break|continue|sizeof|static|extern|NULL)\b/], ['n', /\b\d+(?:\.\d+)?\b/], ['f', /\b[A-Za-z_]\w*(?=\s*\()/]],
  bash: [['p', /^[ \t]*#SBATCH[^\n]*/m], ['c', /(?:^|(?<=\s))#[^\n]*/], ['s', STR], ['v', /\$\{[^}]*\}|\$[A-Za-z_]\w*|\$[?#@*!$0-9]/], ['o', /(?<=^|\s)--?[A-Za-z][\w-]*/], ['p', /&&|\|\||[|;<>]+/], ['n', /\b\d+\b/], ['f', /^[ \t]*[A-Za-z_./][\w./-]*/m]]
};
LANGS.slurm = LANGS.bash;
export function highlight(code, lang) {
  const spec = LANGS[lang];
  if (!spec) return esc(code);
  const re = new RegExp(spec.map(([, r]) => '(' + r.source + ')').join('|'), 'gm');
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const gi = m.slice(1).findIndex(x => x !== undefined);
    out += `<span class="tk-${spec[gi][0]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}

/* ---------- tasks mentioned in a lecture (suggestions only; the learner confirms) ---------- */
const TASK_RE = /\b(exercises?|homework|assignments?|problem set|hand[- ]?in|submit|submission|deadline|due (?!to\b)|please read|read chapter|for next (?:week|time|lecture|class))/i;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function parseDeadline(text, baseISO) {
  let m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (m) return { date: m[1], guess: false };
  m = text.match(/\b(?:by|before|until|due(?: on)?|on)\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (m) {
    const base = new Date((baseISO || todayISO()) + 'T12:00:00'); let diff = (DAYS.indexOf(m[1].toLowerCase()) - base.getDay() + 7) % 7; if (diff === 0) diff = 7;
    base.setDate(base.getDate() + diff);
    return { date: new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 10), guess: true, from: m[0] };
  }
  return { date: '', guess: false };
}
export function extractTasks(L) {
  const out = [];
  L.segments.forEach((sg, i) => {
    const text = segText(sg);
    if (!TASK_RE.test(text)) return;
    const sents = text.split(/(?<=[.!?])\s+/);
    const hit = sents.filter(s => TASK_RE.test(s));
    const title = despeak(hit[0] || text).replace(/^(also|and|so|okay|now)[, ]+/i, '').replace(/^./, c => c.toUpperCase()).slice(0, 110);
    const dl = parseDeadline(text, L.date);
    out.push({ seg: i, t: sg.t, title, desc: despeak(text), deadline: dl.date, deadlineGuess: dl.guess, deadlineFrom: dl.from || '' });
  });
  return out;
}

/* ---------- notes ---------- */
export const blockText = b => b.type === 'code' ? (b.text || '') : stripTags(b.html != null ? b.html : (b.text || '')) + (b.type === 'ref' && b.quote ? ' ' + b.quote : '');
export const noteText = n => (n.title || '') + ' ' + n.blocks.map(blockText).join(' ');
export const NOTEBOOKS = [
  { id: 'lecture', emoji: '📝', title: 'Lecture Notes', hint: 'Your own notes from lectures.' },
  { id: 'question', emoji: '❓', title: 'My Questions', hint: 'Things to ask the lecturer or look up.' },
  { id: 'exercise', emoji: '🧪', title: 'Exercises', hint: 'Working notes for exercise sheets.' },
  { id: 'code', emoji: '💻', title: 'Code & Commands', hint: 'Every command and code snippet in this course, gathered automatically.', derived: true },
  { id: 'cheat', emoji: '🗒️', title: 'Cheat Sheets', hint: 'Short reference notes you built.' },
  { id: 'exam', emoji: '🎓', title: 'Exam Preparation', hint: 'What you want to revise before the exam.' },
  { id: 'understood', emoji: '🌸', title: 'Things I Finally Understood', hint: 'Moments where something clicked.' },
  { id: 'confusing', emoji: '😭', title: 'Still Confusing', hint: 'Things that are still unclear. No shame, this is the useful list.' }
];

/* ---------- references (citations and backlinks) ---------- */
export function segAt(L, t) { let k = 0; L.segments.forEach((s, i) => { if (s.t <= t + 0.5) k = i; }); return k; }
export const refKey = r => !r ? '' : r.type === 'seg' ? `seg:${r.lectureId}:${r.seg}` : r.type === 'audio' ? `audio:${r.lectureId}:${Math.floor(r.t || 0)}` : r.type === 'material' ? `mat:${r.materialId}:${r.page || 0}` : r.type === 'concept' ? `con:${r.id}` : r.type === 'note' ? `note:${r.noteId}` : r.type === 'task' ? `task:${r.id}` : r.type;
export function refLabel(r) {
  if (!r) return 'link';
  const L = r.lectureId ? D.lectures.find(l => l.id === r.lectureId) : null;
  if (r.type === 'seg' || r.type === 'audio') return L ? `${L.title} · ${fmt(r.t || 0)}` : 'Lecture removed';
  if (r.type === 'material') { const m = D.materials.find(x => x.id === r.materialId); return m ? `${m.name}${r.page ? ' · p.' + r.page : ''}` : 'Material removed'; }
  if (r.type === 'concept') return KB[r.id] ? KB[r.id].name : r.id;
  if (r.type === 'note') { const n = D.notes.find(x => x.id === r.noteId); return n ? (n.title || 'Untitled note') : 'Note removed'; }
  if (r.type === 'task') { const t = D.tasks.find(x => x.id === r.id); return t ? t.title : 'Task removed'; }
  if (r.type === 'lecture') return L ? L.title : 'Lecture removed';
  return r.type;
}
export const refIcon = r => !r ? '🔗' : r.type === 'seg' || r.type === 'audio' ? '🔊' : r.type === 'material' ? '📄' : r.type === 'concept' ? '🐱' : r.type === 'note' ? '📝' : r.type === 'task' ? '✅' : '🔗';
/* Which notes/tasks point at this transcript segment (or this audio moment)? */
export function backlinks(lectureId, segIdx) {
  const L = D.lectures.find(l => l.id === lectureId); if (!L) return { notes: [], tasks: [] };
  const lo = L.segments[segIdx] ? L.segments[segIdx].t : 0, hi = L.segments[segIdx + 1] ? L.segments[segIdx + 1].t : Infinity;
  const hits = r => r && r.lectureId === lectureId && ((r.type === 'seg' && r.seg === segIdx) || (r.type === 'audio' && r.t >= lo && r.t < hi));
  return { notes: D.notes.filter(n => n.blocks.some(b => hits(b.ref))), tasks: D.tasks.filter(t => hits(t.ref) && t.status !== 'dismissed') };
}

/* ---------- placing a new material: suggestions only, never silent moves ---------- */
const EXT = { pdf: 'pdf', pptx: 'slides', ppt: 'slides', key: 'slides', odp: 'slides', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', webm: 'audio', c: 'code', h: 'code', cpp: 'code', py: 'code', sh: 'code', slurm: 'code', job: 'code', f90: 'code', java: 'code', js: 'code', txt: 'text', md: 'text', csv: 'data', json: 'data', docx: 'doc' };
export function kindOf(name, mime, isUrl) {
  if (isUrl) return 'url';
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (/exercise|assignment|homework|sheet|übung|uebung|problem[- ]?set|aufgabe/i.test(name) && (ext === 'pdf' || ext === 'docx' || ext === 'txt' || ext === 'md')) return 'exercise';
  if (EXT[ext]) return EXT[ext];
  if (/^image\//.test(mime || '')) return 'image';
  if (/^audio\//.test(mime || '')) return 'audio';
  return 'other';
}
const numIn = s => { const m = String(s).toLowerCase().match(/(?:week|woche|wk|lecture|lec|vorlesung|\bw|\bl)[\s_.-]*0*(\d{1,2})\b/); return m ? +m[1] : null; };
const words = s => String(s).toLowerCase().split(/[^a-zäöüß0-9]+/).filter(w => w.length >= 5 && !/^(week|lecture|woche)$/.test(w));
export function suggestPlacement(m) {
  const reasons = [], text = ((m.extract && m.extract.pages) || []).slice(0, 4).map(p => p.text).join(' ').slice(0, 6000);
  const hayName = String(m.name).toLowerCase(), hay = hayName + ' ' + text.toLowerCase();
  const sug = { courseId: null, moduleId: null, lectureId: null, kind: m.kind, tags: [], concepts: [], reasons, confidence: 'low' };
  let best = { c: null, s: 0 };
  D.courses.forEach(c => {
    let s = 0; const code = c.code.toLowerCase().replace(/\s+/g, '');
    if (code && hay.replace(/[\s_-]+/g, '').includes(code)) { s += 5; }
    words(c.name).forEach(w => { if (hay.includes(w)) s += 1; });
    if (s > best.s) best = { c, s, code: !!(code && hay.replace(/[\s_-]+/g, '').includes(code)) };
  });
  if (!best.c && D.courses.length === 1) { best = { c: D.courses[0], s: 1, only: true }; }
  if (!best.c) return sug;
  sug.courseId = best.c.id;
  reasons.push(best.only ? `${best.c.code || best.c.name} is your only notebook.` : best.code ? `“${best.c.code}” appears in the file.` : `The file mentions words from “${best.c.name}”.`);
  // week / module
  const mods = D.modules.filter(x => x.courseId === best.c.id);
  const nName = numIn(m.name), nText = numIn(text.slice(0, 600));
  let bm = { mod: null, s: 0 };
  mods.forEach(x => {
    let s = 0; const nm = numIn(x.title);
    if (nm != null && nName === nm) s += 6; else if (nm != null && nText === nm) s += 3;
    const hits = words(x.title).filter(w => hay.includes(w)); s += hits.length * 2;
    if (s > bm.s) bm = { mod: x, s, byNum: nm != null && (nName === nm || nText === nm), hits };
  });
  if (bm.mod && bm.s >= 2) {
    sug.moduleId = bm.mod.id;
    reasons.push(bm.byNum ? `The ${nName != null ? 'file name' : 'first page'} says week ${nName != null ? nName : nText}.` : `It mentions “${bm.hits.join(', ')}”, which is in “${bm.mod.title}”.`);
    // lecture
    const ls = D.lectures.filter(l => l.moduleId === bm.mod.id);
    let bl = { L: null, s: 0 };
    ls.forEach(l => { let s = 0; const nl = numIn(l.title); if (nl != null && nName === nl && /lec|vorlesung|l\d/i.test(m.name)) s += 4; words(l.title).forEach(w => { if (hay.includes(w)) s += 2; }); if (s > bl.s) bl = { L: l, s }; });
    if (bl.L) { sug.lectureId = bl.L.id; reasons.push(`The name matches “${bl.L.title}”.`); }
    else if (ls.length === 1) { sug.lectureId = ls[0].id; reasons.push(`“${ls[0].title}” is the only lecture in that week.`); }
  }
  // concepts + tags
  const cs = ids().filter(id => KB[id].re.test(hay) && !KB[id].remote).slice(0, 6);
  sug.concepts = cs;
  if (cs.length) reasons.push(`The text mentions ${cs.slice(0, 3).map(c => KB[c].name).join(', ')}.`);
  sug.tags = [m.kind].filter(x => x && x !== 'other');
  sug.confidence = sug.moduleId && (bm.byNum || bm.s >= 4) ? 'high' : sug.moduleId ? 'medium' : 'low';
  return sug;
}

/* ---------- rescue ("what is happening right now?") ---------- */
export function rescueData(L, now) {
  const pool = poolOf(L), win = L.segments.map((s, i) => ({ s, i })).filter(({ s }) => s.t <= now && s.t >= now - 300);
  if (!win.length) return { kind: 'empty' };
  let cur = null, curSeg = null;
  for (let k = win.length - 1; k >= 0 && !cur; k--) { const txt = segText(win[k].s) + ' ' + codeOf(win[k].s); const hit = pool.filter(id => KB[id].re.test(txt)); if (hit.length) { cur = hit[hit.length - 1]; curSeg = win[k].i; } }
  if (!cur) return { kind: 'nothing' };
  const anc = ancestors(cur), before = [];
  win.forEach(({ s, i }) => pool.forEach(id => { if (anc.has(id) && KB[id].re.test(segText(s) + ' ' + codeOf(s)) && !before.find(b => b.id === id)) before.push({ id, t: s.t, seg: i }); }));
  before.sort((a, b) => b.t - a.t);
  const chain = []; let c = cur; while (c && KB[c] && chain.length < 5) { chain.unshift(c); c = KB[c].pre[0]; }
  const m = materialHits(KB[cur].re, { courseId: L.courseId, lectureId: L.id, moduleId: L.moduleId }).slice(0, 3);
  return { kind: 'ok', cur, curSeg, before: before[0] || null, chain, next: KB[cur].next, materials: m, from: win[0].s.t };
}

/* ---------- search ---------- */
export function buildIndex(courseId) {
  const docs = [], seen = new Set(), ok = id => !courseId || id === courseId;
  const push = d => docs.push(d);
  D.lectures.filter(l => ok(l.courseId)).forEach(L => {
    push({ type: 'lecture', title: L.title, text: L.title + ' ' + (L.tags || []).map(t => '#' + t).join(' '), courseId: L.courseId, lectureId: L.id, ref: { type: 'lecture', lectureId: L.id } });
    L.segments.forEach((sg, i) => {
      const code = codeOf(sg), ref = { type: 'seg', lectureId: L.id, seg: i, t: sg.t };
      push({ type: 'transcript', title: `${fmt(sg.t)} · ${L.title}`, text: segText(sg) + (sg.edit ? ' ' + sg.text : '') + (code ? ' ' + code : ''), courseId: L.courseId, lectureId: L.id, ref, conceptable: true });
      if (code) push({ type: 'code', title: `${fmt(sg.t)} · ${L.title}`, text: code, lang: detectLang(code), courseId: L.courseId, lectureId: L.id, ref });
    });
    Object.entries(L.cleanEdits || {}).forEach(([i, e]) => push({ type: 'clean', title: `Clean Notes · ${L.title}`, text: e.text, courseId: L.courseId, lectureId: L.id, ref: { type: 'seg', lectureId: L.id, seg: +i, t: (L.segments[+i] || {}).t || 0, tab: 'notes' } }));
    (L.cleanAdds || []).forEach(a => push({ type: 'clean', title: `Clean Notes · ${L.title}`, text: a.text, courseId: L.courseId, lectureId: L.id, ref: Object.assign({}, a.ref, { tab: 'notes' }) }));
    analyze(L).order.forEach(id => {
      const k = KB[id], key = L.courseId + id; if (!k || seen.has(key)) return; seen.add(key);
      push({ type: 'kitten', title: k.name, text: [k.name, k.why, k.simple, k.kitten, k.zero, k.technical, k.ex || ''].join(' '), courseId: L.courseId, lectureId: L.id, ref: { type: 'concept', id } });
      push({ type: 'glossary', title: k.name, text: k.name + ' ' + k.simple + ' ' + k.technical, courseId: L.courseId, lectureId: L.id, ref: { type: 'concept', id } });
    });
  });
  D.notes.filter(n => ok(n.courseId)).forEach(n => {
    const ref = { type: 'note', noteId: n.id };
    push({ type: 'note', title: n.title || 'Untitled note', text: noteText(n) + ' ' + (n.tags || []).map(t => '#' + t).join(' '), courseId: n.courseId, lectureId: n.lectureId, ref, conceptable: true });
    n.blocks.filter(b => b.type === 'code').forEach(b => push({ type: 'code', title: `Note · ${n.title || 'Untitled'}`, text: b.text, lang: detectLang(b.text, b.lang), courseId: n.courseId, lectureId: n.lectureId, ref }));
  });
  D.materials.filter(m => m.status === 'filed' ? ok(m.courseId) : !courseId).forEach(m => {
    const ref = { type: 'material', materialId: m.id };
    push({ type: 'material', title: m.name, text: m.name + ' ' + (m.tags || []).map(t => '#' + t).join(' ') + ' ' + (m.url || ''), courseId: m.courseId, lectureId: m.lectureId, ref });
    ((m.extract && m.extract.pages) || []).forEach(p => {
      const d = { type: m.kind === 'code' ? 'code' : 'material', title: `${m.name}${m.extract.pages.length > 1 ? ' · p.' + p.n : ''}`, text: p.text, lang: m.kind === 'code' ? detectLang(p.text) : undefined, courseId: m.courseId, lectureId: m.lectureId, ref: { type: 'material', materialId: m.id, page: p.n }, conceptable: true };
      push(d);
    });
  });
  D.tasks.filter(t => ok(t.courseId) && t.status !== 'dismissed').forEach(t => push({ type: 'task', title: t.title, text: t.title + ' ' + (t.desc || '') + ' ' + (t.notes || '') + ' ' + (t.tags || []).map(x => '#' + x).join(' '), courseId: t.courseId, lectureId: t.lectureId, ref: { type: 'task', id: t.id } }));
  return docs;
}
const TYPE_W = { lecture: 5, note: 4, task: 3, transcript: 3, clean: 3, material: 2, code: 1, kitten: 1, glossary: 1 };
export function search(q, opts = {}) {
  q = String(q || '').trim(); if (!q) return [];
  const low = q.toLowerCase(), toks = low.split(/\s+/).filter(Boolean);
  const cons = ids().filter(id => KB[id].re.test(q) || KB[id].name.toLowerCase() === low);
  const out = [];
  buildIndex(opts.courseId).forEach(d => {
    if (opts.types && !opts.types.includes(d.type)) return;
    const t = d.text.toLowerCase(), tn = t.replace(/_/g, ' ');
    const lit = toks.every(w => t.includes(w) || tn.includes(w.replace(/_/g, ' ')));
    const conc = !lit && d.conceptable && cons.some(id => KB[id].re.test(d.text));
    if (!lit && !conc) return;
    let s = (TYPE_W[d.type] || 0) + (conc ? 1 : 0);
    if (lit) { s += 2; if (t.includes(low)) s += 10; toks.forEach(w => { let c = 0, i = -1; while (c < 3 && (i = t.indexOf(w, i + 1)) >= 0) c++; s += c; }); if (d.title.toLowerCase().includes(low)) s += 6; }
    out.push(Object.assign({}, d, { score: s, viaConcept: conc }));
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.limit || 80);
}
export function excerpt(text, q, n = 90) {
  const t = String(text).replace(/\s+/g, ' ').trim(), low = t.toLowerCase();
  const toks = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  let at = -1; for (const w of toks) { const i = low.indexOf(w); if (i >= 0) { at = i; break; } }
  if (at < 0) { for (const id of ids()) if (KB[id].re.test(t) && KB[id].re.test(q)) { const m = t.match(KB[id].re); if (m) { at = m.index; break; } } }
  if (at < 0) at = 0;
  const a = Math.max(0, at - n / 2), b = Math.min(t.length, at + n * 1.4);
  let s = esc(t.slice(a, b));
  toks.forEach(w => { if (w.length > 1) s = s.replace(new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), x => `<mark>${x}</mark>`); });
  return (a > 0 ? '…' : '') + s + (b < t.length ? '…' : '');
}

/* ---------- tags ---------- */
export function allTags(courseId) {
  const c = {};
  const bump = (arr) => (arr || []).forEach(t => { c[t] = (c[t] || 0) + 1; });
  D.lectures.filter(l => !courseId || l.courseId === courseId).forEach(l => bump(l.tags));
  D.materials.filter(m => !courseId || m.courseId === courseId).forEach(m => bump(m.tags));
  D.notes.filter(n => !courseId || n.courseId === courseId).forEach(n => bump(n.tags));
  D.tasks.filter(t => !courseId || t.courseId === courseId).forEach(t => bump(t.tags));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}
export const normTag = t => String(t).trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9äöüß_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

/* ---------- smart collections: filtered views, never copies ---------- */
const item = (type, title, excerpt, ref, extra = {}) => Object.assign({ type, title, excerpt, ref }, extra);
const lecs = cid => D.lectures.filter(l => !cid || l.courseId === cid);
export const COLLECTIONS = [
  { id: 'confusing', emoji: '😭', title: "Everything I still don't understand", desc: "Ideas you pressed “I still don't get it” on, plus your Still Confusing notes and open questions.",
    items: cid => {
      const out = [], clicks = D.meta.clicks || {}, cs = {}; (cid ? [cid] : D.courses.map(c => c.id)).forEach(c => Object.assign(cs, courseConcepts(c)));
      Object.keys(cs).filter(id => clicks[id] > 0 && fam(id) < 70).forEach(id => out.push(item('concept', KB[id].name, KB[id].simple, { type: 'concept', id })));
      D.notes.filter(n => (!cid || n.courseId === cid) && n.kind === 'confusing').forEach(n => out.push(item('note', n.title || 'Untitled', noteText(n).slice(0, 140), { type: 'note', noteId: n.id })));
      D.tasks.filter(t => (!cid || t.courseId === cid) && t.kind === 'question' && t.status === 'open').forEach(t => out.push(item('task', t.title, t.desc || '', { type: 'task', id: t.id })));
      return out;
    } },
  { id: 'important', emoji: '⭐', title: 'Everything marked important', desc: 'Transcript passages and notes you starred.',
    items: cid => [...lecs(cid).flatMap(L => L.segments.map((s, i) => s.imp ? item('transcript', `${fmt(s.t)} · ${L.title}`, segText(s), { type: 'seg', lectureId: L.id, seg: i, t: s.t }) : null)), ...D.notes.filter(n => (!cid || n.courseId === cid) && n.important).map(n => item('note', n.title || 'Untitled', noteText(n).slice(0, 140), { type: 'note', noteId: n.id }))].filter(Boolean) },
  { id: 'emphasis', emoji: '✨', title: 'All professor-emphasised points', desc: 'Only places where the lecturer actually said something like “this is important”.',
    items: cid => lecs(cid).flatMap(L => L.segments.map((s, i) => emphasisOf(s) ? item('transcript', `${fmt(s.t)} · ${L.title}`, segText(s), { type: 'seg', lectureId: L.id, seg: i, t: s.t }, { badge: emphasisOf(s) }) : null)).filter(Boolean) },
  { id: 'bash', emoji: '💻', title: 'All Bash commands', desc: 'Commands from lectures, notes and code files.', items: cid => codeItems(cid, l => l === 'bash' || l === 'slurm') },
  { id: 'c', emoji: '🔧', title: 'All C code', desc: 'C snippets from lectures, notes and code files.', items: cid => codeItems(cid, l => l === 'c') },
  { id: 'mpi', emoji: '✉️', title: 'All MPI concepts', desc: 'Every MPI idea that has come up in lectures.',
    items: cid => { const cs = {}; (cid ? [cid] : D.courses.map(c => c.id)).forEach(c => Object.assign(cs, courseConcepts(c))); return Object.keys(cs).filter(id => /mpi|rank|communicator/i.test(KB[id].name + ' ' + id)).map(id => item('concept', KB[id].name, KB[id].simple, { type: 'concept', id })); } },
  { id: 'questions', emoji: '❓', title: 'All open questions', desc: 'Your questions that nobody has answered yet.',
    items: cid => [...D.notes.filter(n => (!cid || n.courseId === cid) && n.kind === 'question').map(n => item('note', n.title || 'Untitled', noteText(n).slice(0, 140), { type: 'note', noteId: n.id })), ...D.tasks.filter(t => (!cid || t.courseId === cid) && t.kind === 'question' && t.status === 'open').map(t => item('task', t.title, t.desc || '', { type: 'task', id: t.id }))] },
  { id: 'deadlines', emoji: '📅', title: 'All confirmed deadlines', desc: 'Only assignments you confirmed yourself.',
    items: cid => D.tasks.filter(t => (!cid || t.courseId === cid) && t.kind === 'confirmed' && t.status === 'open' && t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).map(t => item('task', t.title, `due ${t.deadline}`, { type: 'task', id: t.id })) },
  { id: 'exam', emoji: '🎓', title: 'Everything relevant to the exam', desc: 'Tagged #exam, or where the lecturer said “exam”. Nothing is guessed.',
    items: cid => [...lecs(cid).flatMap(L => L.segments.map((s, i) => (s.exam || /\bexam\b/i.test(segText(s))) ? item('transcript', `${fmt(s.t)} · ${L.title}`, segText(s), { type: 'seg', lectureId: L.id, seg: i, t: s.t }) : null)), ...D.notes.filter(n => (!cid || n.courseId === cid) && (n.kind === 'exam' || (n.tags || []).includes('exam'))).map(n => item('note', n.title || 'Untitled', noteText(n).slice(0, 140), { type: 'note', noteId: n.id })), ...D.materials.filter(m => (!cid || m.courseId === cid) && (m.tags || []).includes('exam')).map(m => item('material', m.name, m.kind, { type: 'material', materialId: m.id }))].filter(Boolean) },
  { id: 'unorganized', emoji: '📥', title: 'Materials not yet organised', desc: 'Still waiting in the Inbox.', items: () => D.materials.filter(m => m.status === 'inbox').map(m => item('material', m.name, m.kind, { type: 'material', materialId: m.id })) },
  { id: 'fromrec', emoji: '🎙️', title: 'Notes created from lecture recordings', desc: 'Your notes that point back to a moment in a lecture.',
    items: cid => D.notes.filter(n => (!cid || n.courseId === cid) && n.blocks.some(b => b.ref && (b.ref.type === 'seg' || b.ref.type === 'audio'))).map(n => item('note', n.title || 'Untitled', noteText(n).slice(0, 140), { type: 'note', noteId: n.id })) }
];
function codeItems(cid, langOk) {
  return buildIndex(cid).filter(d => d.type === 'code' && langOk(d.lang)).map(d => item('code', d.title, d.text, d.ref, { lang: d.lang, code: d.text }));
}

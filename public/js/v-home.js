// Home, course pages (overview, notebooks, materials, tasks, glossary, exam prep, collections, textbook) and concept pages.
import { D, uid, add, save, saveMeta, remove, course, mod, lec, note, semester, semesterName, modulesOf, lecturesOf, lecturesIn, deleteCourse, deleteLecture, touchRecent } from './store.js';
import { esc, md, fmt, segAt, courseConcepts, courseProgress, conceptSources, groupName, fam, noteText, buildIndex, COLLECTIONS, NOTEBOOKS, todayISO, stripTags, refLabel } from './lib.js';
import { KB, GROUPS, nm, ids, ancestors } from './kb.js';
import { KIT } from './pixel.js';
import { $, H, HI, V, register, go, ask, confirmSheet, sheet, closeSheet, toast, nav, render, openers, refAttr } from './core.js';
import { crumbs, empty, statusChip, dateLabel, ago, refChip, codeBlock, kindEmoji, prov } from './ui.js';
import { interrupted } from './v-capture.js';
import { tasksBlock } from './v-tasks.js';
import { materialsBlock } from './v-materials.js';
import { card } from './v-lecture.js';
import { noteExcerpt } from './actions.js';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const nextDeadline = () => D.tasks.filter(t => t.kind === 'confirmed' && t.status === 'open' && t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
const noteLine = n => `<a class="res" href="#/n/${n.id}"><span class="src">📝 ${esc(n.title || 'Untitled')} · ${esc((NOTEBOOKS.find(k => k.id === n.kind) || {}).title || '')} · ${ago(n.updated || n.created)}</span><span class="tx">${esc(noteExcerpt(n) || 'Empty note')}</span></a>`;

/* ---------- Home ---------- */
register('home', {
  title: () => 'Home',
  html() {
    const c = course(D.meta.cur) || D.courses[0], inbox = D.materials.filter(m => m.status === 'inbox').length, last = D.meta.last && D.meta.last.type === 'lecture' ? lec(D.meta.last.id) : null;
    const dl = nextDeadline(), conf = COLLECTIONS.find(x => x.id === 'confusing').items(null)[0], recent = [...D.notes].filter(n => noteText(n).trim().length > 2).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0)).slice(0, 4);
    const sug = D.tasks.filter(t => t.kind === 'suggested' && t.status === 'open').length;
    let cont = '';
    if (last) {
      const cc = course(last.courseId), pos = last.playPos > 1 ? last.playPos : 0;
      cont = `<div class="paper continue"><div><div class="small muted">Continue where you left off</div><h3 style="margin:.1em 0">${esc(last.title)}</h3><div class="small muted">${esc(cc ? cc.code || cc.name : '')} · ${last.hasAudio && pos ? 'you stopped at ' + fmt(pos) : dateLabel(last.date)}</div></div><a class="btn" href="#/l/${last.id}/${(D.meta.last.tab) || 'orig'}${pos && last.segments.length ? '?seg=' + segAt(last, pos) : ''}">Continue →</a></div>`;
    }
    return `<div class="hello"><span class="kit">${KIT}</span><div><h1 style="margin:0">🌸 ${greet()}.</h1>${c ? `<p style="font-size:1.1rem;margin:.2em 0">You have <b>${esc(c.name)}</b> today.</p>` : ''}</div></div>
    ${interrupted().map(l => `<div class="err">🎧 “${esc(l.title)}” from ${dateLabel(l.date)} isn't finished yet. Your audio is safe. <button class="link" data-act="recover" data-id="${l.id}">Finish it</button></div>`).join('')}
    ${cont}
    ${c ? `<div class="row" style="margin:12px 0"><button class="btn" data-act="startRec" data-c="${c.id}">🎤 Record a lecture</button><a class="btn soft" href="#/add?c=${c.id}">📎 Bring a lecture in</a><a class="btn soft" href="#/inbox">📥 Add material</a></div>` : ''}
    <div class="grid2">
      <div class="paper"><div class="small muted">📅 Next deadline</div>${dl ? `<h3 style="margin:.2em 0">${esc(dl.title)}</h3><p class="small muted">${dateLabel(dl.deadline)}${dl.deadline < todayISO() ? ' (past)' : ''} · ${esc((course(dl.courseId) || {}).code || '')}</p><button class="btn soft" data-act="taskOpen" data-id="${dl.id}">Open</button>` : `<p class="muted">No deadlines confirmed.${sug ? ` ${sug} possible task${sug === 1 ? ' is' : 's are'} waiting for you to confirm.` : ''}</p>${sug && c ? `<a class="btn soft" href="#/c/${c.id}/tasks">Look at them</a>` : ''}`}</div>
      <div class="paper"><div class="small muted">📥 Inbox</div><h3 style="margin:.2em 0">${inbox ? inbox + ' waiting' : 'All filed'}</h3><p class="muted small">${inbox ? 'Files wait here until you confirm where they belong.' : 'Nothing waiting. Drop in slides, PDFs or code any time.'}</p><a class="btn soft" href="#/inbox">${inbox ? 'Sort the Inbox' : 'Open Inbox'}</a></div>
    </div>
    <div class="paper"><div class="small muted">🌱 One thing to come back to</div>${conf ? `<h3 style="margin:.2em 0">${esc(conf.title)}</h3><p class="small">${esc(String(conf.excerpt).slice(0, 160))}</p><button class="btn soft" data-act="openRef" data-ref="${refAttr(conf.ref)}">Revisit it</button>` : `<p class="muted">Nothing is nagging you. When you press “I STILL DON'T GET IT” or save a question, it will wait here for a calm moment.</p>`}</div>
    ${recent.length ? `<h2 class="sect">📝 Recent notes</h2>${recent.map(noteLine).join('')}` : ''}
    <div class="div" role="presentation"></div><div class="sect"><h2>📚 My courses</h2><button class="link" data-act="renameWs">✏️ ${esc(D.meta.ws.name)}</button></div>
    ${D.semesters.map(s => { const cs = D.courses.filter(x => x.semesterId === s.id); return cs.length ? `<p class="muted small">${esc(s.name)}</p><div class="shelf">${cs.map(k => `<a class="book c${(k.color || 0) % 4}" href="#/c/${k.id}"><b>${esc(k.name)}</b><span class="small">${esc(k.code)} · ${lecturesOf(k.id).length} lecture${lecturesOf(k.id).length === 1 ? '' : 's'}</span></a>`).join('')}</div>` : ''; }).join('')}
    <div class="shelf"><button class="book add" data-act="newCourse">＋ New course</button></div>
    <details><summary>🔒 What happens to my data?</summary><div class="paper small">Everything stays in this browser on this device unless you ask me to transcribe or explain something. <button class="link" data-act="privacy">Read the details</button></div></details>`;
  }
});
H.renameWs = async () => { const v = await ask({ title: 'Name your workspace', fields: [{ id: 'n', label: 'Name', value: D.meta.ws.name, required: true }], ok: 'Save' }); if (v && v.n.trim()) { D.meta.ws.name = v.n.trim(); saveMeta(); render(); } };

/* ---------- creating and managing courses, weeks ---------- */
H.newCourse = async () => {
  closeSheet();
  const v = await ask({ title: '📕 New course', fields: [{ id: 'name', label: 'Course name', ph: 'High Performance Computing', required: true }, { id: 'code', label: 'Course code (optional)', ph: 'ESC401' }, { id: 'sem', label: 'Semester', type: 'select', value: (D.semesters[D.semesters.length - 1] || {}).id, options: [...D.semesters.map(s => ({ v: s.id, l: s.name })), { v: '_new', l: '＋ A new semester…' }] }, { id: 'semname', label: 'New semester name (only if you chose “a new semester”)', ph: semesterName() }, { id: 'desc', label: 'What is it about? (optional)', type: 'textarea', rows: 2 }], ok: 'Create course' });
  if (!v || !v.name.trim()) return;
  let sid = v.sem; if (sid === '_new' || !D.semesters.length) { sid = uid('sem'); add('semesters', { id: sid, name: v.semname.trim() || semesterName(), created: Date.now() }); }
  const c = add('courses', { id: uid('c'), semesterId: sid, code: v.code.trim().toUpperCase(), name: v.name.trim(), desc: v.desc.trim(), color: D.courses.length % 4, created: Date.now() });
  D.meta.cur = c.id; saveMeta(); go('course', { id: c.id }); toast('Course created.');
};
H.addWeek = async d => {
  const cid = d.c, n = modulesOf(cid).length + 1;
  const v = await ask({ title: 'New week or module', fields: [{ id: 't', label: 'Name', value: `Week ${n}`, required: true }], ok: 'Add' });
  if (!v || !v.t.trim()) return; add('modules', { id: uid('m'), courseId: cid, title: v.t.trim(), order: modulesOf(cid).reduce((a, m) => Math.max(a, m.order || 0), 0) + 1, created: Date.now() }); render();
};
H.renameWeek = async d => { const m = mod(d.id); const v = await ask({ title: 'Rename week', fields: [{ id: 't', label: 'Name', value: m.title, required: true }], ok: 'Save' }); if (v && v.t.trim()) { m.title = v.t.trim(); save('modules', m); render(); } };
H.delWeek = async d => {
  const m = mod(d.id), ls = lecturesIn(m.id), ms = D.materials.filter(x => x.moduleId === m.id);
  if (!await confirmSheet({ title: `Delete “${m.title}”?`, intro: `Only the week itself is removed. Its ${ls.length} lecture${ls.length === 1 ? '' : 's'} and ${ms.length} material${ms.length === 1 ? '' : 's'} stay in the course, just not in a week.`, ok: 'Delete week', danger: true })) return;
  ls.forEach(l => { l.moduleId = null; save('lectures', l); }); ms.forEach(x => { x.moduleId = null; save('materials', x); }); D.tasks.filter(t => t.moduleId === m.id).forEach(t => { t.moduleId = null; save('tasks', t); }); remove('modules', m.id); render();
};
H.courseMenu = d => {
  sheet(`<h3>${esc(course(d.id).name)}</h3><div class="grid2"><button class="btn soft" data-act="renameCourse" data-id="${d.id}">✏️ Rename or describe</button><button class="btn danger" data-act="delCourse" data-id="${d.id}">🗑 Delete this course</button></div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Course options' });
};
H.renameCourse = async d => {
  closeSheet(); const c = course(d.id);
  const v = await ask({ title: 'Edit course', fields: [{ id: 'name', label: 'Name', value: c.name, required: true }, { id: 'code', label: 'Code', value: c.code }, { id: 'desc', label: 'Description', type: 'textarea', rows: 2, value: c.desc }], ok: 'Save' });
  if (!v || !v.name.trim()) return; c.name = v.name.trim(); c.code = v.code.trim().toUpperCase(); c.desc = v.desc.trim(); save('courses', c); render();
};
H.delCourse = async d => {
  closeSheet(); const c = course(d.id), nl = lecturesOf(c.id).length, nm2 = D.materials.filter(m => m.courseId === c.id).length, nn = D.notes.filter(n => n.courseId === c.id).length;
  if (!await confirmSheet({ title: `Delete “${c.name}”?`, intro: `This removes ${nl} lecture${nl === 1 ? '' : 's'} (with audio), ${nm2} material${nm2 === 1 ? '' : 's'}, ${nn} note${nn === 1 ? '' : 's'} and all tasks of this course from this device. A backup first is a good idea. This cannot be undone.`, ok: 'Delete the course', danger: true })) return;
  await deleteCourse(c.id); toast('Course deleted.'); go('home');
};

/* ---------- Course page ---------- */
const CTABS = [['overview', 'Overview'], ['notebooks', '📓 Notebooks'], ['materials', '📎 Materials'], ['tasks', '✅ Tasks & questions'], ['glossary', '📖 Glossary'], ['exam', '🎓 Exam prep'], ['collections', '🗂 Collections'], ['textbook', '📕 Textbook']];
function lecRow(l) {
  return `<div class="li"><a class="grow plain" href="#/l/${l.id}/${l.status === 'ready' && l.segments.length ? 'notes' : 'orig'}" style="min-height:44px"><b>${esc(l.title)} 🌸</b><div class="meta">${dateLabel(l.date)}${l.duration ? ' · ' + fmt(l.duration) : ''}${l.fixture ? ' · 🧪 sample text' : ''}${l.hasAudio ? ' · 🎧' : ''}</div></a>${statusChip(l)}</div>`;
}
function overview(c) {
  const P = courseProgress(c.id), mods = modulesOf(c.id), loose = lecturesOf(c.id).filter(l => !l.moduleId || !mod(l.moduleId));
  const nl = lecturesOf(c.id).length, notes = D.notes.filter(n => n.courseId === c.id && noteText(n).trim().length > 2).length, openT = D.tasks.filter(t => t.courseId === c.id && t.status === 'open' && t.kind !== 'suggested').length, qs = D.tasks.filter(t => t.courseId === c.id && t.kind === 'question' && t.status === 'open').length;
  return `<div class="grid2">
  <div class="paper"><h3>How it's going</h3><p class="small muted">Based on what you've done here, not on grades.</p>
    <div class="frow"><span>Ideas understood</span><div class="bar" role="img" aria-label="${P.understood} of ${P.total}"><i style="width:${P.total ? Math.round(P.understood / P.total * 100) : 0}%"></i></div><span class="small">${P.understood}/${P.total}</span></div>
    <p class="small">${nl} lecture${nl === 1 ? '' : 's'} · ${notes} note${notes === 1 ? '' : 's'} written · ${openT} open task${openT === 1 ? '' : 's'} · ${qs} open question${qs === 1 ? '' : 's'}</p>
    ${P.confusing ? `<a class="btn soft" href="#/c/${c.id}/collections/confusing">😭 ${P.confusing} idea${P.confusing === 1 ? '' : 's'} still fuzzy</a>` : ''}</div>
  <div class="paper"><h3>Start</h3><div class="row"><button class="btn" data-act="startRec" data-c="${c.id}">🎤 Record</button><a class="btn soft" href="#/add?c=${c.id}">📎 Bring a lecture in</a><button class="btn soft" data-act="addMatHere" data-c="${c.id}">📥 Add material</button></div></div></div>
  <div class="sect"><h2>Weeks</h2><button class="btn soft" data-act="addWeek" data-c="${c.id}">＋ Add a week</button></div>
  ${mods.map(m => { const ls = lecturesIn(m.id), ms = D.materials.filter(x => x.status === 'filed' && x.moduleId === m.id); return `<div class="paper"><div class="hdr-row"><h3 style="margin:0">${esc(m.title)}</h3><div class="row" style="gap:4px"><a class="mini" href="#/add?c=${c.id}&m=${m.id}">＋ Lecture</a><button class="mini" data-act="addMatHere" data-c="${c.id}" data-m="${m.id}">＋ Material</button><button class="mini" data-act="renameWeek" data-id="${m.id}" aria-label="Rename ${esc(m.title)}">✏️</button><button class="mini" data-act="delWeek" data-id="${m.id}" aria-label="Delete ${esc(m.title)}">🗑</button></div></div>${ls.length ? ls.map(lecRow).join('') : '<p class="muted small">No lectures yet.</p>'}${ms.length ? `<p class="small muted">📎 ${ms.length} material${ms.length === 1 ? '' : 's'}: ${ms.slice(0, 4).map(x => `<button class="chip" data-act="openRef" data-ref="${refAttr({ type: 'material', materialId: x.id })}">${kindEmoji(x.kind)} ${esc(x.name)}</button>`).join('')}</p>` : ''}</div>`; }).join('') || empty('🗓', 'No weeks yet', 'Weeks keep a course tidy. Add one, or just add a lecture.')}
  ${loose.length ? `<div class="paper"><h3 style="margin:0">Not in a week yet</h3>${loose.map(lecRow).join('')}</div>` : ''}`;
}
function notebooks(c, sub) {
  if (sub) {
    const nbk = NOTEBOOKS.find(k => k.id === sub); if (!nbk) return '<p>Unknown notebook.</p>';
    const head = `<p><a href="#/c/${c.id}/notebooks">← All notebooks</a></p><h2>${nbk.emoji} ${nbk.title}</h2><p class="muted">${nbk.hint}</p>`;
    if (nbk.derived) {
      const items = buildIndex(c.id).filter(d => d.type === 'code');
      return head + (items.length ? items.map(d => `<div>${codeBlock(d.text, { lang: d.lang })}<p class="small">${refChip(d.ref, d.title)}</p></div>`).join('') : empty('💻', 'No code yet', 'Commands and code from lectures, notes and code files appear here by themselves.'));
    }
    const ns = D.notes.filter(n => n.courseId === c.id && n.kind === sub).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0)), qs = sub === 'question' ? D.tasks.filter(t => t.courseId === c.id && t.kind === 'question' && t.status === 'open') : [];
    return head + `<button class="btn soft" data-act="newNote" data-c="${c.id}" data-k="${sub}">＋ New note here</button>` + (ns.map(noteLine).join('') || (qs.length ? '' : empty(nbk.emoji, 'Nothing here yet', nbk.hint))) + (qs.length ? `<h3 class="sect">Open questions</h3>${qs.map(t => `<button class="res" data-act="openRef" data-ref="${refAttr({ type: 'task', id: t.id })}"><span class="src">❓ question${t.ref ? ' · ' + esc(refLabel(t.ref)) : ''}</span><span class="tx">${esc(t.title)}</span></button>`).join('')}` : '');
  }
  return `<div class="grid2">${NOTEBOOKS.map(k => { const n = k.derived ? buildIndex(c.id).filter(d => d.type === 'code').length : D.notes.filter(x => x.courseId === c.id && x.kind === k.id).length + (k.id === 'question' ? D.tasks.filter(t => t.courseId === c.id && t.kind === 'question' && t.status === 'open').length : 0); return `<a class="spine" href="#/c/${c.id}/notebooks/${k.id}"><span style="font-size:1.6rem">${k.emoji}</span><span><b>${k.title}</b><span class="small muted">${k.hint}</span></span><span class="n">${n}</span></a>`; }).join('')}</div>
  <div class="row"><button class="btn soft" data-act="newNote" data-c="${c.id}" data-k="lecture">＋ New note</button></div>`;
}
function materialsTab(c) {
  const all = D.materials.filter(m => m.status === 'filed' && m.courseId === c.id), inbox = D.materials.filter(m => m.status === 'inbox').length;
  const groups = [...modulesOf(c.id).map(m => [m.title, all.filter(x => x.moduleId === m.id)]), ['Not in a week', all.filter(x => !x.moduleId || !mod(x.moduleId))]].filter(g => g[1].length);
  return `<div class="row"><button class="btn soft" data-act="addMatHere" data-c="${c.id}">＋ Add material to this course</button>${inbox ? `<a class="btn ghost" href="#/inbox">📥 ${inbox} in the Inbox</a>` : ''}</div>` + (groups.map(([t, l]) => `<h3 class="sect">${esc(t)}</h3>${materialsBlock(l, { where: true })}`).join('') || empty('📎', 'No materials yet', 'Add slides, PDFs, code or exercise sheets. Anything you put in the Inbox can be filed here.'));
}
function glossaryTab(c) {
  const m = courseConcepts(c.id), list = Object.keys(m).sort((a, b) => nm(a).localeCompare(nm(b)));
  if (!list.length) return empty('📖', 'No terms yet', 'Terms appear here as lectures introduce them.');
  return `<input type="search" id="gf" data-in="glossFind" placeholder="Find a term…" aria-label="Find a term">` + list.map(id => { const k = KB[id], s = m[id], note2 = (D.meta.conceptNotes || {})[id]; return `<div class="paper gl" data-n="${esc(nm(id).toLowerCase())}"><h3>${k.e} ${esc(nm(id))}</h3><p>${prov(k.remote ? 'llm' : 'ai')} ${md(k.simple)}</p><p class="small"><b>Precise:</b> ${md(k.technical)}</p><p class="small muted">Builds on: ${k.pre.map(p => `<span class="chip">${esc(nm(p))}</span>`).join('') || '—'}</p><p class="small">${s.assumed ? '<span class="tag t-out">🌱 assumed, never explained</span>' : refChip({ type: 'seg', lectureId: s.lec.id, seg: s.seg, t: s.t }, `🎤 first heard: ${s.lec.title} · ${fmt(s.t)}`)} <button class="chip" data-act="concept" data-id="${id}">Open page</button></p>${note2 ? `<p class="small you">✍️ ${esc(note2)}</p>` : ''}</div>`; }).join('');
}
HI.glossFind = el => { const q = el.value.trim().toLowerCase(); document.querySelectorAll('#app .gl').forEach(g => { g.hidden = q && !g.dataset.n.includes(q); }); };
const collItem = it => `<div class="paper">${it.type === 'code' ? codeBlock(it.code, { lang: it.lang, small: true }) : `<p class="src small muted">${esc({ transcript: '🎓 Transcript', note: '📝 Note', concept: '🐱 Idea', task: '✅ Task', material: '📎 Material' }[it.type] || it.type)}${it.badge ? ' · ' + esc(it.badge) : ''}</p><p><b>${esc(it.title)}</b></p>${it.excerpt ? `<p class="small">${esc(String(it.excerpt).slice(0, 240))}</p>` : ''}`}<p class="small">${refChip(it.ref, 'Open the source')}</p></div>`;
function collectionsTab(c, sub) {
  if (sub) {
    const col = COLLECTIONS.find(x => x.id === sub); if (!col) return '<p>Unknown collection.</p>'; const items = col.items(c.id);
    return `<p><a href="#/c/${c.id}/collections">← All collections</a></p><h2>${col.emoji} ${col.title}</h2><p class="muted">${col.desc} <span class="small">A view of what you already have, never a copy.</span></p>${items.length ? items.map(collItem).join('') : empty(col.emoji, 'Nothing yet', col.desc)}`;
  }
  return `<p class="muted">Smart collections are filtered views of everything in this course. They update by themselves.</p><div class="grid2">${COLLECTIONS.map(col => `<a class="spine" href="#/c/${c.id}/collections/${col.id}"><span style="font-size:1.6rem">${col.emoji}</span><span><b>${col.title}</b><span class="small muted">${col.desc}</span></span><span class="n">${col.items(c.id).length}</span></a>`).join('')}</div>`;
}
function examTab(c) {
  const sec = (id, t) => { const col = COLLECTIONS.find(x => x.id === id), it = col.items(c.id); return `<h3 class="sect">${t} <span class="small muted">${it.length}</span></h3>${it.length ? it.slice(0, 8).map(collItem).join('') + (it.length > 8 ? `<a href="#/c/${c.id}/collections/${id}">See all ${it.length}</a>` : '') : '<p class="muted">Nothing here yet.</p>'}`; };
  return `<div class="paper"><b>🎓 Exam preparation</b><p class="small muted">Only what you or the lecturer marked. Nothing is guessed about what will be asked.</p><div class="row"><button class="btn soft" data-act="newNote" data-c="${c.id}" data-k="exam">＋ New exam note</button><a class="btn ghost" href="#/c/${c.id}/notebooks/exam">Open Exam Preparation notebook</a></div></div>${sec('exam', 'Marked for the exam')}${sec('emphasis', 'The lecturer stressed')}${sec('confusing', "What I still don't understand")}${sec('important', 'I starred')}`;
}
function textbookTab(c) {
  const m = courseConcepts(c.id), list = Object.keys(m); if (!list.length) return empty('📕', 'Your textbook starts growing after your first lecture', '');
  let n = 0;
  return `<p class="muted">Built from your lectures, ordered from the ground up. Each new lecture adds to it. ${prov('ai')}</p>` + Object.keys(GROUPS).map(g => {
    const xs = list.filter(i => KB[i].g === g).sort((a, b) => m[a].lec.date.localeCompare(m[b].lec.date) || m[a].t - m[b].t); if (!xs.length) return ''; n++;
    return `<div class="paper"><h2>Chapter ${n}</h2><h3>${esc(GROUPS[g])}</h3>${xs.map(id => { const k = KB[id], s = m[id], pn = (D.meta.conceptNotes || {})[id]; return `<div style="margin-top:14px"><h3>${k.e} ${esc(nm(id))}</h3><p>${md(k.why)}</p><p>${md(k.kitten)}</p><p class="muted">${md(k.technical)}</p>${pn ? `<p class="you">✍️ ${esc(pn)}</p>` : ''}<p class="small">${s.assumed ? '' : refChip({ type: 'seg', lectureId: s.lec.id, seg: s.seg, t: s.t }, `🎓 From your course: ${s.lec.title} · ${fmt(s.t)}`)} <button class="chip" data-act="concept" data-id="${id}">Open page</button></p></div>`; }).join('')}</div>`;
  }).join('') + `<p class="small muted">Chapters follow the built-in dictionary. Concepts written by the AI for your lectures appear under their own headings.</p>`;
}
register('course', {
  title: V => { const c = course(V.id); return c ? c.name : 'Course'; },
  html(V) {
    const c = course(V.id); if (!c) return empty('🌱', "That course isn't here", 'It may have been deleted.', '<a class="btn" href="#/">Home</a>');
    const tab = CTABS.some(t => t[0] === V.tab) ? V.tab : 'overview', sem = semester(c.semesterId);
    if (D.meta.cur !== c.id) { D.meta.cur = c.id; saveMeta(); }
    const body = tab === 'overview' ? overview(c) : tab === 'notebooks' ? notebooks(c, V.sub) : tab === 'materials' ? materialsTab(c) : tab === 'tasks' ? tasksBlock({ courseId: c.id }) : tab === 'glossary' ? glossaryTab(c) : tab === 'exam' ? examTab(c) : tab === 'collections' ? collectionsTab(c, V.sub) : textbookTab(c);
    return `${crumbs([[D.meta.ws.name, '#/'], [sem ? sem.name : 'Semester', '#/'], [c.code || c.name, '']])}
    <div class="hdr-row"><div><h1>📕 ${esc(c.name)}</h1>${c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ''}</div><button class="btn soft" data-act="courseMenu" data-id="${c.id}">⋯ Manage</button></div>
    <form class="big-search" role="search" onsubmit="location.hash='#/s/'+encodeURIComponent(this.q.value);return false"><input type="search" name="q" placeholder="Search this whole course…" aria-label="Search this course"><button class="btn" type="submit">Search</button></form>
    <div class="ltabs" role="navigation" aria-label="Course sections">${CTABS.map(([k, l]) => `<a class="pill${tab === k ? ' on' : ''}" href="#/c/${c.id}${k === 'overview' ? '' : '/' + k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</div>${body}`;
  }
});

/* ---------- Concept page ---------- */
openers.concept = r => { closeSheet(); go('concept', { id: r.id }); };
register('concept', {
  title: V => nm(V.id),
  html(V) {
    const id = V.id, k = KB[id]; if (!k) return empty('🌱', "I don't know that idea", '', '<a class="btn" href="#/">Home</a>');
    const kids = ids().filter(x => KB[x].pre.includes(id)), anc = [...ancestors(id)], cid = D.meta.cur, src = conceptSources(id, null), back = V.from && lec(V.from);
    const cs = course(cid);
    return `${crumbs([['Home', '#/'], ...(back ? [[back.title, '#/l/' + back.id + '/kitten']] : cs ? [[cs.code || cs.name, '#/c/' + cs.id + '/glossary']] : []), [k.name, '']])}${card(null, id)}
    <div class="paper"><h3>🧗 The ladder underneath</h3><p>${anc.length ? anc.map(a => `<button class="chip" data-act="concept" data-id="${a}">${esc(nm(a))}</button>`).join('') : 'Nothing underneath. This is a starting point.'}</p><h3>🌿 What builds on it</h3><p>${kids.map(a => `<button class="chip" data-act="concept" data-id="${a}">${esc(nm(a))}</button>`).join('') || '—'}</p>
    <div class="frow"><span>Familiarity</span><div class="bar" role="img" aria-label="Familiarity ${fam(id)} percent"><i style="width:${fam(id)}%"></i></div><span class="small">${fam(id)}%</span></div></div>
    <div class="paper"><h3>📍 Where this came up</h3>${src.segs.length ? `<p class="small">In lectures:</p>${src.segs.slice(0, 8).map(s => `<p class="small">${refChip({ type: 'seg', lectureId: s.L.id, seg: s.i, t: s.t }, `${s.L.title} · ${fmt(s.t)}`)} ${esc(s.text.slice(0, 120))}</p>`).join('')}` : '<p class="muted small">Not mentioned in a lecture yet.</p>'}
    ${src.pages.length ? `<p class="small">In your materials: ${src.pages.slice(0, 8).map(p => refChip({ type: 'material', materialId: p.m.id, page: p.page }, `${p.m.name} · p.${p.page}`)).join(' ')}</p>` : ''}
    ${src.notes.length ? `<p class="small">In your notes: ${src.notes.slice(0, 6).map(n => `<a class="chip" href="#/n/${n.id}">📝 ${esc(n.title || 'Untitled')}</a>`).join(' ')}</p>` : ''}</div>
    <div class="paper"><h3>✍️ My own words</h3><textarea id="cnote" data-in="conceptNote" data-id="${esc(id)}" rows="3" placeholder="How would you explain this to a friend?" aria-label="My own explanation">${esc((D.meta.conceptNotes || {})[id] || '')}</textarea><p class="small muted">Saved as you type. ${prov('you')}</p></div>`;
  }
});
HI.conceptNote = el => { D.meta.conceptNotes = D.meta.conceptNotes || {}; if (el.value.trim()) D.meta.conceptNotes[el.dataset.id] = el.value; else delete D.meta.conceptNotes[el.dataset.id]; saveMeta(); };

// Materials: adding files, reading their text honestly, the Inbox with suggested (never silent) filing, and the viewer.
import { D, uid, add, save, remove, mat, course, mod, lec, modulesOf, lecturesIn, lecturesOf, putFile, getFile, deleteMaterial } from './store.js';
import { esc, kindOf, suggestPlacement, detectLang, highlight, normTag, fmt } from './lib.js';
import { KB, nm } from './kb.js';
import { $, H, HC, V, register, go, ask, confirmSheet, sheet, closeSheet, toast, nav, render, openers, refAttr } from './core.js';
import { crumbs, empty, kindEmoji, kindLabel, sizeLabel, ago, dateLabel, refChip } from './ui.js';

const TEXTY = new Set(['code', 'text', 'data']);
const MAX = 120e6;
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();

/* ---------- honest text-extraction status ---------- */
export function statusOf(m) {
  const e = m.extract || {};
  if (e.state === 'pending') return ['⏳', 'Reading the text…'];
  if (e.state === 'done') return ['✓', e.pages.length > 1 ? `Text readable (${e.pages.length} ${m.kind === 'slides' ? 'slides' : 'pages'})` : 'Text readable'];
  if (e.state === 'scanned') return ['⚠', 'No readable text. This looks like scanned images, and this version has no OCR.'];
  if (e.state === 'unavailable') return ['⚠', 'Text not read: ' + (e.reason || 'not supported here')];
  if (e.state === 'failed') return ['⚠', "Couldn't read the text" + (e.reason ? ': ' + e.reason : '')];
  return ['ℹ', e.reason || 'Kept as it is. Its content is not searched.'];
}
async function extract(m, blob) {
  const set = (state, o = {}) => { m.extract = Object.assign({ state, pages: [] }, o); save('materials', m); };
  const ext = extOf(m.name), a = nav.api.extract || {};
  try {
    if (TEXTY.has(m.kind) || m.kind === 'exercise' && (ext === 'txt' || ext === 'md')) { const t = (await blob.text()).slice(0, 2e6); return set('done', { pages: [{ n: 1, text: t }], via: 'browser' }); }
    if (m.kind === 'pdf' || (m.kind === 'exercise' && ext === 'pdf')) {
      if (!a.pdf) return set('unavailable', { reason: "this copy of the app can't read PDF text (the server needs pdftotext). The file is kept and you can open it." });
      set('pending'); render();
      const r = await fetch('/api/extract?kind=pdf', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: blob });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'server ' + r.status);
      const j = await r.json(); return j.scanned || !j.pages.some(p => p.text) ? set('scanned', { via: j.via }) : set('done', { pages: j.pages, via: j.via });
    }
    if (m.kind === 'slides') {
      if (ext !== 'pptx') return set('unavailable', { reason: `only .pptx slides can be read, not .${ext}. Export them as PDF or PPTX.` });
      if (!a.pptx) return set('unavailable', { reason: "this copy of the app can't read slide text (the server needs unzip)." });
      set('pending'); render();
      const r = await fetch('/api/extract?kind=pptx', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'server ' + r.status);
      const j = await r.json(); return j.pages.some(p => p.text) ? set('done', { pages: j.pages, via: j.via }) : set('scanned', { via: j.via, reason: 'The slides contain no text, only pictures.' });
    }
    if (m.kind === 'image') return set('none', { reason: 'Images are kept as they are. This version does not read text inside pictures.' });
    if (m.kind === 'audio') return set('none', { reason: 'Audio is kept as it is. To get text from a recording, attach it to a lecture.' });
    if (m.kind === 'doc') return set('unavailable', { reason: 'Word documents are kept but their text is not read yet.' });
    return set('none', { reason: 'This kind of file is kept as it is.' });
  } catch (e) { set('failed', { reason: e.message }); }
}

/* ---------- adding ---------- */
export async function ingest(files, ctx) {
  let n = 0;
  for (const f of files) {
    if (f.size > MAX) { toast(`${f.name} is larger than ${Math.round(MAX / 1e6)} MB, so I left it out.`); continue; }
    const kind = kindOf(f.name, f.type), m = { id: uid('m'), name: f.name, kind, mime: f.type, size: f.size, status: 'inbox', added: Date.now(), tags: [], hasBlob: true, extract: { state: 'pending', pages: [] } };
    try { await putFile(m.id, f); } catch (e) { toast(`I couldn't store ${f.name}: ${e.message}`); continue; }
    add('materials', m); n++;
    await extract(m, f);
    if (ctx && ctx.courseId) { Object.assign(m, { status: 'filed', courseId: ctx.courseId, moduleId: ctx.moduleId || null, lectureId: ctx.lectureId || null, confirmedAt: Date.now() }); if (kind !== 'other') m.tags = [kind]; }
    else m.suggestion = suggestPlacement(m);
    save('materials', m); render();
  }
  return n;
}
const pick = (multiple, accept, capture) => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.multiple = multiple; if (accept) i.accept = accept; if (capture) i.setAttribute('capture', 'environment'); i.onchange = () => res([...i.files]); i.click(); });
H.pickFiles = async () => { const fs = await pick(true); if (fs.length) { const n = await ingest(fs); if (n) toast(`${n} file${n === 1 ? '' : 's'} added to your Inbox.`); } };
H.takePhoto = async () => { const fs = await pick(false, 'image/*', true); if (fs.length) { await ingest(fs); toast('Photo added to your Inbox.'); } };
H.addMatHere = async d => { const fs = await pick(true); if (fs.length) { const n = await ingest(fs, { courseId: d.c, moduleId: d.m, lectureId: d.l }); if (n) toast(`${n} file${n === 1 ? '' : 's'} added here.`); } };
H.addLink = async () => {
  const v = await ask({ title: 'Save a link', intro: 'Only the link is saved. I do not fetch the page, so its text is not searched.', fields: [{ id: 'url', label: 'Address', ph: 'https://…', required: true }, { id: 'name', label: 'Name (optional)' }], ok: 'Save to Inbox' });
  if (!v || !v.url.trim()) return; let u = v.url.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const m = { id: uid('m'), name: v.name.trim() || u.replace(/^https?:\/\//, '').slice(0, 60), kind: 'url', url: u, status: 'inbox', added: Date.now(), tags: [], hasBlob: false, extract: { state: 'none', pages: [], reason: 'Only the link is saved.' } };
  m.suggestion = suggestPlacement(m); add('materials', m); render(); toast('Link saved to your Inbox.');
};
H.addTextNote = async () => {
  const v = await ask({ title: 'Quick note for the Inbox', fields: [{ id: 'name', label: 'Title', required: true }, { id: 'text', label: 'Text', type: 'textarea', rows: 6 }], ok: 'Save to Inbox' });
  if (!v || !v.name.trim()) return;
  const m = { id: uid('m'), name: v.name.trim(), kind: 'text', size: v.text.length, status: 'inbox', added: Date.now(), tags: [], hasBlob: false, extract: { state: 'done', pages: [{ n: 1, text: v.text }], via: 'typed' } };
  m.suggestion = suggestPlacement(m); add('materials', m); render(); toast('Saved to your Inbox.');
};

/* ---------- filing: suggestion -> confirm / change / keep ---------- */
const place = (m, p) => { m.courseId = p.courseId; m.moduleId = p.moduleId || null; m.lectureId = p.lectureId || null; if (p.kind) m.kind = p.kind; m.tags = [...new Set([...(m.tags || []), ...(p.tags || [])])]; m.status = 'filed'; m.confirmedAt = Date.now(); delete m.suggestion; save('materials', m); };
H.sugConfirm = d => {
  const m = mat(d.id), s = m.suggestion; if (!s || !s.courseId) return; place(m, s); render();
  const t = $('#toast'); if (t) { t.innerHTML = `<div class="toast" role="status">Filed. It now shows up in search. <button class="link" data-act="openRef" data-ref="${esc(JSON.stringify({ type: 'material', materialId: m.id }))}">View</button></div>`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, 6500); }
};
H.sugKeep = d => { const m = mat(d.id); if (m.suggestion) m.suggestion.dismissed = true; save('materials', m); render(); toast('Okay, it stays in the Inbox.'); };
H.matRemove = async d => { closeSheet(); const m = mat(d.id); if (!m) return; if (!await confirmSheet({ title: `Remove “${m.name}”?`, intro: 'The file and its extracted text are deleted from this device. This cannot be undone.', ok: 'Remove', danger: true })) return; await deleteMaterial(m.id); render(); toast('Removed.'); };
const optsC = sel => D.courses.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.code ? c.code + ' · ' : '')}${esc(c.name)}</option>`).join('');
const optsM = (cid, sel) => `<option value="">Not in a week</option>` + modulesOf(cid).map(m => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>${esc(m.title)}</option>`).join('');
const optsL = (cid, mid, sel) => `<option value="">The whole week / not a specific lecture</option>` + lecturesOf(cid).filter(l => !mid || l.moduleId === mid).map(l => `<option value="${esc(l.id)}"${l.id === sel ? ' selected' : ''}>${esc(l.title)}</option>`).join('');
const KINDS = ['pdf', 'slides', 'exercise', 'code', 'text', 'image', 'audio', 'data', 'doc', 'url', 'other'];
H.matPlace = d => {
  const m = mat(d.id), s = m.suggestion || {}, cid = m.courseId || s.courseId || D.meta.cur || (D.courses[0] && D.courses[0].id), mid = m.moduleId || s.moduleId || '', lid = m.lectureId || s.lectureId || '';
  if (!cid) return toast('Make a course first.');
  closeSheet();
  sheet(`<h3>Where does this go?</h3><p class="muted">${esc(m.name)}</p><form id="placeform">
  <label class="fld"><span>Course</span><select id="p-course" data-ch="placeCourse">${optsC(cid)}</select></label>
  <label class="fld"><span>Week / module</span><select id="p-mod" data-ch="placeMod">${optsM(cid, mid)}</select></label>
  <label class="fld"><span>Lecture</span><select id="p-lec">${optsL(cid, mid, lid)}</select></label>
  <label class="fld"><span>What is it?</span><select id="p-kind">${KINDS.map(k => `<option value="${k}"${k === (m.kind) ? ' selected' : ''}>${kindEmoji(k)} ${kindLabel(k)}</option>`).join('')}</select></label>
  <label class="fld"><span>Tags (comma separated)</span><input id="p-tags" type="text" value="${esc((m.tags || []).concat(s.tags || []).filter((x, i, a) => a.indexOf(x) === i).join(', '))}"></label>
  <div class="row" style="margin-top:12px"><button class="btn" type="submit">File it here</button><button class="btn ghost" type="button" data-act="closeSheet">Cancel</button></div></form>`, { label: 'File this material' });
  $('#placeform').onsubmit = e => {
    e.preventDefault();
    place(m, { courseId: $('#p-course').value, moduleId: $('#p-mod').value, lectureId: $('#p-lec').value, kind: $('#p-kind').value, tags: $('#p-tags').value.split(',').map(normTag).filter(Boolean) });
    closeSheet(); render(); toast('Filed.');
  };
};
HC.placeCourse = el => { $('#p-mod').innerHTML = optsM(el.value, ''); $('#p-lec').innerHTML = optsL(el.value, '', ''); };
HC.placeMod = el => { $('#p-lec').innerHTML = optsL($('#p-course').value, el.value, ''); };
H.matUnfile = d => { const m = mat(d.id); m.status = 'inbox'; m.suggestion = suggestPlacement(m); save('materials', m); closeSheet(); render(); toast('Moved back to the Inbox.'); };
H.matRename = async d => { closeSheet(); const m = mat(d.id); const v = await ask({ title: 'Rename', fields: [{ id: 'name', label: 'Name', value: m.name, required: true }], ok: 'Save' }); if (!v || !v.name.trim()) return; m.name = v.name.trim(); save('materials', m); render(); };
H.matTags = async d => { closeSheet(); const m = mat(d.id); const v = await ask({ title: 'Tags', intro: 'Separate with commas, for example <code>exam, mpi</code>.', fields: [{ id: 'tags', label: 'Tags', value: (m.tags || []).join(', ') }], ok: 'Save' }); if (!v) return; m.tags = v.tags.split(',').map(normTag).filter(Boolean); save('materials', m); render(); };
H.matDownload = async d => { const m = mat(d.id), b = await getFile(m.id); if (!b) return toast('The file is not on this device any more.'); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = m.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
H.matRetry = async d => { const m = mat(d.id), b = await getFile(m.id); if (!b) return toast('The file is not on this device any more.'); m.extract = { state: 'pending', pages: [] }; render(); await extract(m, b); if (m.status === 'inbox') m.suggestion = suggestPlacement(m); save('materials', m); render(); };

/* ---------- lists ---------- */
export const whereOf = m => {
  if (m.status !== 'filed') return 'In the Inbox';
  const c = course(m.courseId), mo = m.moduleId && mod(m.moduleId), l = m.lectureId && lec(m.lectureId);
  return [c && (c.code || c.name), mo && mo.title.split('—')[0].trim(), l && l.title].filter(Boolean).join(' › ') || 'Filed';
};
export function matRow(m, { where = true } = {}) {
  const [ic, st] = statusOf(m);
  return `<div class="li"><div class="grow"><button class="plain" data-act="matOpen" data-id="${m.id}" style="font-weight:700;min-height:44px">${kindEmoji(m.kind)} ${esc(m.name)}</button>
  <div class="meta">${kindLabel(m.kind)}${m.size ? ' · ' + sizeLabel(m.size) : ''}${where ? ' · ' + esc(whereOf(m)) : ''}</div><div class="meta" title="${esc(st)}">${ic} ${esc(st)}${m.extract && m.extract.state === 'failed' ? ` <button class="link" data-act="matRetry" data-id="${m.id}">Try again</button>` : ''}</div>${(m.tags || []).length ? `<div class="tagrow">${m.tags.map(t => `<a class="chip" href="#/s/${encodeURIComponent('#' + t)}">#${esc(t)}</a>`).join('')}</div>` : ''}</div>
  <div class="row"><button class="mini" data-act="matOpen" data-id="${m.id}">Open</button><button class="mini" data-act="matManage" data-id="${m.id}" aria-label="More for ${esc(m.name)}">⋯</button></div></div>`;
}
export function materialsBlock(list, o = {}) { return list.length ? `<div class="list">${list.sort((a, b) => (b.added || 0) - (a.added || 0)).map(m => matRow(m, { where: o.where })).join('')}</div>` : `<p class="muted">${o.empty || 'Nothing here yet.'}</p>`; }
H.matManage = d => {
  const m = mat(d.id);
  sheet(`<h3>${kindEmoji(m.kind)} ${esc(m.name)}</h3><div class="grid2"><button class="btn soft" data-act="matOpen" data-id="${m.id}">Open</button><button class="btn soft" data-act="matPlace" data-id="${m.id}">📁 ${m.status === 'filed' ? 'Move' : 'File it…'}</button><button class="btn soft" data-act="matRename" data-id="${m.id}">✏️ Rename</button><button class="btn soft" data-act="matTags" data-id="${m.id}">🏷 Tags</button>${m.hasBlob ? `<button class="btn soft" data-act="matDownload" data-id="${m.id}">⬇️ Download</button>` : ''}${m.status === 'filed' ? `<button class="btn soft" data-act="matUnfile" data-id="${m.id}">📥 Back to Inbox</button>` : ''}<button class="btn danger" data-act="matRemove" data-id="${m.id}">🗑 Remove</button></div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Material options' });
};

/* ---------- Inbox ---------- */
function sugHTML(m) {
  const s = m.suggestion; if (m.extract && m.extract.state === 'pending') return `<div class="sug">⏳ Reading the file…</div>`;
  if (!s || s.dismissed) return `<div class="row"><button class="btn soft" data-act="matPlace" data-id="${m.id}">📁 File it…</button>${s && s.dismissed ? '<span class="small muted">You chose to keep it here for now.</span>' : ''}</div>`;
  if (!s.courseId) return `<div class="sug"><b>I couldn't tell where this goes.</b> That is okay. Nothing is guessed.<div class="row" style="margin-top:8px"><button class="btn soft" data-act="matPlace" data-id="${m.id}">📁 Choose where…</button></div></div>`;
  const c = course(s.courseId), mo = s.moduleId && mod(s.moduleId), l = s.lectureId && lec(s.lectureId);
  return `<div class="sug" role="group" aria-label="Suggested place"><b>💡 I think this belongs in:</b><br>${esc([c && (c.code || c.name), mo && mo.title, l && l.title].filter(Boolean).join(' › '))} <span class="tag t-out">${s.confidence === 'high' ? 'fairly sure' : s.confidence === 'medium' ? 'a bit unsure' : 'just a guess'}</span>
  <ul>${s.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>${s.concepts && s.concepts.length ? `<p class="small">Ideas it mentions: ${s.concepts.slice(0, 5).map(i => `<span class="chip">${esc(nm(i))}</span>`).join(' ')}</p>` : ''}
  <p class="small muted">Nothing moves until you say so.</p><div class="row"><button class="btn sage" data-act="sugConfirm" data-id="${m.id}">✓ Yes, file it there</button><button class="btn soft" data-act="matPlace" data-id="${m.id}">Change…</button><button class="btn ghost" data-act="sugKeep" data-id="${m.id}">Keep in Inbox</button></div></div>`;
}
register('inbox', {
  title: () => 'Inbox',
  html() {
    const inbox = D.materials.filter(m => m.status === 'inbox').sort((a, b) => (b.added || 0) - (a.added || 0)), filed = D.materials.filter(m => m.status === 'filed').sort((a, b) => (b.confirmedAt || 0) - (a.confirmedAt || 0)).slice(0, 5);
    return `${crumbs([['Home', '#/'], ['Inbox', '']])}<h1>📥 Inbox</h1><p class="muted">Throw things in without thinking about where they go. I'll suggest a place; you decide.</p>
    <div class="drop" id="drop" role="group" aria-label="Add files"><p><b>Drop files here</b></p><p class="small muted">PDF, slides, code, text, images, audio. Everything stays on this device.</p>
    <div class="row" style="justify-content:center"><button class="btn" data-act="pickFiles">📎 Choose files</button><button class="btn soft" data-act="takePhoto">📷 Take a photo</button><button class="btn soft" data-act="addLink">🔗 Add a link</button><button class="btn soft" data-act="addTextNote">📝 Quick note</button></div></div>
    ${inbox.length ? inbox.map(m => `<div class="paper">${matRow(m, { where: false })}${sugHTML(m)}</div>`).join('') : empty('🌸', 'Inbox zero', 'Everything is filed. New files you add will wait here until you confirm where they belong.')}
    ${filed.length ? `<h3 class="sect">Recently filed</h3>${materialsBlock(filed, { where: true })}` : ''}`;
  },
  after() {
    const dz = $('#drop'); if (!dz) return;
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', async e => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) { const n = await ingest(fs); if (n) toast(`${n} file${n === 1 ? '' : 's'} added to your Inbox.`); } });
  }
});

/* ---------- viewer ---------- */
let curUrl = null;
H.matOpen = d => { closeSheet(); viewMat(mat(d.id), 1); };
H.matPage = d => viewMat(mat(d.id), +d.p);
openers.material = r => { const m = mat(r.materialId); if (!m) return toast('That material was removed.'); closeSheet(); viewMat(m, r.page || 1); };
async function viewMat(m, page) {
  if (!m) return;
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  const blob = m.hasBlob ? await getFile(m.id) : null; if (blob) curUrl = URL.createObjectURL(blob);
  const pages = (m.extract && m.extract.pages) || [], N = pages.length, pg = Math.min(Math.max(1, page || 1), Math.max(1, N)), cur = pages.find(p => p.n === pg), [ic, st] = statusOf(m);
  let body = '';
  if (m.kind === 'url') body = `<p><a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.url)}</a></p><p class="small muted">Opens in a new tab. The page text is not saved here.</p>`;
  else if (!blob && !pages.length) body = `<p class="muted">The file isn't stored on this device any more.</p>`;
  else if ((m.kind === 'pdf' || (m.kind === 'exercise' && extOf(m.name) === 'pdf')) && blob) body = `<iframe src="${curUrl}#page=${pg}" title="${esc(m.name)}, page ${pg}"></iframe><p class="small"><a href="${curUrl}#page=${pg}" target="_blank" rel="noopener">Open in a new tab</a></p>`;
  else if (m.kind === 'image' && blob) body = `<img src="${curUrl}" alt="${esc(m.name)}">`;
  else if (m.kind === 'audio' && blob) body = `<audio controls src="${curUrl}" style="width:100%"></audio>`;
  if (TEXTY.has(m.kind) || (m.extract && m.extract.via === 'typed') || (m.kind === 'exercise' && N === 1 && m.extract.via === 'browser')) {
    const t = cur ? cur.text : '', lang = m.kind === 'code' ? detectLang(t, ({ c: 'c', h: 'c', sh: 'bash', slurm: 'slurm', job: 'slurm' })[extOf(m.name)]) : null;
    body += `<pre class="pagetext" tabindex="0" style="max-height:55vh;white-space:pre">${t.split('\n').map((ln, i) => `<span class="small muted">${String(i + 1).padStart(3, ' ')}  </span>${lang ? highlight(ln, lang) : esc(ln)}`).join('\n')}</pre>`;
  } else if (N) {
    body += `<div class="pager"><button class="mini" data-act="matPage" data-id="${m.id}" data-p="${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>◀ Previous</button><b>${m.kind === 'slides' ? 'Slide' : 'Page'} ${pg} of ${N}</b><button class="mini" data-act="matPage" data-id="${m.id}" data-p="${pg + 1}" ${pg >= N ? 'disabled' : ''}>Next ▶</button></div>
    <p class="small muted">Text read from this ${m.kind === 'slides' ? 'slide' : 'page'}:</p><div class="pagetext" tabindex="0" id="pagetext">${cur && cur.text ? esc(cur.text) : '<span class="muted">No text on this page.</span>'}</div>`;
  }
  sheet(`<div class="viewer"><div class="viewer-h"><h3 style="margin:0">${kindEmoji(m.kind)} ${esc(m.name)}</h3><button class="btn ghost" data-act="closeSheet">Close</button></div>
  <p class="small muted">${kindLabel(m.kind)}${m.size ? ' · ' + sizeLabel(m.size) : ''} · ${esc(whereOf(m))}</p><p class="small muted">${ic} ${esc(st)}</p>${body}
  <div class="row" style="margin-top:12px"><button class="btn soft" data-act="matManage" data-id="${m.id}">⋯ Manage</button></div></div>`, { wide: true, label: m.name });
}

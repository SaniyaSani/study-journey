// My Notes: a block editor with autosave, undo/redo, revision history and links to anything in the course.
import { D, uid, save, remove, note, lec, course, putFile, getFile, delFile, modulesOf, lecturesOf, onStatus, status } from './store.js';
import { esc, md, fmt, stripTags, blockText, noteText, refLabel, refIcon, refKey, search, excerpt, normTag, NOTEBOOKS, detectLang } from './lib.js';
import { $, H, HI, HC, V, register, go, ask, confirmSheet, sheet, closeSheet, toast, render, openers, refAttr } from './core.js';
import { crumbs, tagChips, empty, prov, refChip, PROV } from './ui.js';
import { newNote, mkBlock } from './actions.js';

let ED = null;
const KINDS = NOTEBOOKS.filter(n => !n.derived);
const kindTitle = k => (KINDS.find(x => x.id === k) || { title: 'Notes' }).title;

/* ---------- sanitising: only simple inline formatting survives ---------- */
const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'CODE', 'MARK', 'A', 'BR']);
export function sanitize(html) {
  const t = document.createElement('template'); t.innerHTML = html;
  (function walk(node) {
    [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) { c.remove(); return; }
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(c.tagName)) { c.remove(); return; }
      walk(c);
      if (!OK.has(c.tagName)) { const f = document.createDocumentFragment(); while (c.firstChild) f.appendChild(c.firstChild); if (['DIV', 'P', 'LI'].includes(c.tagName)) f.appendChild(document.createElement('br')); c.replaceWith(f); }
      else { const href = c.tagName === 'A' ? c.getAttribute('href') : null;[...c.attributes].forEach(a => c.removeAttribute(a.name)); if (href && /^(https?:|mailto:|#)/i.test(href)) { c.setAttribute('href', href); c.setAttribute('rel', 'noopener noreferrer'); c.setAttribute('target', '_blank'); } else if (c.tagName === 'A') { const f = document.createDocumentFragment(); while (c.firstChild) f.appendChild(c.firstChild); c.replaceWith(f); } }
    });
  })(t.content);
  return t.innerHTML.replace(/(<br>)+$/, '');
}

/* ---------- history: undo / redo and saved versions ---------- */
const snap = n => JSON.stringify({ title: n.title, blocks: n.blocks });
const cur = () => note(ED && ED.id);
function pushUndo() { const n = cur(); if (!n) return; const s = snap(n); if (ED.undo[ED.undo.length - 1] !== s) { ED.undo.push(s); if (ED.undo.length > 120) ED.undo.shift(); } ED.redo = []; }
function restore(s) { const n = cur(), o = JSON.parse(s); n.title = o.title; n.blocks = o.blocks; save('notes', n); const t = $('#ntitle'); if (t) t.value = n.title; renderBlocks(); }
H.edUndo = () => { if (!ED || !ED.undo.length) return toast('Nothing to undo.'); const n = cur(); ED.redo.push(snap(n)); restore(ED.undo.pop()); };
H.edRedo = () => { if (!ED || !ED.redo.length) return toast('Nothing to redo.'); const n = cur(); ED.undo.push(snap(n)); restore(ED.redo.pop()); };
function touch() {
  const n = cur(); if (!n) return; save('notes', n);
  const last = n.rev[n.rev.length - 1];
  if (!last || Date.now() - last.at > 300000) { n.rev.push({ at: Date.now(), title: n.title, blocks: JSON.parse(JSON.stringify(n.blocks)) }); if (n.rev.length > 20) n.rev.shift(); }
}
H.edVersion = () => { const n = cur(); n.rev.push({ at: Date.now(), title: n.title, blocks: JSON.parse(JSON.stringify(n.blocks)), manual: true }); if (n.rev.length > 20) n.rev.shift(); save('notes', n); toast('Version saved.'); };
H.edHistory = () => {
  const n = cur(); const rs = [...n.rev].reverse();
  sheet(`<h3>🕘 Earlier versions</h3><p class="muted">Pick a version to bring it back. You can undo this afterwards.</p>${rs.length ? rs.map((r, i) => `<button class="rev" data-act="edRestore" data-i="${n.rev.length - 1 - i}">${new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.manual ? ' · saved by you' : ''} · ${r.blocks.length} blocks<br><span class="small muted">${esc(stripTags(r.blocks.map(blockText).join(' ')).slice(0, 90))}</span></button>`).join('') : '<p>No earlier versions yet. They are saved as you write.</p>'}<div class="row"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Version history' });
};
H.edRestore = d => { const n = cur(), r = n.rev[+d.i]; if (!r) return; pushUndo(); n.title = r.title; n.blocks = JSON.parse(JSON.stringify(r.blocks)); save('notes', n); closeSheet(); $('#ntitle').value = n.title; renderBlocks(); toast('Version restored. Use Undo to go back.'); };

/* ---------- block rendering ---------- */
const PH = { h2: 'Heading', h3: 'Subheading', ul: 'List item', todo: 'To do', quote: 'Quote', callout: 'Callout' };
const LANGS = ['auto', 'bash', 'c', 'slurm', 'text'];
function blockHTML(b, i, last) {
  const ctl = `<span class="bctl"><button class="bx" data-act="blkUp" data-bid="${b.id}" aria-label="Move block up">↑</button><button class="bx" data-act="blkDown" data-bid="${b.id}" aria-label="Move block down">↓</button><button class="bx" data-act="blkDel" data-bid="${b.id}" aria-label="Delete block">×</button></span>`;
  const tag = b.prov && PROV[b.prov] ? `<div class="small">${prov(b.prov)}</div>` : '';
  if (b.type === 'code') return `<div class="blk" data-type="code" data-bid="${b.id}"><div class="bw"><div class="row" style="gap:6px"><select class="lang" data-ch="blkLang" aria-label="Language">${LANGS.map(l => `<option${l === (b.lang || 'auto') ? ' selected' : ''}>${l}</option>`).join('')}</select><button class="copy" data-act="blkCopy" data-bid="${b.id}">Copy</button></div><textarea class="codeta" data-in="blkCode" rows="${Math.max(3, (b.text || '').split('\n').length + 1)}" spellcheck="false" aria-label="Code">${esc(b.text || '')}</textarea></div>${ctl}</div>`;
  if (b.type === 'img') return `<div class="blk" data-type="img" data-bid="${b.id}"><div class="bw" tabindex="0"><img data-fid="${esc(b.fileId)}" alt="${esc(b.alt || 'Image')}"><div class="small muted">${esc(b.alt || '')}</div></div>${ctl}</div>`;
  if (b.type === 'ref') {
    const r = b.ref, label = refLabel(r);
    return `<div class="blk" data-type="ref" data-bid="${b.id}"><div class="refblock" tabindex="0"><b>${refIcon(r)} ${esc(label)}</b>${b.quote ? `<q>${esc(b.quote.slice(0, 400))}${b.quote.length > 400 ? '…' : ''}</q>` : ''}<div class="row" style="gap:6px"><button class="mini" data-act="openRef" data-ref="${refAttr(r)}">Open the source</button>${r.type === 'seg' || r.type === 'audio' ? `<button class="mini" data-act="blkPlay" data-bid="${b.id}">▶ Play</button>` : ''}</div></div>${ctl}</div>`;
  }
  const ph = PH[b.type] || (last ? 'Type here…  (# heading · - list · [] to-do · > quote)' : '');
  const ce = `<div class="ce" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(PH[b.type] || 'Paragraph')}" data-in="ceInput" data-ph="${esc(ph)}">${b.html || ''}</div>`;
  return `<div class="blk" data-type="${b.type}" data-bid="${b.id}">${b.type === 'todo' ? `<input type="checkbox" class="chk" data-ch="blkCheck" ${b.checked ? 'checked' : ''} aria-label="Done">` : ''}<div class="bw">${tag}${ce}</div>${ctl}</div>`;
}
const blocksHTML = n => n.blocks.map((b, i) => blockHTML(b, i, i === n.blocks.length - 1)).join('') + `<button class="add-end" data-act="blkAddEnd" aria-label="Add a paragraph at the end">＋ Add a paragraph</button>`;
const urls = {};
async function loadImgs() {
  for (const im of document.querySelectorAll('#blocks img[data-fid]')) {
    const id = im.dataset.fid; if (!urls[id]) { const b = await getFile(id); if (b) urls[id] = URL.createObjectURL(b); }
    if (urls[id]) im.src = urls[id]; else im.alt = 'This image is not on this device any more.';
  }
}
function renderBlocks(focus) {
  const n = cur(), host = $('#blocks'); if (!n || !host) return;
  host.innerHTML = blocksHTML(n); loadImgs();
  if (focus) focusBlock(focus.bid, focus.at);
}
function focusBlock(bid, at = 'end') {
  const el = document.querySelector(`#blocks [data-bid="${bid}"] .ce, #blocks [data-bid="${bid}"] textarea`); if (!el) return;
  el.focus(); if (el.tagName === 'TEXTAREA') return;
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(at === 'start'); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
const blk = el => { const w = el.closest('.blk'); const n = cur(); return w && n ? { b: n.blocks.find(x => x.id === w.dataset.bid), w, n } : {}; };

/* ---------- typing ---------- */
const SHORT = [[/^#&nbsp;$|^# $/, 'h2'], [/^##&nbsp;$|^## $/, 'h3'], [/^[-*]&nbsp;$|^[-*] $/, 'ul'], [/^\[\]&nbsp;$|^\[\] $/, 'todo'], [/^&gt;&nbsp;$|^> $/, 'quote'], [/^```&nbsp;$|^``` $/, 'code']];
HI.ceInput = el => {
  const { b } = blk(el); if (!b) return;
  if (!ED.typing) { pushUndo(); ED.typing = true; }
  clearTimeout(ED.tt); ED.tt = setTimeout(() => { ED.typing = false; }, 900);
  const raw = el.innerHTML;
  if (b.type === 'p') { const hit = SHORT.find(([re]) => re.test(raw)); if (hit) { setType(b.id, hit[1], true); return; } }
  b.html = sanitize(raw); touch();
};
HI.blkCode = el => { const { b } = blk(el); if (!b) return; if (!ED.typing) { pushUndo(); ED.typing = true; } clearTimeout(ED.tt); ED.tt = setTimeout(() => { ED.typing = false; }, 900); b.text = el.value; el.rows = Math.max(3, el.value.split('\n').length + 1); touch(); };
HC.blkLang = el => { const { b } = blk(el); if (!b) return; pushUndo(); b.lang = el.value; touch(); };
HC.blkCheck = el => { const { b } = blk(el); if (!b) return; pushUndo(); b.checked = el.checked; touch(); };
HI.noteTitle = el => { const n = cur(); if (!n) return; if (!ED.typing) { pushUndo(); ED.typing = true; } clearTimeout(ED.tt); ED.tt = setTimeout(() => { ED.typing = false; }, 900); n.title = el.value; touch(); };

function setType(bid, type, clear) {
  const n = cur(), i = n.blocks.findIndex(x => x.id === bid); if (i < 0) return; pushUndo();
  const b = n.blocks[i], text = clear ? '' : (b.type === 'code' ? b.text : stripTags(b.html || ''));
  const nb = type === 'code' ? mkBlock('code', { text, id: b.id }) : mkBlock(type, { html: type === 'code' ? '' : (b.type === 'code' ? esc(b.text) : (clear ? '' : b.html || '')), id: b.id, checked: false });
  if (b.prov) nb.prov = b.prov;
  n.blocks[i] = nb; touch(); renderBlocks({ bid, at: 'end' });
}
function insertAfter(bid, nb, focusNew = true) {
  const n = cur(), i = n.blocks.findIndex(x => x.id === bid); pushUndo();
  n.blocks.splice(i < 0 ? n.blocks.length : i + 1, 0, nb); touch(); renderBlocks(focusNew ? { bid: nb.id, at: 'start' } : null);
}
document.addEventListener('keydown', e => {
  const el = e.target.closest && e.target.closest('.ce'); if (!el || !ED) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? H.edRedo() : H.edUndo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); H.edRedo(); return; }
  if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); pushUndo(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]); HI.ceInput(el); return; }
  const { b } = blk(el); if (!b) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if ((b.type === 'ul' || b.type === 'todo') && !el.textContent.trim()) return setType(b.id, 'p');
    const r = getSelection().getRangeAt(0), tail = document.createRange(); tail.selectNodeContents(el); tail.setStart(r.endContainer, r.endOffset);
    const d = document.createElement('div'); d.appendChild(tail.extractContents());
    pushUndo(); b.html = sanitize(el.innerHTML);
    insertAfterNoUndo(b, mkBlock(b.type === 'ul' || b.type === 'todo' ? b.type : 'p', { html: sanitize(d.innerHTML) }));
  } else if (e.key === 'Backspace') {
    const r = getSelection().getRangeAt(0), atStart = r.collapsed && r.startOffset === 0 && (r.startContainer === el || el.contains(r.startContainer) && !(r.startContainer.previousSibling));
    if (atStart && b.type !== 'p') { e.preventDefault(); setType(b.id, 'p'); }
    else if (atStart && !el.textContent.trim()) {
      const n = cur(), i = n.blocks.findIndex(x => x.id === b.id);
      if (i > 0 && n.blocks.length > 1) { e.preventDefault(); pushUndo(); n.blocks.splice(i, 1); touch(); const prev = n.blocks[i - 1]; renderBlocks(prev.type === 'ref' || prev.type === 'img' ? null : { bid: prev.id, at: 'end' }); }
    }
  }
});
function insertAfterNoUndo(b, nb) { const n = cur(), i = n.blocks.findIndex(x => x.id === b.id); n.blocks.splice(i + 1, 0, nb); touch(); renderBlocks({ bid: nb.id, at: 'start' }); }
document.addEventListener('focusin', e => { const w = e.target.closest && e.target.closest('#blocks .blk'); if (w && ED) ED.focus = w.dataset.bid; });
document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.ed-tb button, .ed-tb select') && !e.target.closest('select')) e.preventDefault(); });

/* ---------- toolbar ---------- */
H.edType = d => {
  const n = cur(); if (!ED.focus || !n.blocks.find(b => b.id === ED.focus)) { const nb = mkBlock(d.t); pushUndo(); n.blocks.push(nb); touch(); return renderBlocks({ bid: nb.id, at: 'end' }); }
  const b = n.blocks.find(x => x.id === ED.focus); if (b.type === 'ref' || b.type === 'img') { return insertAfter(b.id, mkBlock(d.t)); } setType(ED.focus, b.type === d.t ? 'p' : d.t);
};
const inl = f => { const el = document.activeElement; if (!el || !el.classList || !el.classList.contains('ce')) return toast('Click inside a paragraph first.'); pushUndo(); f(); HI.ceInput(el); };
H.edB = () => inl(() => document.execCommand('bold'));
H.edI = () => inl(() => document.execCommand('italic'));
H.edMark = () => inl(() => { const t = getSelection().toString(); if (t) document.execCommand('insertHTML', false, `<mark>${esc(t)}</mark>`); else toast('Select some words first.'); });
H.edCode = () => inl(() => { const t = getSelection().toString(); if (t) document.execCommand('insertHTML', false, `<code>${esc(t)}</code>`); else toast('Select some words first.'); });
H.edClear = () => inl(() => document.execCommand('removeFormat'));
H.edLink = async () => {
  const el = document.activeElement; if (!el || !el.classList || !el.classList.contains('ce')) return toast('Click inside a paragraph first.');
  const sel = getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null, txt = sel.toString();
  const v = await ask({ title: 'Add a web link', fields: [{ id: 'url', label: 'Address', ph: 'https://…', required: true }, { id: 'text', label: 'Text to show', value: txt }], ok: 'Add link' });
  if (!v || !v.url.trim()) return; let u = v.url.trim(); if (!/^(https?:|mailto:)/i.test(u)) u = 'https://' + u;
  el.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
  pushUndo(); document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(v.text.trim() || u)}</a>`); HI.ceInput(el);
};
H.blkAddEnd = () => { const n = cur(), last = n.blocks[n.blocks.length - 1]; if (last && last.type === 'p' && !stripTags(last.html || '').trim()) return focusBlock(last.id); const nb = mkBlock('p'); pushUndo(); n.blocks.push(nb); touch(); renderBlocks({ bid: nb.id, at: 'end' }); };
H.blkUp = d => { const n = cur(), i = n.blocks.findIndex(b => b.id === d.bid); if (i <= 0) return; pushUndo(); [n.blocks[i - 1], n.blocks[i]] = [n.blocks[i], n.blocks[i - 1]]; touch(); renderBlocks(); };
H.blkDown = d => { const n = cur(), i = n.blocks.findIndex(b => b.id === d.bid); if (i < 0 || i >= n.blocks.length - 1) return; pushUndo(); [n.blocks[i + 1], n.blocks[i]] = [n.blocks[i], n.blocks[i + 1]]; touch(); renderBlocks(); };
H.blkDel = d => { const n = cur(); pushUndo(); n.blocks = n.blocks.filter(b => b.id !== d.bid); touch(); renderBlocks(); toast('Block removed.', { act: 'edUndo', label: 'Undo' }); };
H.blkCopy = (d, el) => { const n = cur(), b = n.blocks.find(x => x.id === d.bid); H.copy({ code: b.text }, el); };
H.blkPlay = async d => { const n = cur(), b = n.blocks.find(x => x.id === d.bid); const L = lec(b.ref.lectureId); if (!L) return toast('That lecture is gone.'); const pl = await import('./player.js'); pl.playAt(L, b.ref.t || 0); };
H.edImage = async () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return; const id = uid('img');
    try { await putFile(id, f); } catch (e) { return toast("I couldn't store the image: " + e.message); }
    const n = cur(), nb = mkBlock('img', { fileId: id, alt: f.name }); pushUndo(); const j = n.blocks.findIndex(b => b.id === ED.focus); n.blocks.splice(j < 0 ? n.blocks.length : j + 1, 0, nb); touch(); renderBlocks();
  };
  i.click();
};

/* ---------- linking to anything ---------- */
H.edLinker = () => {
  const n = cur(), ls = lecturesOf(n.courseId);
  sheet(`<h3>🔗 Link to something</h3><p class="muted">Search your course, or link to a moment in a lecture.</p>
  <input type="search" id="lq" data-in="linkQ" placeholder="Search lectures, notes, materials, tasks, code, ideas…" aria-label="Search to link"><div id="lres" aria-live="polite"></div>
  ${ls.length ? `<h4>Or a moment in a lecture</h4><div class="row"><select id="lt-l" aria-label="Lecture">${ls.map(l => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join('')}</select><input id="lt-t" type="text" value="0:00" aria-label="Time, minutes:seconds" style="max-width:110px"><button class="btn soft" data-act="linkTime">Link this moment</button></div>` : ''}
  <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Cancel</button></div>`, { label: 'Link to something' });
};
let LRES = [];
HI.linkQ = el => {
  const q = el.value.trim(), n = cur(); if (!q) { $('#lres').innerHTML = ''; return; }
  LRES = search(q, { courseId: n.courseId, limit: 12 }).filter(h => h.ref && !(h.ref.type === 'note' && h.ref.noteId === n.id));
  $('#lres').innerHTML = LRES.length ? LRES.map((h, i) => `<button class="res" data-act="linkPick" data-i="${i}"><span class="src">${refIcon(h.ref)} ${esc(h.title)} · ${esc(h.type)}</span><span class="tx">${excerpt(h.text, q)}</span></button>`).join('') : '<p class="muted">Nothing matches.</p>';
};
function addRef(ref, quote) { const n = cur(); pushUndo(); const nb = mkBlock('ref', { ref, quote: quote || '' }), j = n.blocks.findIndex(b => b.id === ED.focus); n.blocks.splice(j < 0 ? n.blocks.length : j + 1, 0, nb); touch(); closeSheet(); renderBlocks(); toast('Link added. It opens the exact source.'); }
H.linkPick = d => { const h = LRES[+d.i]; if (h) addRef(h.ref, h.type === 'transcript' || h.type === 'material' || h.type === 'code' ? h.text.slice(0, 220) : ''); };
H.linkTime = () => {
  const L = lec($('#lt-l').value), m = $('#lt-t').value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d\d)$|^(\d+)$/); if (!L || !m) return toast('Write the time like 12:14.');
  const t = m[4] != null ? +m[4] : (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
  addRef({ type: 'audio', lectureId: L.id, t }, '');
};

/* ---------- note-level actions ---------- */
H.newNote = d => { const k = d.k || 'lecture', L = d.l && lec(d.l), n = newNote({ courseId: d.c, lectureId: d.l || null, kind: k, title: '', blocks: [mkBlock('p')] }); go('note', { id: n.id }); };
H.noteImp = () => { const n = cur(); n.important = !n.important; save('notes', n); render(); };
HC.noteKind = el => { const n = cur(); n.kind = el.value; save('notes', n); toast('Moved to ' + kindTitle(n.kind) + '.'); };
H.noteDel = async () => {
  const n = cur(); if (!await confirmSheet({ title: `Delete “${n.title || 'Untitled'}”?`, intro: 'The note and its images are removed from this device. This cannot be undone.', ok: 'Delete note', danger: true })) return;
  n.blocks.filter(b => b.fileId).forEach(b => delFile(b.fileId)); const cid = n.courseId; remove('notes', n.id); ED = null; toast('Note deleted.'); go('course', { id: cid, tab: 'notebooks' });
};
H.noteCopy = async () => {
  const n = cur(), t = `# ${n.title || 'Untitled'}\n\n` + n.blocks.map(b => b.type === 'h2' ? '## ' + stripTags(b.html) : b.type === 'h3' ? '### ' + stripTags(b.html) : b.type === 'ul' ? '- ' + stripTags(b.html) : b.type === 'todo' ? `- [${b.checked ? 'x' : ' '}] ` + stripTags(b.html) : b.type === 'code' ? '```\n' + b.text + '\n```' : b.type === 'quote' ? '> ' + stripTags(b.html) : b.type === 'ref' ? `> ${refLabel(b.ref)}${b.quote ? ': ' + b.quote : ''}` : stripTags(b.html || '')).join('\n\n');
  try { await navigator.clipboard.writeText(t); toast('Copied as Markdown.'); } catch (e) { toast("Copy didn't work here."); }
};

/* ---------- the view ---------- */
openers.note = r => { closeSheet(); go('note', { id: r.noteId }); };
onStatus(() => { const s = $('#edsave'); if (s) s.textContent = status.state === 'saving' ? 'Saving…' : status.state === 'error' ? '⚠ Not saved' : status.state === 'saved' ? 'Saved ✓' : ''; });
register('note', {
  title: V => { const n = note(V.id); return n ? n.title || 'Untitled note' : 'Note'; },
  html(V) {
    const n = note(V.id);
    if (!n) return empty('🌱', "That note isn't here", 'It may have been deleted.', '<a class="btn" href="#/">Home</a>');
    if (!ED || ED.id !== n.id) ED = { id: n.id, undo: [], redo: [], typing: false, focus: null };
    const c = course(n.courseId), L = n.lectureId && lec(n.lectureId);
    const out = [], seen = new Set(); n.blocks.forEach(b => { if (b.ref && !seen.has(refKey(b.ref))) { seen.add(refKey(b.ref)); out.push(b.ref); } });
    const inc = D.notes.filter(x => x.id !== n.id && x.blocks.some(b => b.ref && b.ref.type === 'note' && b.ref.noteId === n.id));
    return `${crumbs([['Home', '#/'], [c ? c.code || c.name : 'Course', c ? '#/c/' + c.id + '/notebooks' : ''], [n.title || 'Untitled note', '']])}
    <input class="ed-title" id="ntitle" type="text" data-in="noteTitle" value="${esc(n.title)}" placeholder="Untitled note" aria-label="Note title">
    <div class="row" style="align-items:center"><label class="small" for="nkind">Notebook</label><select id="nkind" data-ch="noteKind" style="width:auto">${KINDS.map(k => `<option value="${k.id}"${k.id === n.kind ? ' selected' : ''}>${k.emoji} ${k.title}</option>`).join('')}</select><button class="mini" data-act="noteImp" aria-pressed="${!!n.important}">${n.important ? '⭐ Important' : '☆ Mark important'}</button><span id="edsave" class="savestat" role="status"></span></div>
    ${L ? `<p class="small muted">From <a href="#/l/${L.id}/orig">${esc(L.title)}</a></p>` : n.orphanedFrom ? `<p class="small muted">Written during “${esc(n.orphanedFrom)}” (that lecture was deleted).</p>` : ''}
    ${tagChips('notes', n)}
    <div class="ed-tb" role="toolbar" aria-label="Formatting">
      <button data-act="edUndo" aria-label="Undo">↶</button><button data-act="edRedo" aria-label="Redo">↷</button><span class="sep"></span>
      <button data-act="edType" data-t="p" aria-label="Paragraph">¶</button><button data-act="edType" data-t="h2">H2</button><button data-act="edType" data-t="h3">H3</button><button data-act="edType" data-t="ul" aria-label="List">• List</button><button data-act="edType" data-t="todo">☑ To-do</button><button data-act="edType" data-t="code">&lt;/&gt; Code</button><button data-act="edType" data-t="callout">💬 Callout</button><button data-act="edType" data-t="quote">❝ Quote</button><span class="sep"></span>
      <button data-act="edB" aria-label="Bold"><b>B</b></button><button data-act="edI" aria-label="Italic"><i>I</i></button><button data-act="edMark" aria-label="Highlight">🖍</button><button data-act="edCode" aria-label="Inline code">⌨ code</button><button data-act="edLink">🌐 Link</button><button data-act="edClear" aria-label="Clear formatting">Tx</button><span class="sep"></span>
      <button data-act="edLinker">🔗 Link to…</button><button data-act="edImage">🖼 Image</button><span class="sep"></span><button data-act="edVersion">💾 Save version</button><button data-act="edHistory">🕘 History</button><button data-act="noteCopy">📋 Copy</button>
    </div>
    <div id="blocks">${blocksHTML(n)}</div>
    <div class="paper small" style="margin-top:20px"><b>Connected</b><br>${out.length ? 'Links to: ' + out.map(r => refChip(r)).join(' ') : 'This note does not link to anything yet. Use “Link to…” or select words in a transcript and choose Add to My Notes.'}${inc.length ? '<br>Linked from: ' + inc.map(x => `<a class="chip" href="#/n/${x.id}">📝 ${esc(x.title || 'Untitled')}</a>`).join(' ') : ''}</div>
    <div class="row" style="margin-top:12px"><button class="btn danger" data-act="noteDel">🗑 Delete note</button></div>`;
  },
  after() { loadImgs(); const s = $('#edsave'); if (s) s.textContent = status.state === 'saved' ? 'Saved ✓' : ''; }
});

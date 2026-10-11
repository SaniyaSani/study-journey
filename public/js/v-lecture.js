// The lecture page: Original / Clean Notes / Kitten Mode / My Notes / Materials / Tasks / Glossary, the rescue card and the explanation cards.
import { D, uid, save, saveMeta, lec, course, mod, note, modulesOf, touchRecent, deleteLecture, add } from './store.js';
import { esc, md, fmt, segText, codeOf, cleanText, analyze, groupName, fam, WARN, emphasisOf, materialHits, rescueData, backlinks, stripTags, noteText, todayISO } from './lib.js';
import { KB, LV, nm, ids, ancestors } from './kb.js';
import { $, H, HI, V, register, go, ask, confirmSheet, sheet, closeSheet, toast, nav, api, render, openers, refAttr, openRef } from './core.js';
import { prov, refChip, tsChip, codeBlock, empty, tagChips, statusChip, lectureCrumbs, dateLabel, kindEmoji } from './ui.js';
import { SEL, setSel, clearSel, selSheet, autoNote, mkBlock, newNote, addTask, scanTasks, parseTranscript, segRef, noteExcerpt } from './actions.js';
import { tasksBlock } from './v-tasks.js';
import { materialsBlock } from './v-materials.js';
import { offerTranscribe, isProcessing } from './v-capture.js';
import { applyTranscript, provenanceBar, versionsOf } from './transcripts.js';
import { WEEK3_SAMPLE } from './fixtures.js';
import * as player from './player.js';

const TABS = [['orig', '🎤 Original'], ['notes', '📝 Clean Notes'], ['kitten', '🐱 Kitten Mode'], ['my', '✍️ My Notes'], ['mats', '📎 Materials'], ['tasks', '✅ Tasks & Exercises'], ['gloss', '📖 Glossary']];
const NPRIMARY = 4;
const SRC = { fixture: '🧪 This transcript is sample text (a development fixture), not a real recording.', pasted: '✍️ Transcript pasted by you.', stt: '🎧 Transcribed automatically. It can contain mistakes, so check names and commands.', live: '🎤 Live captions from your browser. They can contain mistakes.', migrated: 'Transcript from an earlier version of this app.', none: '' };

/* ---------- small renderers ---------- */
function unsureBlock(L, i, sg) {
  if (!sg.unsure) return '';
  return `<div class="unsure">🎧 I may have misheard this. Which is right?<br>${sg.unsure.alts.map(a => `<button data-act="fixAlt" data-id="${L.id}" data-i="${i}" data-a="${esc(a)}"><code>${esc(a)}</code></button>`).join('')}</div>`;
}
H.fixAlt = d => { const L = lec(d.id), sg = L.segments[+d.i]; sg.fixed = d.a; sg.unsure = null; save('lectures', L); render(); };
const backChips = (L, i) => { const b = backlinks(L.id, i); return [...b.notes.map(n => `<button class="chip" data-act="openRef" data-ref="${refAttr({ type: 'note', noteId: n.id })}" title="A note of yours points here">📝 ${esc((n.title || 'Untitled').slice(0, 28))}</button>`), ...b.tasks.map(t => `<button class="chip" data-act="openRef" data-ref="${refAttr({ type: 'task', id: t.id })}" title="A task points here">✅ ${esc(t.title.slice(0, 28))}</button>`)].join(''); };

const WHY = { 'low-confidence': 'the model was not sure what was said', 'maybe-no-speech': 'this may be noise rather than speech', 'repetitive': 'the model got stuck on repeated words', 'many-uncertain-words': 'several words in a row were uncertain' };
/* The text is shown exactly as heard. Words the model was unsure about are only underlined, never changed. */
function segHtml(sg) {
  if (sg.edit || !sg.low || !sg.low.length) return esc(segText(sg));
  let out = '', pos = 0; const t = sg.text;
  for (const [a, b] of sg.low) { if (a < pos || b > t.length) continue; out += esc(t.slice(pos, a)) + `<span class="lowp" title="The speech model was unsure about this word">${esc(t.slice(a, b))}</span>`; pos = b; }
  return out + esc(t.slice(pos));
}
function segRow(L, i, sg) {
  const em = emphasisOf(sg), edited = !!sg.edit, code = codeOf(sg);
  return `<div class="seg${sg.imp ? ' imp' : ''}${sg.unclear ? ' unclear' : ''}" data-seg="${i}" id="seg-${i}">
  <button class="ts" data-act="playSeg" data-id="${L.id}" data-t="${sg.t}" aria-label="Play from ${fmt(sg.t)}">▶ ${fmt(sg.t)}</button>
  <div>${L.fixture ? prov('fixture') : prov('prof')}${edited ? ' ' + prov('edited') : ''}${sg.imp ? ' <span class="tag t-new">⭐ Important</span>' : ''}
  <p class="segtext" data-seg="${i}" style="margin:.25em 0">${segHtml(sg)}</p>
  ${edited ? `<button class="mini-act" data-act="rawToggle">see the original wording</button><div class="diff" hidden><b>Original:</b> ${esc(sg.text)}<br><button class="link" data-act="restoreSeg" data-id="${L.id}" data-i="${i}">Restore the original wording</button></div>` : ''}
  ${em ? '<span class="tag t-out">✨ Professor emphasis</span>' : ''}${sg.unclear || sg.lowconf ? `<div class="unsure">🎧 <b>Unclear.</b> I may have misheard this${sg.reasons && sg.reasons.length ? ' (' + esc(sg.reasons.map(r => WHY[r] || r).join('; ')) + ')' : ''}. Listen to this moment before you rely on it. I have not guessed or fixed anything.</div>` : ''}${unsureBlock(L, i, sg)}
  ${code ? codeBlock(code, { small: true, note: sg.unsure ? 'reconstructed from speech, please check' : 'reconstructed from speech' }) : ''}
  <div class="seg-tools">${backChips(L, i)}<button class="mini-act" data-act="impSeg" data-id="${L.id}" data-i="${i}" aria-pressed="${!!sg.imp}">${sg.imp ? '⭐ Unmark' : '⭐ Important'}</button><button class="mini-act" data-act="editSeg" data-id="${L.id}" data-i="${i}">✏️ Correct</button><button class="mini-act" data-act="rescueAt" data-id="${L.id}" data-t="${sg.t}">🆘 Explain around here</button><button class="mini-act" data-act="segMenu" data-id="${L.id}" data-i="${i}">⋯ More</button></div></div></div>`;
}
H.rawToggle = (d, el) => { const x = el.nextElementSibling; if (x) x.hidden = !x.hidden; };
H.restoreSeg = d => { const L = lec(d.id), sg = L.segments[+d.i]; delete sg.edit; save('lectures', L); render(); toast('Original wording restored.'); };
H.impSeg = d => { const L = lec(d.id), sg = L.segments[+d.i]; sg.imp = !sg.imp; save('lectures', L); render(); };
H.editSeg = async d => {
  const L = lec(d.id), sg = L.segments[+d.i];
  const v = await ask({ title: 'Correct the transcript', intro: 'Fix a misheard word or name. <b>The original wording is always kept</b> and you can restore it.', fields: [{ id: 'text', label: 'What was actually said', type: 'textarea', rows: 4, value: segText(sg) }], ok: 'Save correction' });
  if (!v) return; const t = v.text.trim(); if (!t) return;
  if (t === sg.text) delete sg.edit; else sg.edit = { text: t, at: Date.now() };
  save('lectures', L); render();
};
H.playSeg = d => player.playAt(lec(d.id), +d.t);

/* ---------- Original ---------- */
function origTab(L) {
  const f = V.filter || 'all', segs = L.segments.map((s, i) => ({ s, i })).filter(({ s }) => f === 'imp' ? s.imp : f === 'emph' ? emphasisOf(s) : f === 'code' ? codeOf(s) : f === 'edit' ? s.edit : true);
  return `${provenanceBar(L)}<div class="paper small">Exactly what was said, in order. ${L.fixture ? '' : 'Corrections you make sit on top of the original words and can always be undone.'} Select any words to do something with them.</div>
  <div class="big-search"><input type="search" id="segfind" data-in="segFind" placeholder="Find in this transcript…" aria-label="Find in this transcript"><span class="small muted" id="findcount"></span></div>
  <div class="filters" role="group" aria-label="Show">${[['all', 'All'], ['imp', '⭐ Important'], ['emph', '✨ Emphasis'], ['code', '💻 With code'], ['edit', '✏️ Edited']].map(([k, l]) => `<button class="pill${f === k ? ' on' : ''}" aria-pressed="${f === k}" data-act="segFilter" data-f="${k}">${l}</button>`).join('')}</div>
  ${segs.length ? segs.map(({ s, i }) => segRow(L, i, s)).join('') : `<p class="muted">Nothing matches this filter.</p>`}`;
}
H.segFilter = d => { V.filter = d.f; render(); };
HI.segFind = el => {
  const q = el.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('#app .seg[data-seg]').forEach(s => { const hit = !q || s.querySelector('.segtext').textContent.toLowerCase().includes(q); s.hidden = !hit; if (hit) n++; });
  $('#findcount').textContent = q ? `${n} match${n === 1 ? '' : 'es'}` : '';
};

/* ---------- Clean Notes ---------- */
function cleanPara(L, i) {
  const sg = L.segments[i], ov = (L.cleanEdits || {})[i];
  if (ov) return { html: md(ov.text), edited: true };
  let t = segText(sg); if (sg.say && codeOf(sg)) t = t.replace(sg.say, '\u0001');
  return { html: md(cleanText(t)).replace('\u0001', `<code>${esc(codeOf(sg))}</code>`), edited: false };
}
function notesTab(L, A) {
  const adds = L.cleanAdds || [], emph = L.segments.map((s, i) => ({ s, i })).filter(x => emphasisOf(x.s));
  const recap = `<div class="paper"><h3>🌸 In short</h3><p>${A.order.length ? `${A.order.length} idea${A.order.length === 1 ? '' : 's'} came up:` : 'No technical idea from the dictionary was recognised yet.'} ${A.order.map(id => `<button class="chip" data-act="concept" data-id="${id}">${KB[id].e} ${esc(nm(id))}</button>`).join('')}</p>
    ${emph.length ? `<p class="small muted">${emph.length} point${emph.length === 1 ? '' : 's'} the professor stressed: ${emph.map(({ s, i }) => refChip({ type: 'seg', lectureId: L.id, seg: i, t: s.t }, fmt(s.t))).join(' ')}</p>` : ''}
    <p class="small">${prov('rules')} The text below is tidied by simple rules (filler words removed). Nothing is added or rewritten by AI.</p></div>`;
  const topics = A.topics.map(tp => {
    const cs = [...new Set(tp.idx.flatMap(i => A.info[i].hit))], mats = [];
    cs.forEach(id => materialHits(KB[id].re, { courseId: L.courseId, lectureId: L.id, moduleId: L.moduleId }).forEach(h => { if (!mats.find(m => m.materialId === h.materialId && m.page === h.page)) mats.push(h); }));
    return `<div class="paper"><h3>${esc(groupName(tp.g))}</h3>${tp.idx.map(i => {
      const sg = L.segments[i], p = cleanPara(L, i), warn = WARN.test(segText(sg));
      return `<div class="cleanp" data-seg="${i}"><p><button class="ts" data-act="playSeg" data-id="${L.id}" data-t="${sg.t}" aria-label="Play from ${fmt(sg.t)}">▶ ${fmt(sg.t)}</button> <span class="cleantext" data-seg="${i}">${p.html}</span> ${p.edited ? prov('edited') : ''} <button class="mini-act" data-act="editClean" data-id="${L.id}" data-i="${i}">✏️</button><button class="mini-act" data-act="segMenu" data-id="${L.id}" data-i="${i}" aria-label="More actions">⋯</button></p>
      ${codeOf(sg) ? codeBlock(codeOf(sg), { small: true, note: 'reconstructed from speech' }) : ''}${unsureBlock(L, i, sg)}
      ${emphasisOf(sg) ? `<div class="emph">✨ <b>Professor emphasis</b><br>“${esc(cleanText(segText(sg)))}”<br><span class="small">${refChip({ type: 'seg', lectureId: L.id, seg: i, t: sg.t }, '🔊 ' + fmt(sg.t) + ' · open in the transcript')}${/exam/i.test(segText(sg)) ? ' · the lecturer said this is exam-relevant' : ''}</span></div>` : ''}
      ${warn && !emphasisOf(sg) ? `<div class="emph">⚠️ <b>Watch out</b><br><span class="small">The lecturer warned about this.</span></div>` : ''}
      <div class="seg-tools">${backChips(L, i)}</div></div>`;
    }).join('')}${mats.length ? `<p class="small muted">📄 In your materials: ${mats.slice(0, 5).map(h => refChip({ type: 'material', materialId: h.materialId, page: h.page }, `${h.name} · p.${h.page}`)).join(' ')}</p>` : ''}</div>`;
  }).join('');
  const added = adds.length ? `<div class="paper"><h3>✍️ Added by you</h3>${adds.map(a => `<div class="you"><p>${esc(a.text)}</p><p class="small">${prov('you')} ${a.ref ? refChip(a.ref, '🔊 ' + fmt(a.ref.t) + ' · where it came from') : ''} <button class="mini-act" data-act="rmAdd" data-id="${L.id}" data-aid="${a.id}">Remove</button></p></div>`).join('')}</div>` : '';
  return `${recap}${topics}${added}`;
}
H.editClean = async d => {
  const L = lec(d.id), i = +d.i, cur = cleanPara(L, i);
  const v = await ask({ title: 'Edit the clean version', intro: 'This changes only the Clean Notes. The original transcript stays exactly as it was.', fields: [{ id: 'text', label: 'Clean wording', type: 'textarea', rows: 4, value: (L.cleanEdits[i] && L.cleanEdits[i].text) || cleanText(segText(L.segments[i])) }, { id: 'reset', label: 'Go back to the automatic version?', type: 'select', value: 'no', options: [{ v: 'no', l: 'No, save my wording' }, { v: 'yes', l: 'Yes, reset to automatic' }] }], ok: 'Save' });
  if (!v) return; L.cleanEdits = L.cleanEdits || {};
  if (v.reset === 'yes' || !v.text.trim()) delete L.cleanEdits[i]; else L.cleanEdits[i] = { text: v.text.trim(), at: Date.now() };
  save('lectures', L); render();
};
H.rmAdd = d => { const L = lec(d.id); L.cleanAdds = (L.cleanAdds || []).filter(a => a.id !== d.aid); save('lectures', L); render(); };

/* ---------- Kitten Mode cards ---------- */
const CS = {}, QS = {};
const cardS = (key, id) => CS[key] || (CS[key] = { stack: [id], lvl: 2, msg: '', done: false });
export function card(L, id) {
  const key = (L ? L.id : 'c') + ':' + id, cs = cardS(key, id), cur = cs.stack[cs.stack.length - 1], k = KB[cur], root = cs.stack.length === 1, f = fam(id);
  if (!k) return '';
  const found = L && root ? analyze(L).found[id] : null;
  if (cs.done || (f >= 80 && !cs.open && root)) return `<div class="card" style="padding:12px 18px"><b>${k.e} ${esc(k.name)}</b> <span class="tag t-new">✅ you've got this</span> <button class="link" data-act="reopen" data-k="${key}">show anyway</button></div>`;
  const q = root && KB[id].quiz ? KB[id].quiz : null, qa = QS[key], fo = cs.focus;
  const mats = L && root ? materialHits(KB[cur].re, { courseId: L.courseId, lectureId: L.id, moduleId: L.moduleId }).slice(0, 4) : [];
  const unknownPre = k.pre.filter(p => KB[p]);
  const tag = k.remote ? prov('llm') : prov('ai');
  const det = (name, key2, body) => body ? `<details${fo === key2 ? ' open' : ''}><summary>${name}</summary>${body}</details>` : '';
  const lines = k.lines && k.lines.length ? `<table class="lines"><tbody>${k.lines.map(([c, m]) => `<tr><td><code>${esc(c)}</code></td><td>${md(m)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<div class="card" id="card-${esc(key.replace(/\W/g, '_'))}"><h3>${k.e} ${esc(k.name)}: what does this actually mean?</h3>
  ${!f && root ? '<span class="tag t-new">🌱 New concept</span>' : ''}
  ${cs.msg ? `<div class="step-banner" role="status">${esc(cs.msg)}</div>` : ''}
  ${cs.stack.length > 1 ? `<p class="small muted">${cs.stack.map(x => esc(nm(x))).join(' → ')}</p>` : ''}
  <div class="tabs" role="group" aria-label="Level of explanation">${LV.map(([n, l], i) => `<button class="pill" aria-pressed="${cs.lvl === i}" data-act="lvl" data-k="${key}" data-i="${i}">${l}</button>`).join('')}</div>
  <p class="sec">🌱 Why does this exist?</p><p>${md(k.why)}</p>
  <p class="sec">${tag} ${esc(LV[cs.lvl][1].slice(3))}</p><p>${md(k[LV[cs.lvl][0]])}</p>
  ${cs.lvl === 4 ? `<p class="small">${prov('outside')}</p>` : ''}
  ${unknownPre.length ? `<p class="small">Builds on: ${unknownPre.map(p => `<button class="chip" data-act="preGo" data-k="${key}" data-p="${p}">${fam(p) >= 70 ? '✅' : '🌱'} ${esc(nm(p))}</button>`).join('')}</p>` : ''}
  ${det('🧪 A tiny example', 'ex', k.ex ? `<pre>${esc(k.ex)}</pre>` : '')}
  ${det('🪜 What happens, step by step', 'steps', k.steps && k.steps.length ? `<ol>${k.steps.map(s => `<li>${md(s)}</li>`).join('')}</ol>` : '')}
  ${det('🔍 Line by line', 'lines', lines)}
  ${det('🙈 Common misunderstandings', 'miss', k.miss && k.miss.length ? `<ul>${k.miss.map(s => `<li>${md(s)}</li>`).join('')}</ul>` : '')}
  ${root ? det('✨ Why is the professor telling me this?', 'why', `<p>${md(k.prof)}</p>`) : ''}
  ${found && found.assumed ? `<p class="small"><span class="tag t-out">🌱 Hidden prerequisite</span> The professor didn't explain this one, but the next ideas rely on it.</p>` : found ? `<div class="quote">${L.fixture ? prov('fixture') : prov('prof')}<br>“${esc(cleanText(segText(L.segments[found.seg])))}”<br>${refChip({ type: 'seg', lectureId: L.id, seg: found.seg, t: found.t }, '🔊 ' + fmt(found.t) + ' · open in the transcript')} <button class="ts" data-act="playSeg" data-id="${L.id}" data-t="${found.t}">▶ Play</button></div>` : ''}
  ${mats.length ? `<p class="small">📄 In your materials: ${mats.map(h => refChip({ type: 'material', materialId: h.materialId, page: h.page }, `${h.name} · p.${h.page}`)).join(' ')}</p>` : ''}
  ${q ? `<p class="sec">🧪 Tiny check</p><p>${md(q.q)}</p>${q.code ? `<pre>${esc(q.code)}</pre>` : ''}${q.opts.map((o, i) => `<button class="opt ${qa == null ? '' : i === q.ans ? 'ok' : qa === i ? 'no' : ''}" data-act="quiz" data-k="${key}" data-i="${i}">${'ABC'[i]}. ${esc(o)}</button>`).join('')}${qa != null ? `<p>${qa === q.ans ? '✅ Yes! ' : 'Not quite. '}${md(q.why)}</p>` : ''}` : ''}
  ${cs.ask ? `<div class="sug" role="group" aria-label="Where did it get fuzzy?"><b>Where did it get fuzzy?</b> No wrong answer. This tells me what to fix.<div class="grid2" style="margin-top:8px">
    <button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="words">📖 A word I don't know</button>
    <button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="picture">🖼️ I can't picture it</button>
    <button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="why">🤷 I don't see why it matters</button>
    <button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="code">💻 The code or command</button>
    ${L && root ? `<button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="earlier">⏪ I lost it earlier</button>` : ''}
    <button class="btn soft" data-act="stillWhy" data-k="${key}" data-w="auto">🧗 Just help me, step by step</button></div></div>` : ''}
  ${cs.end ? `<div class="step-banner">You are at the bottom of the ladder. This one is worth asking the lecturer. I saved it as a question.</div>` : ''}
  <div class="row" style="margin-top:12px"><button class="btn sage" data-act="get" data-k="${key}">✅ I get it</button><button class="still" data-act="still" data-k="${key}" aria-expanded="${!!cs.ask}">😭 I STILL DON'T GET IT</button><button class="link" data-act="concept" data-id="${cur}">open page</button></div></div>`;
}
const cur2 = cs => cs.stack[cs.stack.length - 1];
H.lvl = d => { CS[d.k].lvl = +d.i; CS[d.k].msg = ''; CS[d.k].focus = null; render(); };
H.reopen = d => { CS[d.k].done = false; CS[d.k].open = true; render(); };
H.quiz = d => { QS[d.k] = +d.i; render(); };
H.preGo = d => { const cs = CS[d.k]; if (!cs.stack.includes(d.p)) cs.stack.push(d.p); cs.lvl = 2; cs.msg = `Let's look at what ${nm(d.p)} is first.`; render(); };
H.get = d => {
  const cs = CS[d.k], cur = cur2(cs), wasConfusing = (D.meta.clicks[cur] || 0) > 0;
  D.meta.fam[cur] = 100; saveMeta();
  if (cs.stack.length > 1) { cs.stack.pop(); cs.lvl = 2; cs.msg = 'Nice, that step is solid. Back to the idea you came from.'; cs.ask = false; } else { cs.done = true; cs.ask = false; }
  if (wasConfusing) {
    const L = lec(d.k.split(':')[0]) , cid = L ? L.courseId : D.meta.cur, n = autoNote(cid, 'understood');
    if (!n.blocks.some(b => b.ref && b.ref.type === 'concept' && b.ref.id === cur)) { n.blocks.push(mkBlock('ref', { ref: { type: 'concept', id: cur }, quote: KB[cur].simple }), mkBlock('p')); save('notes', n); toast('🌸 Saved to “Things I Finally Understood”.'); }
  }
  render();
};
H.still = d => {
  const cs = CS[d.k], cur = cur2(cs); D.meta.clicks[cur] = (D.meta.clicks[cur] || 0) + 1; D.meta.fam[cur] = Math.min(fam(cur), 10); saveMeta();
  cs.ask = !cs.ask; cs.end = false; render();
};
function reps(k) { return [k.ex ? 'ex' : null, k.steps && k.steps.length ? 'steps' : null, 'cats', 'zero'].filter(Boolean); }
function rotate(cs, k) {
  const r = reps(k); cs.repI = cs.repI || 0;
  if (cs.repI >= r.length) return false;
  const w = r[cs.repI++]; cs.focus = w; cs.lvl = w === 'cats' ? 4 : w === 'zero' ? 3 : 2;
  cs.msg = { ex: "Let's look at a tiny worked example.", steps: "Let's see it as a sequence of steps.", cats: "Let's try a picture with cats.", zero: 'Starting from absolutely nothing:' }[w]; return true;
}
H.stillWhy = d => {
  const cs = CS[d.k], cur = cur2(cs), k = KB[cur], w = d.w; cs.ask = false; cs.end = false;
  const missing = () => k.pre.find(p => KB[p] && fam(p) < 70 && !cs.stack.includes(p));
  if (w === 'words') { const p = missing(); if (p) { cs.stack.push(p); cs.lvl = 2; cs.focus = null; cs.msg = `A word may be hiding under this one: ${nm(p)}. Let's start there.`; } else { cs.lvl = 3; cs.focus = null; cs.msg = 'You seem to know the words underneath, so here it is again from absolutely nothing, with every term explained.'; } }
  else if (w === 'picture') { if (!rotate(cs, k)) { cs.end = true; askLater(cur, d.k); } }
  else if (w === 'why') { cs.focus = 'why'; cs.lvl = 2; cs.msg = 'Why it matters is below, with what the professor said.'; }
  else if (w === 'code') { if (k.lines && k.lines.length) { cs.focus = 'lines'; cs.msg = 'Here it is one piece at a time.'; } else if (!rotate(cs, k)) { cs.end = true; askLater(cur, d.k); } }
  else if (w === 'earlier') { const L = lec(d.k.split(':')[0]), f = L && analyze(L).found[cs.stack[0]]; if (L && f) { render(); return H.rescueSheet({ id: L.id, t: Math.max(0, f.t - 60) }); } }
  else { const p = missing(); if (p) { cs.stack.push(p); cs.lvl = 2; cs.focus = null; cs.msg = `Let's go one step earlier: what is ${nm(p)}?`; } else if (!rotate(cs, k)) { cs.end = true; askLater(cur, d.k); } }
  render();
};
function askLater(cur, key) {
  const L = lec(key.split(':')[0]), cid = L ? L.courseId : D.meta.cur, title = `Could you explain “${nm(cur)}” once more from the start?`;
  if (!D.tasks.some(t => t.kind === 'question' && t.title === title && t.status === 'open')) addTask({ courseId: cid, lectureId: L ? L.id : null, moduleId: L ? L.moduleId : null, kind: 'question', title, desc: 'You reached the bottom of the explanation ladder.', ref: { type: 'concept', id: cur }, auto: true });
}
function kittenTab(L, A) {
  if (!A.order.length) return `<div class="paper">🌱 I need a little more of the lecture to explain this properly.<br><span class="muted small">${nav.api.llm ? 'Process the lecture with the AI to get explanations for this topic.' : 'Without an AI connected, I only know the built-in High Performance Computing vocabulary.'}</span></div>`;
  const n = A.order.filter(id => !fam(id)).length;
  return `<div class="paper" style="background:var(--pink)"><b>🐱 It's okay.</b> I'll explain what the professor means.<br><span class="small">${A.order.length} ideas came up${n ? `, ${n} of them new to you` : ''}. Each one starts from “why does this exist?”, then gets more precise. Press <b>I STILL DON'T GET IT</b> any time and tell me where it got fuzzy.</span></div>` + A.order.map(id => card(L, id)).join('');
}

/* ---------- My Notes, Glossary ---------- */
function myTab(L) {
  const ns = D.notes.filter(n => n.lectureId === L.id).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return `<div class="paper"><b>Jot something down</b><textarea id="qn" rows="2" placeholder="A thought, a question, a reminder…" aria-label="Quick note"></textarea><div class="row"><button class="btn soft" data-act="quickNote" data-id="${L.id}">＋ Add to my notes${L.hasAudio ? ' at the current moment' : ''}</button><button class="btn ghost" data-act="newLecNote" data-id="${L.id}">New full note</button></div></div>
  ${ns.length ? ns.map(n => `<a class="res" href="#/n/${n.id}"><span class="src">📝 ${esc(n.title || 'Untitled')} · ${n.blocks.length} block${n.blocks.length === 1 ? '' : 's'}</span><span class="tx">${esc(noteExcerpt(n) || 'Empty note')}</span></a>`).join('') : empty('✍️', 'No notes for this lecture yet', 'Select words in the transcript and choose “Add to My Notes”, or jot something above.')}`;
}
H.quickNote = d => {
  const L = lec(d.id), ta = $('#qn'), tx = ta.value.trim(); if (!tx) return toast('Write something first.');
  const n = autoNote(L.courseId, 'lecture', L.id), t = player.time();
  const blocks = []; if (L.hasAudio && t > 0) blocks.push(mkBlock('ref', { ref: { type: 'audio', lectureId: L.id, t: Math.floor(t) }, quote: '' }));
  blocks.push(mkBlock('p', { html: esc(tx).replace(/\n/g, '<br>'), prov: 'you' })); n.blocks.push(...blocks, mkBlock('p')); save('notes', n); ta.value = ''; render(); toast('Added to your notes.');
};
H.newLecNote = d => { const L = lec(d.id), n = newNote({ courseId: L.courseId, lectureId: L.id, kind: 'lecture', title: 'New note', blocks: [mkBlock('p')] }); go('note', { id: n.id }); };
function glossTab(L, A) {
  if (!A.order.length) return empty('📖', 'No terms yet', 'Terms appear here when the lecture mentions ideas I can explain.');
  return `<p class="muted small">Every idea from this lecture, alphabetically. ${prov('ai')}</p>` + [...A.order].sort((a, b) => nm(a).localeCompare(nm(b))).map(id => {
    const k = KB[id], f = A.found[id];
    return `<div class="paper"><h3>${k.e} ${esc(k.name)}</h3><p>${md(k.simple)}</p><p class="small">${k.remote ? prov('llm') : prov('ai')} ${f && !f.assumed ? refChip({ type: 'seg', lectureId: L.id, seg: f.seg, t: f.t }, '🔊 first heard at ' + fmt(f.t)) : '<span class="tag t-out">🌱 assumed, never explained</span>'} <button class="chip" data-act="concept" data-id="${id}">Open the page</button></p>${D.meta.conceptNotes && D.meta.conceptNotes[id] ? `<p class="small you">✍️ ${esc(D.meta.conceptNotes[id])}</p>` : ''}</div>`;
  }).join('') + `<div class="paper"><h3>🧩 How the ideas connect</h3>${A.order.map(id => `<p class="small"><b>${esc(nm(id))}</b> ← ${KB[id].pre.map(p => esc(nm(p))).join(', ') || "<span class='muted'>needs nothing else</span>"}</p>`).join('')}</div>`;
}

/* ---------- no transcript yet ---------- */
function needTx(L) {
  const s = nav.api.stt;
  return `<div class="paper"><h3>🌱 There is no transcript yet</h3><p class="muted">${L.hasAudio ? (s ? 'The audio is saved. I can write the transcript from it.' : 'The audio is saved on this device. No transcription service is connected, so paste a transcript (from your university or another tool).') : 'Add audio, a transcript, or both.'}</p>
  <div class="row">${L.hasAudio && s ? `<button class="btn" data-act="askTranscribe" data-id="${L.id}">🎧 Write the transcript</button>` : ''}<button class="btn soft" data-act="pasteTx" data-id="${L.id}">✍️ Paste a transcript</button>${L.hasAudio ? '' : `<button class="btn soft" data-act="attachAudio" data-id="${L.id}">🎧 Attach audio</button>`}<button class="btn ghost" data-act="sampleTx" data-id="${L.id}">🧪 Use the sample transcript (development fixture)</button></div></div>`;
}
H.askTranscribe = d => offerTranscribe(lec(d.id));
H.pasteTx = async d => {
  closeSheet(); const L = lec(d.id);
  const v = await ask({ title: 'Paste a transcript', intro: 'Lines like <code>12:14 text…</code> keep their time. Lines without a time are spaced 30 s apart.', fields: [{ id: 'tx', label: 'Transcript', type: 'textarea', rows: 10, value: '' }], ok: 'Use this transcript' });
  if (!v || !v.tx.trim()) return;
  if (L.segments.length && !await confirmSheet({ title: 'Replace the current transcript?', intro: 'The current transcript is kept as an earlier version (with your corrections). Links in your notes become “moment in the recording” links so they stay exact.', ok: 'Replace' })) return;
  applyTranscript(L, parseTranscript(v.tx), { source: 'pasted', label: 'replaced by a pasted transcript' }); L.status = 'ready';
  L.duration = Math.max(L.duration || 0, L.segments[L.segments.length - 1].t + 30); save('lectures', L); scanTasks(L); render(); toast('Transcript added.');
};
H.sampleTx = d => { const L = lec(d.id); L.segments = WEEK3_SAMPLE.map(s => ({ ...s })); L.fixture = 'esc401-w3-sample'; L.transcriptSource = 'fixture'; L.status = 'ready'; L.duration = Math.max(L.duration || 0, 1400); L.cleanEdits = {}; save('lectures', L); scanTasks(L); render(); toast('🧪 Sample text loaded. It is labelled as a sample everywhere.'); };

/* ---------- management menu ---------- */
H.lecMenu = d => {
  const L = lec(d.id);
  sheet(`<h3>${esc(L.title)}</h3><div class="grid2">
  <button class="btn soft" data-act="renameLec" data-id="${L.id}">✏️ Rename or change date</button>
  <button class="btn soft" data-act="moveLec" data-id="${L.id}">📁 Move to another week</button>
  <button class="btn soft" data-act="attachAudio" data-id="${L.id}" data-then="close">🎧 ${L.hasAudio ? 'Replace the audio' : 'Attach audio'}</button>
  <button class="btn soft" data-act="pasteTx" data-id="${L.id}" data-then="close">✍️ ${L.segments.length ? 'Replace with a pasted transcript' : 'Paste a transcript'}</button>
  ${L.hasAudio && nav.api.stt ? `<button class="btn soft" data-act="retranscribe" data-id="${L.id}">🔁 Transcribe the recording again</button>` : ''}
  ${versionsOf(L).length ? `<button class="btn soft" data-act="tversions" data-id="${L.id}">🗂 Transcript versions (${versionsOf(L).length})</button>` : ''}
  ${nav.api.llm && L.segments.length && !L.fixture ? `<button class="btn soft" data-act="reanalyse" data-id="${L.id}">🔁 Explain again with AI</button>` : ''}
  <button class="btn soft" data-act="scanLec" data-id="${L.id}">🔎 Look for tasks in this lecture</button>
  <button class="btn danger" data-act="delLec" data-id="${L.id}">🗑 Delete this lecture</button></div>
  <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Lecture options' });
};
H.renameLec = async d => {
  closeSheet(); const L = lec(d.id);
  const v = await ask({ title: 'Rename lecture', fields: [{ id: 'title', label: 'Title', value: L.title, required: true }, { id: 'date', label: 'Date', type: 'date', value: L.date }], ok: 'Save' });
  if (!v || !v.title.trim()) return; L.title = v.title.trim(); L.date = v.date || L.date; save('lectures', L); render();
};
H.moveLec = async d => {
  closeSheet(); const L = lec(d.id), mods = modulesOf(L.courseId);
  const v = await ask({ title: 'Move to another week', intro: 'Notes, materials and tasks linked to this lecture stay linked to it.', fields: [{ id: 'm', label: 'Week / module', type: 'select', value: L.moduleId || '', options: [{ v: '', l: 'Not in a week yet' }, ...mods.map(m => ({ v: m.id, l: m.title }))] }, { id: 'nm', label: '…or a new week', ph: 'Week 5 — …' }], ok: 'Move' });
  if (!v) return; let mid = v.m; if (v.nm.trim()) { mid = uid('m'); add('modules', { id: mid, courseId: L.courseId, title: v.nm.trim(), order: mods.reduce((a, m) => Math.max(a, m.order || 0), 0) + 1, created: Date.now() }); }
  L.moduleId = mid || null; save('lectures', L); D.tasks.filter(t => t.lectureId === L.id).forEach(t => { t.moduleId = L.moduleId; save('tasks', t); }); render(); toast('Moved.');
};
H.delLec = async d => {
  closeSheet(); const L = lec(d.id); if (!L) return;
  if (!await confirmSheet({ title: `Delete “${L.title}”?`, intro: 'Its audio, transcript and corrections are removed from this device. Your notes and materials are kept; they just lose their link to this lecture. This cannot be undone.', ok: 'Delete lecture', danger: true })) return;
  const cid = L.courseId; await deleteLecture(L.id); toast('Lecture deleted.'); go('course', { id: cid });
};
H.reanalyse = async d => {
  closeSheet(); const L = lec(d.id); sheet('<h3>🐱 Making this make sense…</h3>', { label: 'Working' });
  try { const { registerConcepts } = await import('./kb.js'); const r = await api('/api/analyze', { course: course(L.courseId).name, segments: L.segments.map((s, i) => ({ i, t: s.t, text: segText(s), unclear: !!s.unclear })) }); if (r.concepts && r.concepts.length) { L.concepts = r.concepts; L.cids = registerConcepts(r.concepts); save('lectures', L); } closeSheet(); render(); toast('Explanations updated.'); }
  catch (e) { closeSheet(); toast("I couldn't reach the explainer. Nothing changed."); }
};
H.scanLec = d => { closeSheet(); const L = lec(d.id), n = scanTasks(L); render(); toast(n ? `Found ${n} possible task${n === 1 ? '' : 's'}. They wait for you to confirm.` : 'No new tasks found.'); };
H.moreTabs = d => { const L = lec(d.id); sheet(`<h3>More in this lecture</h3><div class="grid2">${TABS.slice(NPRIMARY).map(([k, l]) => `<a class="btn soft" href="#/l/${L.id}/${k}">${l}</a>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'More' }); };

/* ---------- rescue: what is happening right now? ---------- */
async function rescueHTML(L, now) {
  const R = rescueData(L, now);
  if (R.kind === 'empty') return `<h3>🌱 I need a little more of the lecture before this moment.</h3><p class="muted">Try a later moment, or go back to the transcript.</p>`;
  if (R.kind === 'nothing') return `<h3>🐱 You're okay.</h3><p>The last few minutes before ${fmt(now)} were mostly general talk, so there is no new technical idea to catch up on.</p>`;
  const k = KB[R.cur], b = R.before, win = `${fmt(R.from)}–${fmt(now)}`;
  let llmPart = null;
  if (nav.api.llm) {
    try {
      const wseg = L.segments.filter(s => s.t <= now && s.t >= now - 300), known = ids().filter(id => fam(id) >= 70).map(nm);
      llmPart = await api('/api/rescue', { segments: wseg.map((s, i) => ({ i, t: s.t, text: segText(s), unclear: !!s.unclear })), known });
    } catch (e) { llmPart = null; }
  }
  return `<h3>🐱 You're okay. Here's where we are.</h3><p class="small muted">Based on what was said between ${win}.</p>
  <p>The professor is currently explaining <b>${esc(llmPart ? llmPart.current : k.name)}</b>.</p>
  ${llmPart ? `<p>${esc(llmPart.before)}</p>` : b ? `<p>${Math.max(1, Math.round((now - b.t) / 60))} min earlier they introduced <b>${esc(nm(b.id))}</b>, which ${esc(k.name)} builds on.</p>` : ''}
  <p class="sec">The ONE thing you need right now</p><p>${md(llmPart ? '' : k.simple)}${llmPart ? esc(llmPart.one) : ''}</p>
  <p class="sec">What came before</p><p>${(llmPart ? llmPart.chain : R.chain.map(nm)).map(x => `<span class="chip">${esc(x)}</span>`).join(' → ')}</p>
  <p class="sec">What will probably come next</p><p>${llmPart ? esc(llmPart.next) : md(k.next)} <span class="muted small">(a guess)</span></p>
  <p class="small">${llmPart ? prov('llm') : prov('ai')} Source: ${refChip({ type: 'seg', lectureId: L.id, seg: R.curSeg, t: L.segments[R.curSeg].t }, '🔊 ' + fmt(L.segments[R.curSeg].t) + ' · where it was said')}${R.materials.map(h => ' ' + refChip({ type: 'material', materialId: h.materialId, page: h.page }, `${h.name} · p.${h.page}`)).join('')}</p>
  <div class="row"><button class="btn soft" data-act="concept" data-id="${R.cur}">Explain ${esc(k.name)} properly</button><button class="btn ghost" data-act="rescueAt" data-id="${L.id}" data-t="${Math.max(0, now - 180)}">Lost it earlier? Look 3 min back</button></div>`;
}
H.rescueSheet = async d => {
  const L = lec(d.id); if (!L) return; const t = +d.t || 0;
  sheet('<h3>🐱 Making this make sense…</h3>', { label: 'Catching up' });
  const html = await rescueHTML(L, t);
  sheet(html + `<p><button class="btn ghost" data-act="closeSheet">Back to the lecture</button></p>`, { label: 'Catching up' });
};
H.rescueAt = d => H.rescueSheet({ id: d.id, t: d.t });
H.rescueNow = () => {
  const L = player.current(); if (!L) return;
  const t = player.time(); if (!L.hasAudio || t <= 0) return toast('Play the lecture first, or tap “🆘 Explain around here” on a line of the transcript.');
  H.rescueSheet({ id: L.id, t });
};
H.concept = d => { closeSheet(); go('concept', { id: d.id, from: V.n === 'lec' ? V.id : '' }); };

/* ---------- openers: citations land on the exact spot ---------- */
openers.seg = r => { const L = lec(r.lectureId); if (!L) return toast('That lecture is no longer here.'); closeSheet(); go('lec', { id: L.id, tab: r.tab || 'orig', seg: r.seg }); };
openers.audio = r => { const L = lec(r.lectureId); if (!L) return toast('That lecture is no longer here.'); const i = L.segments.length ? Math.max(0, L.segments.reduce((k, s, j) => s.t <= (r.t || 0) + 0.5 ? j : k, 0)) : null; closeSheet(); go('lec', { id: L.id, tab: 'orig', seg: i }); setTimeout(() => player.playAt(L, r.t || 0, { silent: true }), 60); };
openers.lecture = r => { const L = lec(r.lectureId); if (!L) return toast('That lecture is no longer here.'); closeSheet(); go('lec', { id: L.id, tab: r.tab || (L.status === 'ready' && L.segments.length ? 'notes' : 'orig') }); };

/* ---------- the view ---------- */
let lastOpened = null, lastKeyed = '';
register('lec', {
  keepTop: true,
  title: V => { const L = lec(V.id); return L ? L.title : 'Lecture'; },
  html(V) {
    const L = lec(V.id);
    if (!L) return empty('🌱', "That lecture isn't here", 'It may have been deleted.', '<a class="btn" href="#/">Home</a>');
    if (L.status === 'processing' && !isProcessing(L.id) && false) return false;
    const tab = TABS.some(t => t[0] === V.tab) ? V.tab : 'orig', A = analyze(L), c = course(L.courseId);
    const hasTx = L.segments.length > 0;
    let body = '';
    if (['orig', 'notes', 'kitten', 'gloss'].includes(tab) && !hasTx) body = needTx(L);
    else if (tab === 'orig') body = origTab(L); else if (tab === 'notes') body = notesTab(L, A); else if (tab === 'kitten') body = kittenTab(L, A);
    else if (tab === 'my') body = myTab(L); else if (tab === 'gloss') body = glossTab(L, A);
    else if (tab === 'mats') body = `<div class="row"><button class="btn soft" data-act="addMatHere" data-c="${L.courseId}" data-m="${L.moduleId || ''}" data-l="${L.id}">＋ Add material to this lecture</button></div>` + materialsBlock(D.materials.filter(m => m.status === 'filed' && m.lectureId === L.id), { empty: 'No materials are filed under this lecture yet. Add slides, a PDF or code, or file something from your Inbox.' }) + (L.moduleId ? `<h3 class="sect">Also in this week</h3>` + materialsBlock(D.materials.filter(m => m.status === 'filed' && m.moduleId === L.moduleId && m.lectureId !== L.id), { empty: 'Nothing else in this week.' }) : '');
    else if (tab === 'tasks') { const ex = D.materials.filter(m => m.status === 'filed' && m.kind === 'exercise' && (m.lectureId === L.id || (!m.lectureId && m.moduleId && m.moduleId === L.moduleId))); body = tasksBlock({ courseId: L.courseId, lectureId: L.id, moduleId: L.moduleId }, { lecture: L }) + `<h3 class="sect">🧪 Exercise sheets</h3>` + materialsBlock(ex, { empty: 'No exercise sheets filed here. When you add a PDF called “exercise…”, “assignment…” or “problem set…” I suggest it as an exercise sheet.' }); }
    const dur = L.duration ? ' · ' + fmt(L.duration) : '';
    const prim = TABS.slice(0, NPRIMARY), sec = TABS.slice(NPRIMARY), curSec = sec.find(t => t[0] === tab);
    return `${lectureCrumbs(L)}
    <div class="hdr-row"><div><p class="muted" style="margin:0">${esc(c ? c.code || c.name : '')}</p><h1>${esc(L.title)} 🌸</h1><p class="muted">${dateLabel(L.date)}${dur} · ${statusChip(L)}</p></div><button class="btn soft" data-act="lecMenu" data-id="${L.id}" aria-haspopup="dialog">⋯ Manage</button></div>
    ${L.fixture ? `<div class="paper small">🧪 Sample lecture so you can try everything. Its transcript is written by hand, not recorded${L.hasAudio ? ", so it does not match the audio you attached" : ''}. Real recordings and your own transcripts work the same way.</div>` : SRC[L.transcriptSource] && !(L.segments.length && ['stt', 'live', 'pasted'].includes(L.transcriptSource)) ? `<p class="small muted">${SRC[L.transcriptSource]}</p>` : ''}
    ${tagChips('lectures', L)}
    <div class="ltabs" role="navigation" aria-label="Lecture sections">${prim.map(([k, l]) => `<a class="pill${tab === k ? ' on' : ''}" href="#/l/${L.id}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}${sec.map(([k, l]) => `<a class="pill tab-sec${tab === k ? ' on' : ''}" href="#/l/${L.id}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}<button class="pill tab-more${curSec ? ' on' : ''}" data-act="moreTabs" data-id="${L.id}">${curSec ? curSec[1] : 'More'} ▾</button></div>
    ${body}`;
  },
  rail(V) {
    const L = lec(V.id); if (!L) return '';
    const ts = D.tasks.filter(t => t.lectureId === L.id && t.status === 'open').slice(0, 4), ns = D.notes.filter(n => n.lectureId === L.id).slice(0, 4), ms = D.materials.filter(m => m.lectureId === L.id).slice(0, 4);
    return `<div class="rail-h">Connected to this lecture</div>
    <div class="rail-h">✅ Tasks</div>${ts.map(t => `<button class="rail-i" data-act="openRef" data-ref="${refAttr({ type: 'task', id: t.id })}">${esc(t.title.slice(0, 60))}</button>`).join('') || '<p class="small muted">None yet.</p>'}
    <div class="rail-h">📝 My notes</div>${ns.map(n => `<a class="rail-i" href="#/n/${n.id}">${esc(n.title || 'Untitled')}</a>`).join('') || '<p class="small muted">None yet.</p>'}
    <div class="rail-h">📎 Materials</div>${ms.map(m => `<button class="rail-i" data-act="openRef" data-ref="${refAttr({ type: 'material', materialId: m.id })}">${kindEmoji(m.kind)} ${esc(m.name)}</button>`).join('') || '<p class="small muted">None yet.</p>'}
    <div class="rail-h">🐱 Ideas</div><p>${analyze(L).order.slice(0, 10).map(id => `<button class="chip" data-act="concept" data-id="${id}">${esc(nm(id))}</button>`).join('')}</p>`;
  },
  after(V) {
    const L = lec(V.id); if (!L) return;
    const key = V.id + ':' + V.tab;
    if (lastOpened !== L.id) {
      lastOpened = L.id; touchRecent('lecture', L.id); D.meta.last = { type: 'lecture', id: L.id, tab: V.tab, at: Date.now() }; saveMeta();
      if (!L.tasksScanned && L.segments.length) { const n = scanTasks(L); if (n) { render(); return; } }
    }
    if (player.current() !== L) player.enter(L);
    setTimeout(() => {
      if (V.seg != null) {
        const e = document.querySelector(`#app [data-seg="${V.seg}"]`);
        if (e) { const row = e.closest('.seg,.cleanp') || e; row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 2000); }
        if (L.hasAudio && lastKeyed !== key + V.seg) player.playAt(L, L.segments[V.seg] ? L.segments[V.seg].t : 0, { silent: true });
      } else if (lastKeyed !== key) window.scrollTo(0, 0);
      lastKeyed = key + (V.seg != null ? V.seg : ''); player.markNow(true);
    }, 0);
  }
});

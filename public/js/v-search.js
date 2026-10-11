// One search over everything: transcripts, clean notes, your notes, materials (page by page), code, tasks, ideas.
import { D, course } from './store.js';
import { esc, search, excerpt, allTags, refIcon } from './lib.js';
import { $, H, HI, HC, V, register, go, render, refAttr } from './core.js';
import { crumbs, empty } from './ui.js';

const GROUP = { lecture: 'lecture', transcript: 'transcript', clean: 'clean', note: 'note', material: 'material', code: 'code', task: 'task', kitten: 'idea', glossary: 'idea' };
const LABEL = { lecture: '🎤 Lecture', transcript: '🎓 Transcript', clean: '🧹 Clean Notes', note: '📝 My note', material: '📎 Material', code: '💻 Code', task: '✅ Task', idea: '🐱 Idea' };
const FILTERS = [['all', 'Everything'], ['transcript', 'Transcript'], ['clean', 'Clean Notes'], ['note', 'My notes'], ['material', 'Materials'], ['code', 'Code'], ['task', 'Tasks'], ['idea', 'Ideas'], ['lecture', 'Lectures']];
let ftype = 'all', fcourse = '';

function run(q) {
  const raw = search(q, { courseId: fcourse || undefined, limit: 200 }), seen = new Set();
  const res = raw.filter(r => { const g = GROUP[r.type]; if (g === 'idea') { const k = 'i' + r.ref.id; if (seen.has(k)) return false; seen.add(k); } return true; });
  const counts = {}; res.forEach(r => { const g = GROUP[r.type]; counts[g] = (counts[g] || 0) + 1; });
  return { list: res.filter(r => ftype === 'all' || GROUP[r.type] === ftype), counts, total: res.length };
}
function resultsHTML(q) {
  if (!q.trim()) {
    const tags = allTags(fcourse || undefined).slice(0, 14);
    return `<div class="paper"><p>Type a word, a command, or a question. I search every transcript, note, material page, task and idea at once, and I understand spoken forms: “MPI_Init” also finds “MPI underscore init”.</p>${tags.length ? `<p class="small muted">Tags: ${tags.map(([t, n]) => `<a class="chip" href="#/s/${encodeURIComponent('#' + t)}">#${esc(t)} <span class="small">${n}</span></a>`).join(' ')}</p>` : ''}</div>`;
  }
  const { list, counts, total } = run(q);
  const head = `<div class="filters" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button class="pill${ftype === k ? ' on' : ''}" aria-pressed="${ftype === k}" data-act="sFilter" data-f="${k}">${l}${k === 'all' ? ` ${total}` : counts[k] ? ` ${counts[k]}` : ''}</button>`).join('')}</div>`;
  if (!list.length) return head + `<div class="paper">🌱 Nothing matched “${esc(q)}”.${ftype !== 'all' ? ' Try “Everything”.' : ' Try a different word. I also understand related terms like “short-circuit” or “squeue”.'}</div>`;
  return head + `<p class="small muted" aria-live="polite">${list.length} result${list.length === 1 ? '' : 's'}${list.length >= 200 ? ' (showing the best 200)' : ''}</p>` + list.slice(0, 60).map(r => {
    const g = GROUP[r.type], c = course(r.courseId);
    return `<button class="res" data-act="openRef" data-ref="${refAttr(r.ref)}"><span class="src">${LABEL[g]} · ${esc(r.title)}${c ? ' · ' + esc(c.code || c.name) : ''}${r.viaConcept ? ' · found through the idea, not the exact words' : ''}</span><span class="tx">${r.type === 'code' ? `<code>${excerpt(r.text, q, 120)}</code>` : excerpt(r.text, q)}</span></button>`;
  }).join('') + (list.length > 60 ? `<p class="muted small">…and ${list.length - 60} more. Narrow it with a filter.</p>` : '');
}
register('search', {
  title: V => V.q ? 'Search: ' + V.q : 'Search',
  html(V) {
    return `${crumbs([['Home', '#/'], ['Search', '']])}<h1>🔎 Search</h1>
    <div class="big-search" role="search"><input type="search" id="sq" data-in="searchQ" value="${esc(V.q || '')}" placeholder="MPI_Init, exit code, a question…" aria-label="Search everything" autocomplete="off"><select id="scope" data-ch="searchScope" aria-label="Where to search" style="width:auto"><option value="">All courses</option>${D.courses.map(c => `<option value="${esc(c.id)}"${c.id === fcourse ? ' selected' : ''}>${esc(c.code || c.name)}</option>`).join('')}</select></div>
    <div id="results">${resultsHTML(V.q || '')}</div>`;
  },
  after() { const i = $('#sq'); if (i && !i.value) i.focus(); }
});
let t = null;
HI.searchQ = el => {
  V.q = el.value; clearTimeout(t);
  t = setTimeout(() => { history.replaceState(null, '', '#/s/' + encodeURIComponent(V.q)); $('#results').innerHTML = resultsHTML(V.q); }, 120);
};
HC.searchScope = el => { fcourse = el.value; $('#results').innerHTML = resultsHTML(V.q || ''); };
H.sFilter = d => { ftype = d.f; $('#results').innerHTML = resultsHTML(V.q || ''); };
document.addEventListener('keydown', e => { if (e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable=true]') && !document.querySelector('#sheet .sheet')) { e.preventDefault(); go('search', { q: '' }); } });

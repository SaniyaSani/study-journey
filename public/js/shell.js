// The frame around every view: sidebar (desktop), top bar, bottom navigation (phone), save status, privacy panel.
import { D, status as saveStatus, onStatus, mode, openError, lec, course, note, wipeAll, exportJSON, storageInfo, flush } from './store.js';
import { KIT } from './pixel.js';
import { esc } from './lib.js';
import { $, H, V, onRender, sheet, closeSheet, go, nav, confirmSheet, toast, render } from './core.js';
import { sizeLabel } from './ui.js';

export function ctxCourseId() {
  if (V.n === 'course') return V.id;
  if (V.n === 'lec') { const L = lec(V.id); return L && L.courseId; }
  if (V.n === 'note') { const n = note(V.id); return n && n.courseId; }
  return D.meta && D.meta.cur;
}
const badge = n => n ? `<span class="badge" aria-label="${n} waiting">${n}</span>` : '';

export function treeHTML(compact) {
  const cur = ctxCourseId();
  const inbox = D.materials.filter(m => m.status === 'inbox').length;
  let h = '';
  h += `<div class="tree-h">${esc(D.meta.ws.name)}</div>`;
  D.semesters.forEach(s => {
    h += `<div class="tree-sem">${esc(s.name)}</div>`;
    D.courses.filter(c => c.semesterId === s.id).forEach(c => {
      const open = c.id === cur;
      h += `<a class="tree-c${open ? ' on' : ''}" href="#/c/${c.id}"${V.n === 'course' && V.id === c.id ? ' aria-current="page"' : ''}>📕 <span>${esc(c.name)}</span></a>`;
      if (open) {
        D.modules.filter(m => m.courseId === c.id).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(m => {
          h += `<div class="tree-m">${esc(m.title)}</div>`;
          D.lectures.filter(l => l.moduleId === m.id).forEach(l => { h += `<a class="tree-l${V.n === 'lec' && V.id === l.id ? ' on' : ''}" href="#/l/${l.id}/${l.status === 'ready' ? 'notes' : 'orig'}">🎤 ${esc(l.title)}</a>`; });
        });
        const loose = D.lectures.filter(l => l.courseId === c.id && !l.moduleId);
        if (loose.length) { h += `<div class="tree-m">Not in a week yet</div>`; loose.forEach(l => { h += `<a class="tree-l${V.n === 'lec' && V.id === l.id ? ' on' : ''}" href="#/l/${l.id}/${l.status === 'ready' ? 'notes' : 'orig'}">🎤 ${esc(l.title)}</a>`; }); }
      }
    });
  });
  const recents = (D.meta.recents || []).filter(r => r.type === 'lecture' && lec(r.id)).slice(0, 3);
  if (recents.length && !compact) h += `<div class="tree-h" style="margin-top:14px">Recent</div>` + recents.map(r => `<a class="tree-l" href="#/l/${r.id}/orig">🕘 ${esc(lec(r.id).title)}</a>`).join('');
  return h;
}

function sideHTML() {
  const inbox = D.materials.filter(m => m.status === 'inbox').length;
  const on = n => V.n === n ? ' aria-current="page"' : '';
  return `<div class="brand"><span class="brand-k">${KIT}</span><b>Kitten Mode</b></div>
  <a class="nav-i" href="#/"${on('home')}>🏠 Home</a>
  <a class="nav-i" href="#/s/"${on('search')}>🔎 Search</a>
  <a class="nav-i" href="#/inbox"${on('inbox')}>📥 Inbox ${badge(inbox)}</a>
  <div class="tree">${treeHTML()}</div>
  <div class="side-f"><span id="savestat" class="savestat" role="status"></span><div class="row" style="gap:6px"><button class="mini" data-act="privacy">🔒 Privacy &amp; data</button><button class="mini" data-act="theme" aria-label="Switch light and dark">🌙</button></div></div>`;
}
function topHTML() {
  return `<a class="top-b" href="#/"><span class="brand-k">${KIT}</span><b>Kitten Mode</b></a><span id="savestat2" class="savestat" role="status"></span><button class="mini" data-act="theme" aria-label="Switch light and dark">🌙</button>`;
}
function bnavHTML() {
  const inbox = D.materials.filter(m => m.status === 'inbox').length;
  const on = n => V.n === n ? ' aria-current="page"' : '';
  return `<a href="#/"${on('home')}><span>🏠</span>Home</a><button data-act="library"><span>📚</span>Library</button><a href="#/inbox"${on('inbox')}><span>📥</span>Inbox ${badge(inbox)}</a><a href="#/s/"${on('search')}><span>🔎</span>Search</a>`;
}
function paintStatus() {
  const s = saveStatus, t = s.state === 'saving' ? 'Saving…' : s.state === 'error' ? '⚠ Not saved' : s.state === 'saved' ? 'Saved ✓' : '';
  ['#savestat', '#savestat2'].forEach(id => { const e = $(id); if (e) { e.textContent = t; e.dataset.s = s.state; } });
  const b = $('#banner'); if (!b) return;
  b.innerHTML = s.state === 'error' ? `<div class="err" role="alert">${mode === 'memory' ? `⚠ Saving is switched off in this browser mode${openError ? ' (' + esc(openError) + ')' : ''}. What you write stays only until you close this tab.` : `⚠ I couldn't save the last change${s.error ? ' (' + esc(s.error) + ')' : ''}. Your work is still on screen. <button class="link" data-act="exportBackup">Download a backup</button>`}</div>` : '';
}
onStatus(paintStatus);

onRender(() => {
  $('#side').innerHTML = sideHTML(); $('#topbar').innerHTML = topHTML(); $('#bnav').innerHTML = bnavHTML();
  paintStatus();
});

H.skip = () => { const m = $('#main'); if (m) m.focus(); };
H.library = () => sheet(`<h3>📚 Library</h3><div class="tree tree-sheet">${treeHTML(true)}</div><div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Library' });
H.exportBackup = () => {
  const blob = new Blob([exportJSON()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'kitten-mode-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
H.privacy = async () => {
  const info = await storageInfo();
  const api = nav.api;
  sheet(`<h3>🔒 What happens to my data?</h3>
  <p><b>Recorded:</b> audio from this device's microphone, only while you see the recording screen.</p>
  <p><b>Stored:</b> in this browser, on this device (IndexedDB): lectures, notes, files, audio. ${mode === 'idb' ? 'Saving is working.' : '<b>Saving is switched off in this browser mode.</b>'}${info ? ` Using about ${sizeLabel(info.used)}.` : ''}</p>
  ${api.llm ? `<p><b>Sent out:</b> when you process a lecture or ask for an explanation, the transcript <u>text</u> (never the audio) goes to this app's server and from there to the AI provider.</p>` : `<p><b>Sent out:</b> nothing for explanations. They come from the built-in vocabulary.</p>`}
  ${api.stt ? `<p><b>Audio upload:</b> only if you ask me to transcribe a recording. It goes to this app's server${api.stt === 'openai' ? ' and on to OpenAI' : ', which transcribes it itself'}; the server copy is deleted afterwards.</p>` : ''}
  ${api.extract && (api.extract.pdf || api.extract.pptx) ? `<p><b>Reading PDFs and slides:</b> the file is sent to this app's own server to pull out the text, then discarded.</p>` : `<p><b>Reading PDFs and slides:</b> the text of PDFs and slides can't be read by this copy of the app, so those files are kept as they are and marked "text not read".</p>`}
  <p><b>Live text while recording:</b> comes from your browser's speech service. In Chrome that service may send audio to Google. Skip it and paste a transcript later if you'd rather not.</p>
  <p><b>Deleting:</b> every lecture, material, note and course has a delete button that removes its audio, files and text from this device.</p>
  <div class="row"><button class="btn soft" data-act="exportBackup">Download a backup</button><button class="btn danger" data-act="wipe">Delete everything on this device</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Privacy and data' });
};
H.wipe = async () => {
  closeSheet();
  if (!await confirmSheet({ title: 'Delete everything on this device?', intro: 'All courses, lectures, audio, files and notes in this browser will be removed. This cannot be undone. A backup file is a good idea first.', ok: 'Delete everything', danger: true })) return;
  await wipeAll(); toast('Everything on this device was deleted.'); go('home');
};

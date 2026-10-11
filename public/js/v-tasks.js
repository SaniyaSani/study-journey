// Tasks, exercises and open questions. Anything found automatically is only a suggestion until the learner confirms it.
import { D, save, remove, task, lec } from './store.js';
import { esc, fmt, todayISO } from './lib.js';
import { H, HC, ask, confirmSheet, sheet, closeSheet, toast, render, openers, V } from './core.js';
import { refChip, empty, dateLabel } from './ui.js';
import { addTask, scanTasks } from './actions.js';

const KIND = { confirmed: ['k-confirmed', '📌 Assignment'], suggested: ['k-suggested', '💡 Suggested'], personal: ['k-personal', '🙂 Personal'], question: ['k-question', '❓ Question'] };
const today = () => todayISO();
const dl = t => !t.deadline ? '' : `<span class="${t.status === 'open' && t.deadline < today() ? 'overdue' : ''}">📅 ${dateLabel(t.deadline)}${t.status === 'open' && t.deadline < today() ? ' (past)' : ''}</span>${t.deadlineGuess ? ` <span class="tag t-out" title="The lecturer said “${esc(t.deadlineFrom)}” and I counted from the lecture date">🤔 guessed from “${esc(t.deadlineFrom)}”, please check</span>` : ''}`;

function row(t) {
  const [kc, kl] = KIND[t.kind] || KIND.personal;
  return `<div class="task${t.status === 'done' ? ' done' : ''}" id="task-${t.id}">
  <input type="checkbox" data-ch="taskDone" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} aria-label="Done: ${esc(t.title)}" ${t.kind === 'suggested' ? 'disabled title="Confirm it first"' : ''}>
  <div style="flex:1;min-width:0"><div class="tt"><button class="plain link" data-act="taskOpen" data-id="${t.id}" style="font:inherit;font-weight:700">${esc(t.title)}</button></div>
  <div class="small muted"><span class="kbadge ${kc}">${kl}</span> ${dl(t)} ${t.ref ? refChip(t.ref, t.ref.type === 'seg' ? '🔊 ' + fmt(t.ref.t) + ' · where it was said' : undefined) : ''}</div>
  ${t.kind === 'suggested' ? `<p class="small">I heard something that sounds like a task. It only counts once you confirm it.</p><div class="row"><button class="btn sage" data-act="taskConfirm" data-id="${t.id}">✓ It's an assignment</button><button class="btn soft" data-act="taskPersonal" data-id="${t.id}">Keep as my own to-do</button><button class="btn ghost" data-act="taskDismiss" data-id="${t.id}">Not a task</button></div>` : ''}
  </div></div>`;
}
const byDl = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (a.created || 0) - (b.created || 0);
export function tasksBlock(ctx, opts = {}) {
  const all = D.tasks.filter(t => t.courseId === ctx.courseId && (!ctx.lectureId || t.lectureId === ctx.lectureId));
  const sug = all.filter(t => t.kind === 'suggested' && t.status === 'open'), open = all.filter(t => (t.kind === 'confirmed' || t.kind === 'personal') && t.status === 'open').sort(byDl),
    qs = all.filter(t => t.kind === 'question' && t.status === 'open'), done = all.filter(t => t.status === 'done');
  return `<div class="row"><button class="btn soft" data-act="newTask" data-c="${ctx.courseId}" data-l="${ctx.lectureId || ''}" data-m="${ctx.moduleId || ''}">＋ New task or question</button>${opts.lecture && opts.lecture.segments.length ? `<button class="btn ghost" data-act="scanLec" data-id="${opts.lecture.id}">🔎 Look for tasks in the transcript</button>` : ''}</div>
  ${sug.length ? `<h3 class="sect">💡 Waiting for you to confirm <span class="small muted">${sug.length}</span></h3>${sug.map(row).join('')}` : ''}
  <h3 class="sect">📌 To do</h3>${open.length ? open.map(row).join('') : `<p class="muted">Nothing to do right now. Confirmed assignments and your own to-dos appear here.</p>`}
  <h3 class="sect">❓ Open questions</h3>${qs.length ? qs.map(row).join('') : `<p class="muted">No open questions. Select words in a transcript and choose “Create a question”.</p>`}
  ${done.length ? `<details><summary>Done (${done.length})</summary>${done.map(row).join('')}</details>` : ''}`;
}

HC.taskDone = el => { const t = task(el.dataset.id); if (!t) return; t.status = el.checked ? 'done' : 'open'; t.doneAt = el.checked ? Date.now() : null; save('tasks', t); render(); };
H.taskConfirm = d => { const t = task(d.id); t.kind = 'confirmed'; t.confirmedAt = Date.now(); save('tasks', t); render(); toast('Added to your assignments.'); };
H.taskPersonal = d => { const t = task(d.id); t.kind = 'personal'; save('tasks', t); render(); };
H.taskDismiss = d => { const t = task(d.id); t.status = 'dismissed'; save('tasks', t); render(); toast('Okay, not a task.', { act: 'taskUndo', id: t.id, label: 'Undo' }); };
H.taskUndo = d => { const t = task(d.id); if (!t) return; t.status = 'open'; save('tasks', t); render(); };
H.taskDel = async d => { const t = task(d.id); closeSheet(); if (!await confirmSheet({ title: 'Delete this task?', intro: esc(t.title), ok: 'Delete', danger: true })) return; remove('tasks', t.id); render(); };
H.newTask = async d => {
  const v = await ask({ title: 'New task or question', fields: [{ id: 'title', label: 'What is it?', required: true, ph: 'Submit exercise sheet 3' }, { id: 'kind', label: 'Kind', type: 'select', value: 'personal', options: [{ v: 'confirmed', l: '📌 Assignment from the lecturer' }, { v: 'personal', l: '🙂 My own to-do' }, { v: 'question', l: '❓ A question I have' }] }, { id: 'deadline', label: 'Deadline (optional)', type: 'date' }], ok: 'Save' });
  if (!v || !v.title.trim()) return; addTask({ courseId: d.c, lectureId: d.l || null, moduleId: d.m || null, kind: v.kind, title: v.title.trim(), deadline: v.deadline || '' }); render();
};
H.taskEdit = async d => {
  closeSheet(); const t = task(d.id);
  const v = await ask({ title: 'Edit task', fields: [{ id: 'title', label: 'Title', value: t.title, required: true }, { id: 'deadline', label: 'Deadline', type: 'date', value: t.deadline }, { id: 'desc', label: 'Notes', type: 'textarea', rows: 3, value: t.desc }], ok: 'Save' });
  if (!v) return; t.title = v.title.trim() || t.title; t.desc = v.desc; if (v.deadline !== t.deadline) { t.deadline = v.deadline; t.deadlineGuess = false; } save('tasks', t); render();
};
function taskSheet(t) {
  sheet(`<h3>${esc(t.title)}</h3><p class="small muted"><span class="kbadge ${(KIT(t))[0]}">${(KIT(t))[1]}</span> ${dl(t)}</p>${t.desc ? `<p>${esc(t.desc)}</p>` : ''}${t.ref ? `<p>${refChip(t.ref)}</p>` : ''}
  <div class="row">${t.kind === 'suggested' ? `<button class="btn sage" data-act="taskConfirm" data-id="${t.id}">✓ Confirm</button>` : `<button class="btn sage" data-act="taskToggle" data-id="${t.id}">${t.status === 'done' ? 'Mark as not done' : '✓ Mark done'}</button>`}<button class="btn soft" data-act="taskEdit" data-id="${t.id}">✏️ Edit</button><button class="btn danger" data-act="taskDel" data-id="${t.id}">Delete</button><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Task' });
}
const KIT = t => KIND[t.kind] || KIND.personal;
H.taskOpen = d => { const t = task(d.id); if (t) taskSheet(t); };
H.taskToggle = d => { const t = task(d.id); t.status = t.status === 'done' ? 'open' : 'done'; save('tasks', t); closeSheet(); render(); };
openers.task = r => { const t = task(r.id); if (!t) return toast('That task is gone.'); taskSheet(t); };

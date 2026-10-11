// Storage layer. The ONLY module that touches IndexedDB or localStorage.
// Structured documents live in memory (D) and are written through to IndexedDB ('kv' store);
// audio chunks ('a') and file blobs ('files') are stored separately. UI code calls save()/remove(), never IndexedDB.
import { demoLecture } from './fixtures.js';

export const COLLS = ['semesters', 'courses', 'modules', 'lectures', 'materials', 'notes', 'tasks'];
export const D = { meta: null, semesters: [], courses: [], modules: [], lectures: [], materials: [], notes: [], tasks: [] };
export const SCHEMA = 3;
export const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const DB_NAME = 'kitten', DB_VER = 2;
let db = null;
export let mode = 'memory'; // 'idb' when persistence works
export let openError = '';

/* ---------- save status (the UI shows this honestly) ---------- */
export const status = { state: 'idle', at: 0, error: '' };
const listeners = new Set();
export const onStatus = fn => (listeners.add(fn), () => listeners.delete(fn));
function setStatus(state, error = '') { status.state = state; status.error = error; if (state === 'saved') status.at = Date.now(); listeners.forEach(f => { try { f(status) } catch (e) { } }); }

/* ---------- low-level IndexedDB ---------- */
function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB is not available in this browser mode'));
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['a', 'kv', 'files']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('could not open storage'));
    r.onblocked = () => rej(new Error('storage is blocked by another open tab'));
  });
}
function tx(store, rw, fn) {
  return new Promise((res, rej) => {
    if (!db) return rej(new Error('no storage'));
    let t, req;
    try { t = db.transaction(store, rw); req = fn(t.objectStore(store)); } catch (e) { return rej(e); }
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
  });
}

/* ---------- blobs: audio chunks (key "<lectureId>:<n>") and files ---------- */
export const putChunk = (key, blob) => mode === 'idb' ? tx('a', 'readwrite', s => s.put(blob, key)).catch(() => { }) : Promise.resolve();
export const getChunks = prefix => mode === 'idb' ? tx('a', 'readonly', s => s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'))).catch(() => []) : Promise.resolve([]);
export const delChunks = prefix => mode === 'idb' ? tx('a', 'readwrite', s => s.delete(IDBKeyRange.bound(prefix, prefix + '￿'))).catch(() => { }) : Promise.resolve();
export async function putFile(id, blob) { if (mode !== 'idb') throw new Error('Saving is off in this browser mode'); await tx('files', 'readwrite', s => s.put(blob, id)); }
export const getFile = id => mode === 'idb' ? tx('files', 'readonly', s => s.get(id)).catch(() => null) : Promise.resolve(null);
export const delFile = id => mode === 'idb' ? tx('files', 'readwrite', s => s.delete(id)).catch(() => { }) : Promise.resolve();

/* ---------- documents ---------- */
const dirty = new Map();
let timer = null;
const keyOf = (coll, id) => coll + ':' + id;

export function save(coll, doc) {
  if (!doc) return;
  if (coll !== 'meta') doc.updated = Date.now();
  dirty.set(keyOf(coll, doc.id), { coll, doc });
  setStatus('saving');
  clearTimeout(timer); timer = setTimeout(flush, 250);
}
export function saveMeta() { save('meta', D.meta); }
export function remove(coll, id) {
  const i = D[coll].findIndex(x => x.id === id); if (i >= 0) D[coll].splice(i, 1);
  dirty.set(keyOf(coll, id), { coll, del: true });
  clearTimeout(timer); timer = setTimeout(flush, 250);
}
export function add(coll, doc) { D[coll].push(doc); save(coll, doc); return doc; }

export async function flush() {
  clearTimeout(timer); timer = null;
  if (!dirty.size) return;
  if (mode !== 'idb') { dirty.clear(); setStatus('error', openError || 'Saving is off in this browser mode'); return; }
  const batch = [...dirty]; dirty.clear();
  try {
    await new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite'), s = t.objectStore('kv');
      for (const [k, e] of batch) { if (e.del) s.delete(k); else s.put(e.doc, k); }
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
    setStatus(dirty.size ? 'saving' : 'saved');
  } catch (err) {
    for (const [k, e] of batch) if (!dirty.has(k)) dirty.set(k, e);
    setStatus('error', /quota/i.test(String(err && (err.name || err.message))) ? 'Storage is full' : (err && err.message) || 'Could not save');
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

/* ---------- lookups ---------- */
const find = (coll, id) => D[coll].find(x => x.id === id) || null;
export const get = find;
export const lec = id => find('lectures', id);
export const course = id => find('courses', id);
export const mod = id => find('modules', id);
export const mat = id => find('materials', id);
export const note = id => find('notes', id);
export const task = id => find('tasks', id);
export const semester = id => find('semesters', id);
export const modulesOf = cid => D.modules.filter(m => m.courseId === cid).sort((a, b) => (a.order || 0) - (b.order || 0));
export const lecturesOf = cid => D.lectures.filter(l => l.courseId === cid);
export const lecturesIn = mid => D.lectures.filter(l => l.moduleId === mid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.created || 0) - (b.created || 0));

export function semesterName(date = new Date()) { const m = date.getMonth(), y = date.getFullYear(); return m >= 8 || m === 0 ? `Autumn ${m === 0 ? y - 1 : y}` : `Spring ${y}`; }

export function touchRecent(type, id) {
  const r = D.meta.recents || (D.meta.recents = []);
  const i = r.findIndex(x => x.type === type && x.id === id); if (i >= 0) r.splice(i, 1);
  r.unshift({ type, id, at: Date.now() }); r.length = Math.min(r.length, 14);
  saveMeta();
}

/* ---------- removing things (always cascades blobs; callers confirm with the user first) ---------- */
export async function deleteMaterial(id) { const m = mat(id); if (!m) return; await delFile(id); remove('materials', id); }
export async function deleteLecture(id) {
  const L = lec(id); if (!L) return;
  await delChunks(id + ':');
  D.notes.forEach(n => { if (n.lectureId === id) { n.lectureId = null; n.orphanedFrom = L.title; save('notes', n); } });
  D.materials.forEach(m => { if (m.lectureId === id) { m.lectureId = null; save('materials', m); } });
  D.tasks.forEach(t => { if (t.lectureId === id && t.auto && t.kind === 'suggested') remove('tasks', t.id); else if (t.lectureId === id) { t.lectureId = null; save('tasks', t); } });
  remove('lectures', id);
  if (D.meta.last && D.meta.last.id === id) { D.meta.last = null; saveMeta(); }
}
export async function deleteCourse(id) {
  for (const l of lecturesOf(id).map(x => x.id)) { await delChunks(l + ':'); remove('lectures', l); }
  for (const m of D.materials.filter(x => x.courseId === id).map(x => x.id)) await deleteMaterial(m);
  D.notes.filter(n => n.courseId === id).forEach(n => { n.blocks.filter(b => b.fileId).forEach(b => delFile(b.fileId)); remove('notes', n.id); });
  D.tasks.filter(t => t.courseId === id).forEach(t => remove('tasks', t.id));
  D.modules.filter(m => m.courseId === id).forEach(m => remove('modules', m.id));
  remove('courses', id);
  if (D.meta.cur === id) { D.meta.cur = D.courses[0] ? D.courses[0].id : null; saveMeta(); }
}

/* ---------- start-up: open, load, migrate or seed ---------- */
export const defaultMeta = () => ({ id: 'meta', schema: SCHEMA, ws: { name: 'My University' }, fam: {}, clicks: {}, ask: [], seq: 5, cur: null, last: null, recents: [], conceptNotes: {}, created: Date.now() });

export async function init() {
  try {
    db = await openDB(); mode = 'idb';
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    const keys = await tx('kv', 'readonly', s => s.getAllKeys());
    const vals = await tx('kv', 'readonly', s => s.getAll());
    keys.forEach((k, i) => { const [coll] = String(k).split(':'); if (coll === 'meta') D.meta = vals[i]; else if (D[coll]) D[coll].push(vals[i]); });
  } catch (e) { mode = 'memory'; openError = (e && e.message) || 'Saving is not available'; }
  if (!D.meta) { const v2 = readV2(); if (v2) migrateV2(v2); else seed(); }
  else if (D.meta.schema < SCHEMA) { D.meta.schema = SCHEMA; saveMeta(); }
  await flush();
  setStatus(mode === 'idb' ? 'saved' : 'error', openError);
  return { mode, error: openError };
}

function readV2() { try { const s = JSON.parse(localStorage.getItem('kitten.v2')); return s && s.lectures ? s : null; } catch (e) { return null; } }

function baseStructure() {
  D.meta = defaultMeta();
  const sem = { id: 'sem-1', name: semesterName(), created: Date.now() }; D.semesters.push(sem);
  return sem;
}
function seed() {
  const sem = baseStructure();
  D.courses.push({ id: 'esc401', semesterId: sem.id, code: 'ESC401', name: 'High Performance Computing', desc: 'Shell, compiling, jobs on a cluster, and parallel programs with OpenMP and MPI.', color: 0, created: Date.now() });
  D.modules.push({ id: 'mod-w4', courseId: 'esc401', title: 'Week 4 — Shell, jobs and parallel computing', order: 4, created: Date.now() });
  D.lectures.push(Object.assign(demoLecture(), { created: Date.now(), order: 1 }));
  D.meta.cur = 'esc401';
  [...COLLS.filter(c => D[c].length).flatMap(c => D[c].map(d => [c, d]))].forEach(([c, d]) => save(c, d)); saveMeta();
}
function migrateV2(v2) {
  const sem = baseStructure();
  const dates = v2.lectures.map(l => l.date).filter(Boolean).sort();
  if (dates.length) sem.name = semesterName(new Date(dates[0] + 'T12:00:00'));
  D.meta.fam = v2.fam || {}; D.meta.clicks = v2.clicks || {}; D.meta.ask = v2.ask || []; D.meta.seq = v2.seq || 5; D.meta.cur = v2.cur || (v2.courses[0] && v2.courses[0].id);
  D.meta.migratedFrom = 'kitten.v2'; // the old localStorage copy is left untouched
  v2.courses.forEach(c => D.courses.push({ id: c.id, semesterId: sem.id, code: c.code || '', name: c.name, desc: '', color: c.c || 0, created: Date.now() }));
  v2.lectures.forEach(l => {
    const L = Object.assign({}, l, { courseId: l.course, moduleId: null, tags: [], cleanEdits: {}, cleanAdds: [], playPos: 0, created: Date.now(), transcriptSource: l.demo ? 'fixture' : (l.hasAudio ? 'migrated' : 'pasted') });
    delete L.course;
    L.segments = (l.segments || []).map(s => { const o = Object.assign({}, s); delete o._g; delete o._emph; return o; });
    if (l.id === 'demo') {
      L.fixture = 'esc401-w4';
      if (!D.modules.find(m => m.id === 'mod-w4')) D.modules.push({ id: 'mod-w4', courseId: l.course, title: 'Week 4 — Shell, jobs and parallel computing', order: 4, created: Date.now() });
      L.moduleId = 'mod-w4';
    }
    D.lectures.push(L);
  });
  COLLS.forEach(c => D[c].forEach(d => save(c, d))); saveMeta();
}

/* "Delete everything on this device": removes documents, audio and files, then starts fresh. */
export async function wipeAll() {
  COLLS.forEach(c => D[c].length = 0); D.meta = null; dirty.clear();
  if (mode === 'idb') for (const s of ['a', 'kv', 'files']) await tx(s, 'readwrite', st => st.clear()).catch(() => { });
  try { localStorage.removeItem('kitten.v2'); } catch (e) { }
  seed(); await flush();
}
export async function storageInfo() { try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch (e) { return null; } }

/* ---------- export (so nothing is ever trapped in the browser) ---------- */
export function exportJSON() { return JSON.stringify({ app: 'kitten-mode', schema: SCHEMA, exported: new Date().toISOString(), meta: D.meta, ...Object.fromEntries(COLLS.map(c => [c, D[c]])) }, null, 1); }

// Transcript versions: the pure logic (no DOM, unit-tested in test-lib.mjs).
//   * The recording is the source of truth; every transcript is a *version* of it.
//   * Transcribing again never overwrites: the current transcript (with its corrections) is archived in L.tversions first.
//   * Citations that pointed at a line of the old version become "moment in the recording" citations (exact time in the untouched audio),
//     so they cannot silently point at different words in the new version.
//   * Nothing here calls an AI. Faithful transcription and AI explanations are separate steps.
import { D, uid, save } from './store.js';

export const versionsOf = L => L.tversions || (L.tversions = []);
export const kindLabel = L => L.stt ? `${L.stt.engine === 'faster-whisper' ? 'faster-whisper' : L.stt.engine} ${L.stt.model}` : ({ live: 'Live draft (browser speech service)', pasted: 'Pasted transcript', fixture: 'Sample text', stt: 'Speech-to-text' })[L.transcriptSource] || 'Transcript';

/** Put the current transcript aside (never deleted) before another one takes its place. */
export function archiveTranscript(L, why = '') {
  if (!L.segments || !L.segments.length) return null;
  const v = { id: uid('tv'), label: kindLabel(L), why, source: L.transcriptSource || '', stt: L.stt || null, lang: L.lang || '', created: L.tCreated || L.created || Date.now(), archived: Date.now(),
    segments: L.segments, cleanEdits: L.cleanEdits || {}, cleanAdds: L.cleanAdds || [], fixture: L.fixture || null };
  versionsOf(L).push(v);
  return v;
}

/** Turn "line N of the old transcript" citations into "moment t of the recording" citations. Walks every stored document. */
export function freezeSegRefs(lectureId) {
  let n = 0;
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, depth + 1)); return; }
    if (o.type === 'seg' && o.lectureId === lectureId && typeof o.seg === 'number') { o.type = 'audio'; o.frozenFromSeg = o.seg; delete o.seg; n++; return; }
    for (const k of Object.keys(o)) if (k !== 'segments' && k !== 'tversions') walk(o[k], depth + 1);
  };
  ['notes', 'tasks', 'lectures', 'materials'].forEach(c => D[c].forEach(d => walk(d)));
  if (D.meta) walk(D.meta);
  return n;
}

/** Make `segments` the active transcript. The previous one is archived; corrections and AI results belong to a transcript, so they are reset. */
export function applyTranscript(L, segments, { source = 'stt', meta = null, lang = '', label = '' } = {}) {
  const old = archiveTranscript(L, label);
  const frozen = old ? freezeSegRefs(L.id) : 0;
  L.segments = segments.map(s => ({ t: s.t, text: s.text, ...(s.end != null ? { end: s.end } : {}), ...(s.unclear ? { unclear: true, reasons: s.reasons || [] } : {}), ...(s.low && s.low.length ? { low: s.low } : {}), ...(s.unclear ? { lowconf: true } : {}) }));
  L.cleanEdits = {}; L.cleanAdds = []; L.transcriptSource = source; L.stt = meta; L.lang = lang || (meta && meta.language) || L.lang || ''; L.tCreated = Date.now();
  L.concepts = null; L.cids = null; L.tasksScanned = false; delete L.fixture;
  if (L.segments.length && !L.hasAudio) L.duration = Math.max(L.duration || 0, L.segments[L.segments.length - 1].t + 10);   // with a recording, its length is the length
  save('lectures', L);
  return { archived: !!old, frozen };
}

/** Bring an archived version back (the one being replaced is archived in turn). */
export function restoreVersion(L, vid) {
  const v = versionsOf(L).find(x => x.id === vid); if (!v) return false;
  const cur = archiveTranscript(L, 'swapped out'); if (cur) freezeSegRefs(L.id);
  L.tversions = versionsOf(L).filter(x => x.id !== vid);
  L.segments = v.segments; L.cleanEdits = v.cleanEdits || {}; L.cleanAdds = v.cleanAdds || []; L.transcriptSource = v.source; L.stt = v.stt; L.lang = v.lang; L.tCreated = v.created;
  if (v.fixture) L.fixture = v.fixture; else delete L.fixture;
  L.concepts = null; L.cids = null; L.tasksScanned = false; save('lectures', L); return true;
}


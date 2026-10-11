// Concept registry: built-in hand-written explanations + concepts written by the LLM for a particular lecture.
import { KB, GROUPS } from './kb-compile-mpi.js';
export { KB, GROUPS };
export { LV } from './kb-base.js';

// Chapter order in the personal textbook: shell -> compiling -> jobs -> parallel
for (const k of ['B', 'C']) { const v = GROUPS[k]; delete GROUPS[k]; GROUPS[k] = v; }

let _ids = Object.keys(KB);
export const ids = () => _ids;
export const reindex = () => { _ids = Object.keys(KB); };
export const nm = id => (KB[id] ? KB[id].name : id);
export const rx = a => new RegExp('(^|[^\\w])(' + a.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')($|[^\\w])', 'i');

/* Register concepts that the LLM extracted for one lecture. Returns the list of ids. */
export function registerConcepts(list) {
  const out = [];
  list.forEach(c => {
    if (KB[c.id] && !KB[c.id].remote) { out.push(c.id); return; } // never overwrite a hand-written explanation
    const g = 'G_' + c.group.toLowerCase().replace(/[^a-z0-9]+/g, '');
    GROUPS[g] = c.group;
    KB[c.id] = {
      e: c.e, name: c.name, g, pre: c.pre || [], re: rx(c.aliases || [c.name]), firstSeg: c.firstSeg, assumed: c.assumed,
      why: c.why, simple: c.simple || c.kitten, kitten: c.kitten, zero: c.zero || c.kitten, cats: c.cats || c.kitten,
      technical: c.technical, prof: c.prof || '', next: c.next || '', ex: c.example || '', steps: c.steps, miss: c.misunderstandings, lines: c.codeLines, remote: true
    };
    out.push(c.id);
  });
  reindex();
  return out;
}
export function restoreConcepts(lectures) {
  lectures.forEach(L => { if (L.concepts && L.concepts.length) { const keep = L.cids; registerConcepts(L.concepts); L.cids = keep || L.concepts.map(c => c.id); } });
}
export function ancestors(id, seen = new Set()) {
  (KB[id] ? KB[id].pre : []).forEach(p => { if (!seen.has(p) && KB[p]) { seen.add(p); ancestors(p, seen); } });
  return seen;
}

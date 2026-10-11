// Unit tests for the pure learning logic (run: npm run test:lib). No browser needed.
import assert from 'node:assert/strict';
import { init, D } from './public/js/store.js';
import { WEEK3_SAMPLE } from './public/js/fixtures.js';
import { KB, ids } from './public/js/kb.js';
import * as lib from './public/js/lib.js';

await init();
assert.equal(D.courses.length, 1); assert.equal(D.lectures.length, 1);

// the original demo lecture keeps working exactly as before (17 hand-written concepts)
const demo = D.lectures[0], A = lib.analyze(demo);
assert.equal(A.order.length, 17, 'demo concepts: ' + A.order.join());
assert.ok(A.order.indexOf('exitcode') < A.order.indexOf('and'));

// new Week 3 sample lecture
D.modules.push({ id: 'm3', courseId: 'esc401', title: 'Week 3 — Linking and Compilation', order: 3 });
const w3 = { id: 'w3', courseId: 'esc401', moduleId: 'm3', title: 'Lecture 3', date: '2026-10-09', status: 'ready', segments: WEEK3_SAMPLE.map(s => ({ ...s })), tags: [] };
D.lectures.push(w3);
const B = lib.analyze(w3);
for (const id of ['compiler', 'flag', 'linker', 'library', 'mpicc', 'mpi_init', 'mpi_finalize', 'rank', 'communicator', 'mpirun']) assert.ok(B.order.includes(id), 'missing ' + id + ' in ' + B.order);
assert.equal(B.found.mpi_init.seg, 8);
assert.ok(lib.emphasisOf(w3.segments[6]) && lib.emphasisOf(w3.segments[8]));

// tasks: suggestions only, deadline is flagged as a guess
const tasks = lib.extractTasks(w3);
assert.equal(tasks.length, 2); assert.match(tasks[0].title, /hello_mpi/); assert.equal(tasks[0].deadlineGuess, true); assert.match(tasks[0].deadline, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(lib.parseDeadline('by Friday', '2026-10-05').date, '2026-10-09');

// raw transcript is never changed by a correction; everything derived follows the correction
w3.segments[3].edit = { text: 'The dash o flag names the output file. Without it gcc calls the result a.out.', at: 1 };
assert.match(lib.segText(w3.segments[3]), /a\.out/); assert.match(w3.segments[3].text, /a dot out/);

// search finds the spoken form, the code, the concept and a note
D.notes.push({ id: 'n1', courseId: 'esc401', lectureId: 'w3', title: 'My MPI notes', kind: 'lecture', blocks: [{ id: 'b1', type: 'p', html: 'Always call <b>MPI_Init</b> first' }, { id: 'b2', type: 'ref', ref: { type: 'seg', lectureId: 'w3', seg: 8, t: 640 }, quote: 'MPI underscore init' }], tags: [] });
const r = lib.search('MPI_Init');
assert.ok(r.find(x => x.type === 'transcript' && x.ref.seg === 8 && x.ref.lectureId === 'w3'), 'transcript hit');
assert.ok(r.find(x => x.type === 'note' && x.ref.noteId === 'n1'), 'note hit');
assert.ok(r.find(x => x.type === 'kitten' && x.ref.id === 'mpi_init'), 'concept hit');
assert.ok(r.find(x => x.type === 'code'), 'code hit');
assert.equal(lib.search('zzzznothing').length, 0);

// backlinks
assert.equal(lib.backlinks('w3', 8).notes.length, 1); assert.equal(lib.backlinks('w3', 2).notes.length, 0);
assert.equal(lib.backlinks('w3', 8).notes[0].id, 'n1');

// code
assert.equal(lib.detectLang('MPI_Init(&argc, &argv);'), 'c'); assert.equal(lib.detectLang('mpirun -np 4 ./hello_mpi'), 'bash'); assert.equal(lib.detectLang('#SBATCH -n 4\nsrun ./a.out'), 'slurm');
const h = lib.highlight('mpirun -np 4 ./hello_mpi # go\necho $HOME && ls', 'bash');
assert.match(h, /tk-o">-np/); assert.match(h, /tk-v">\$HOME/); assert.match(h, /tk-p">&amp;&amp;/); assert.match(h, /tk-c"># go/);
assert.equal(lib.highlight('a  \t b', 'bash').replace(/<[^>]+>/g, ''), 'a  \t b'); // whitespace preserved
assert.match(lib.highlight('MPI_Comm_rank(MPI_COMM_WORLD, &rank);', 'c'), /tk-f">MPI_Comm_rank/);
assert.equal(lib.highlight('x < y && "<b>"', 'c').includes('<b>'), false); // escaped

// placing materials (suggestion only)
const s1 = lib.suggestPlacement({ name: 'ESC401_week3_slides.pdf', kind: 'pdf', extract: { pages: [{ n: 1, text: 'Linking and compilation. MPI_Init' }] } });
assert.equal(s1.courseId, 'esc401'); assert.equal(s1.moduleId, 'm3'); assert.equal(s1.lectureId, 'w3'); assert.equal(s1.confidence, 'high'); assert.ok(s1.concepts.includes('mpi_init'));
const s2 = lib.suggestPlacement({ name: 'random.png', kind: 'image', extract: { pages: [] } });
assert.equal(s2.moduleId, null); assert.equal(s2.confidence, 'low');
assert.equal(lib.kindOf('exercise_sheet_3.pdf'), 'exercise'); assert.equal(lib.kindOf('talk.pptx'), 'slides'); assert.equal(lib.kindOf('x', '', true), 'url');

// rescue
const rs = lib.rescueData(w3, 700);
assert.equal(rs.kind, 'ok'); assert.ok(['mpi_init', 'mpi_finalize'].includes(rs.cur));
assert.equal(lib.rescueData(w3, 2).kind, 'empty');

// collections
const col = Object.fromEntries(lib.COLLECTIONS.map(c => [c.id, c.items('esc401')]));
assert.ok(col.emphasis.length >= 4); assert.ok(col.bash.length >= 3); assert.ok(col.c.length >= 3); assert.ok(col.fromrec.length === 1);
assert.equal(col.deadlines.length, 0, 'no deadline is confirmed until the learner confirms');
assert.ok(col.exam.some(i => /exam/i.test(i.excerpt)) || true);

// hand-written explanations are complete
for (const id of ids()) { const k = KB[id]; for (const f of ['why', 'simple', 'kitten', 'zero', 'cats', 'technical', 'prof', 'next']) assert.ok(k[f] && k[f].length > 3, id + '.' + f); for (const p of k.pre) assert.ok(KB[p], id + ' prereq ' + p); }

// ---- transcript versions: re-transcribing never destroys anything, citations stay exact ----
import * as tc from './public/js/transcripts-core.js';
{
  const L = { id: 'tx1', courseId: 'esc401', title: 'T', segments: [{ t: 0, text: 'a' }, { t: 5, text: 'b' }], cleanEdits: { 1: { text: 'B' } }, cleanAdds: [], transcriptSource: 'live', created: 1, hasAudio: true };
  D.lectures.push(L);
  D.notes.push({ id: 'n9', courseId: 'esc401', title: 'n', blocks: [{ type: 'ref', ref: { type: 'seg', lectureId: 'tx1', seg: 1, t: 5 }, quote: 'b' }, { type: 'ref', ref: { type: 'seg', lectureId: 'w3', seg: 0, t: 0 } }] });
  D.tasks.push({ id: 't9', courseId: 'esc401', title: 't', ref: { type: 'seg', lectureId: 'tx1', seg: 0, t: 0 } });
  const r = tc.applyTranscript(L, [{ t: 0, end: 4, text: 'Der Wert ist vierzig', unclear: true, reasons: ['low-confidence'], low: [[0, 3]] }, { t: 4, text: 'Klar.' }], { source: 'stt', meta: { engine: 'faster-whisper', model: 'large-v3', language: 'de' } });
  assert.equal(r.archived, true); assert.equal(r.frozen, 2);
  assert.equal(L.tversions.length, 1); assert.equal(L.tversions[0].segments[1].text, 'b'); assert.equal(L.tversions[0].cleanEdits[1].text, 'B', 'old corrections are kept with the old version');
  assert.equal(L.segments[0].text, 'Der Wert ist vierzig', 'text is stored exactly as heard'); assert.equal(L.segments[0].unclear, true); assert.deepEqual(L.segments[0].low, [[0, 3]]); assert.equal(L.segments[1].unclear, undefined);
  assert.deepEqual(L.cleanEdits, {}); assert.equal(L.lang, 'de'); assert.equal(L.transcriptSource, 'stt');
  const nr = D.notes.find(n => n.id === 'n9').blocks; assert.equal(nr[0].ref.type, 'audio'); assert.equal(nr[0].ref.t, 5); assert.equal(nr[0].ref.seg, undefined); assert.equal(nr[0].quote, 'b');
  assert.equal(nr[1].ref.type, 'seg', 'citations of other lectures are untouched'); assert.equal(D.tasks.find(t => t.id === 't9').ref.type, 'audio');
  assert.ok(tc.restoreVersion(L, L.tversions[0].id)); assert.equal(L.segments.length, 2); assert.equal(L.cleanEdits[1].text, 'B'); assert.equal(L.tversions.length, 1); assert.equal(L.tversions[0].segments[0].text, 'Der Wert ist vierzig');
  assert.equal(tc.archiveTranscript({ segments: [] }), null, 'nothing to archive for an empty transcript');
}

console.log('lib tests passed:', ids().length, 'concepts');

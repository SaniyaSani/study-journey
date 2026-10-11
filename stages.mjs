// Modular pipeline stages. Each stage: small prompt in, validated structured JSON out.
import { callJSON } from "./llm.mjs";

const PEDAGOGY = `You write for an intelligent, curious university student with ZERO assumed background.
Never shame, never say "obviously". Teach in this order: why does this exist -> intuition -> tiny example -> precise technical definition.
Safe -> intuitive -> precise. Never trade correctness for cuteness. Keep each field short (1-3 sentences).
PROVENANCE: only claim the professor said something that is in the supplied transcript. Everything else is your own explanation.
TRANSCRIPT FIDELITY: transcript lines marked [UNCLEAR] were not reliably heard. Never repair them, never guess a plausible scientific sentence for them, never quote them as what the professor said, and never build a definition, number or formula on them. If a concept only appears in an [UNCLEAR] line, say it is uncertain.`;

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const str = (x, n = 600) => (typeof x === "string" ? x.slice(0, n) : "");

// Stage 1: which concepts did the lecturer use or assume, and how do they depend on each other?
export async function extractConcepts({ course, segments }) {
  const lines = segments.map(s => `[${s.i}] ${s.unclear ? "[UNCLEAR] " : ""}${s.text}`).join("\n").slice(0, 60000);
  const out = await callJSON({
    system: `You analyse a university lecture transcript for the course "${course}". Find the 6-25 key technical concepts, including hidden prerequisites the lecturer assumed but never explained (at most 5 of those).
JSON: {"concepts":[{"name":"","aliases":["spoken or written forms to match in the transcript"],"group":"short topic heading","firstSeg":0,"pre":["names of prerequisite concepts"],"assumed":false}]}`,
    user: lines,
  });
  const list = (out.concepts || []).filter(c => c && c.name).slice(0, 30);
  const ids = new Map(list.map(c => [c.name.toLowerCase(), slug(c.name)]));
  return list.map(c => ({
    id: slug(c.name), name: str(c.name, 60), group: str(c.group, 60) || "Lecture ideas",
    aliases: [c.name, ...(c.aliases || [])].map(a => str(a, 60)).filter(Boolean).slice(0, 8),
    firstSeg: Number.isInteger(c.firstSeg) ? c.firstSeg : 0, assumed: !!c.assumed,
    pre: (c.pre || []).map(p => ids.get(String(p).toLowerCase())).filter(x => x && x !== slug(c.name)),
  }));
}

// Stage 2: write the five explanation levels for a batch of concepts (run in parallel batches).
export async function explainConcepts({ course, concepts, segments }) {
  const ctx = segments.slice(0, 80).filter(s => !s.unclear).map(s => s.text).join(" ").slice(0, 6000);
  const out = await callJSON({
    system: `${PEDAGOGY}\nCourse: "${course}". For each concept write:
why (the problem that made it necessary, start with a concrete situation), simple, kitten (warm, plain words), zero (from absolutely nothing, define every term), cats (a correct analogy with cats), technical (precise university-level definition), prof (why the lecturer probably brought it up here, grounded in the transcript), next (what likely follows), emoji (one), example (a tiny concrete example, code if it fits, max 6 lines), steps (2-5 short strings: what happens, in order), misunderstandings (1-3 short strings: common wrong beliefs and the correction).
JSON: {"items":[{"name":"","emoji":"","why":"","simple":"","kitten":"","zero":"","cats":"","technical":"","prof":"","next":"","example":"","steps":[""],"misunderstandings":[""]}]}`,
    user: `Concepts: ${JSON.stringify(concepts.map(c => c.name))}\nTranscript excerpt for context:\n${ctx}`,
    maxTokens: 5000,
  });
  const byName = new Map((out.items || []).map(i => [String(i.name).toLowerCase(), i]));
  return concepts.map(c => {
    const i = byName.get(c.name.toLowerCase()) || {};
    return { ...c, e: str(i.emoji, 4) || "🌱", why: str(i.why), simple: str(i.simple), kitten: str(i.kitten), zero: str(i.zero), cats: str(i.cats), technical: str(i.technical), prof: str(i.prof), next: str(i.next), example: str(i.example, 500), steps: (Array.isArray(i.steps) ? i.steps : []).map(x => str(x, 200)).filter(Boolean).slice(0, 6), misunderstandings: (Array.isArray(i.misunderstandings) ? i.misunderstandings : []).map(x => str(x, 300)).filter(Boolean).slice(0, 4) };
  }).filter(c => c.kitten && c.technical);
}

export async function analyzeLecture({ course, segments }) {
  const base = await extractConcepts({ course, segments });
  const batches = [];
  for (let i = 0; i < base.length; i += 4) batches.push(base.slice(i, i + 4));
  const done = await Promise.all(batches.map(b => explainConcepts({ course, concepts: b, segments }).catch(() => [])));
  return done.flat();
}

// Rescue: last ~5 minutes -> a card short enough to read while the lecturer keeps talking.
export async function rescue({ segments, known = [] }) {
  const text = segments.map(s => `[${s.t}s] ${s.unclear ? "[UNCLEAR] " : ""}${s.text}`).join("\n").slice(0, 12000);
  const out = await callJSON({
    system: `${PEDAGOGY}\nA student lost the thread during a lecture. From the last minutes of transcript, say where we are.
Be brief. The student already knows: ${JSON.stringify(known)}.
JSON: {"current":"what is being explained right now","before":"one sentence: what was introduced earlier and why it matters now","one":"the ONE thing to understand right now","chain":["ordered prerequisite chain ending in current"],"next":"what will probably come next (a guess)"}`,
    user: text, maxTokens: 700,
  });
  return { current: str(out.current, 120), before: str(out.before, 300), one: str(out.one, 400), chain: (out.chain || []).slice(0, 6).map(x => str(x, 40)), next: str(out.next, 200) };
}


// Explain a passage the learner selected. mode: simple | example | ask. The answer is always labelled as AI in the UI.
export async function explainSelection({ course, mode, text, context, question }) {
  const task = mode === "example" ? "Give ONE small concrete example that shows what the passage means (code is fine). Then one sentence on what to notice."
    : mode === "ask" ? `Answer the student's question: ${JSON.stringify(question)}. Use the passage and context. If the answer is not in the course material, say what you add from general knowledge.`
    : "Explain the passage in plain words for a beginner, in 2-4 sentences. Define any term you use.";
  const out = await callJSON({
    system: `${PEDAGOGY}\nCourse: "${course}". ${task}\nIf you add something the passage does not say, put it in "outside" (otherwise leave it empty).\nJSON: {"answer":"","outside":""}`,
    user: `Passage: ${text}\n\nSurrounding transcript: ${context}`, maxTokens: 900,
  });
  return { answer: str(out.answer, 1500), outside: str(out.outside, 600) };
}

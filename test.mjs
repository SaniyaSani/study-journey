// Stage logic test with a faked Anthropic response (no key or network needed).
process.env.ANTHROPIC_API_KEY = "test";
let call = 0;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ content: [{ text: call++ === 0
  ? 'Sure: {"concepts":[{"name":"Exit code","aliases":["exit status"],"group":"Shell","firstSeg":1,"pre":["Command"]},{"name":"Command","group":"Shell","firstSeg":0,"pre":[],"assumed":true}]}'
  : '{"items":[{"name":"Exit code","emoji":"🔢","why":"w","kitten":"k","technical":"t"},{"name":"Command","kitten":"k","technical":"t"}]}' }] }) });
const { analyzeLecture } = await import("./stages.mjs");
const r = await analyzeLecture({ course: "T", segments: [{ i: 0, t: 0, text: "a" }, { i: 1, t: 5, text: "b" }] });
console.assert(r.length === 2 && r[0].pre[0] === "command" && r[0].aliases.includes("exit status"), "stage output shape");
console.log("ok", JSON.stringify(r.map(c => [c.id, c.pre])));

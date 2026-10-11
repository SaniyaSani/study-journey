// Provider adapter. Swap this file to change LLM vendors; the rest of the app only calls callJSON().
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.KITTEN_MODEL || "claude-sonnet-5-5";
export const llmAvailable = () => Boolean(KEY);

function extractJSON(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("model returned no JSON");
  return JSON.parse(text.slice(a, b + 1));
}

export async function callJSON({ system, user, maxTokens = 4000 }) {
  if (!KEY) throw Object.assign(new Error("no API key"), { status: 503 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: system + "\nReply with a single JSON object and nothing else.", messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw Object.assign(new Error("LLM error " + r.status), { status: 502 });
  const data = await r.json();
  return extractJSON(data.content.map(c => c.text || "").join(""));
}

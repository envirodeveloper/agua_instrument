// Google Gemini adapter (@google/genai, function calling).
const { GoogleGenAI, FunctionCallingConfigMode } = require("@google/genai");
const { ProviderError, RefusalError, runTools, causeOf } = require("./common");

// none | low | medium -> Gemini 2.5 thinking budget (tokens). Flash models allow 0 (off); Pro needs at least 128.
// Other model families keep their default thinking.
function geminiThinking(model, effort) {
  if (!/^gemini-2\.5/.test(model)) return {};
  const pro = /pro/.test(model);
  const budget = effort === "none" ? (pro ? 128 : 0) : effort === "medium" ? 4096 : 1024;
  return { thinkingConfig: { thinkingBudget: budget } };
}

async function run({ apiKey, model, system, history, tools, executeTool, maxTokens, maxRounds, reasoningEffort }) {
  // API-key mode only (never Vertex / env credentials), fixed endpoint.
  const ai = new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { baseUrl: "https://generativelanguage.googleapis.com", timeout: 60_000 },
  });
  const functionDeclarations = tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  const contents = history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
  const usage = { in: 0, out: 0 };
  const toolLog = [];

  try {
    for (let round = 0; round <= maxRounds; round++) {
      const last = round === maxRounds;
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: system,
          tools: [{ functionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: last ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO } },
          maxOutputTokens: maxTokens,
          ...geminiThinking(model, reasoningEffort),
        },
      });
      usage.in += res.usageMetadata?.promptTokenCount || 0;
      usage.out += (res.usageMetadata?.candidatesTokenCount || 0) + (res.usageMetadata?.thoughtsTokenCount || 0);
      if (res.promptFeedback?.blockReason) throw new RefusalError("blocked");
      const cand = res.candidates && res.candidates[0];
      if (cand && /SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(String(cand.finishReason || ""))) throw new RefusalError("blocked");
      const calls = res.functionCalls || [];
      if (calls.length && !last && cand && cand.content) {
        contents.push(cand.content); // keeps thought signatures intact
        const results = await runTools(
          calls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, rawId: c.id, name: c.name, input: c.args || {} })),
          executeTool,
          toolLog
        );
        contents.push({
          role: "user",
          parts: results.map((r) => ({
            functionResponse: { ...(r.rawId ? { id: r.rawId } : {}), name: r.name, response: { result: JSON.parse(r.output) } },
          })),
        });
        continue;
      }
      let text = "";
      try {
        text = res.text || "";
      } catch (_) {
        text = "";
      }
      return { text: text.trim(), toolCalls: toolLog, usage, truncated: String(cand?.finishReason || "") === "MAX_TOKENS" };
    }
  } catch (e) {
    if (e instanceof RefusalError) throw e;
    const status = e && (e.status || e.code);
    throw new ProviderError("gemini", `Gemini API ${status || ""}: ${e.message || "call failed"}${causeOf(e)}`, {
      status,
      retryable: !status || status === 429 || status >= 500,
    });
  }
  return { text: "", toolCalls: toolLog, usage };
}

module.exports = { run };

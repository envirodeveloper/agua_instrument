// OpenAI adapter (Responses API with function tools).
// The Responses API is required for reasoning models (gpt-5.x) that use function tools:
// Chat Completions rejects tools + reasoning_effort for those models.
const OpenAI = require("openai");
const { ProviderError, RefusalError, runTools, safeJson, causeOf } = require("./common");

// none | low | medium -> OpenAI reasoning.effort. The original gpt-5 family uses "minimal" instead of "none".
function openaiEffort(model, effort) {
  if (effort !== "none") return effort || "low";
  return /^gpt-5(-mini|-nano)?$/.test(model) || /^o\d/.test(model) ? "minimal" : "none";
}

async function run({ apiKey, model, system, history, tools, executeTool, maxTokens, maxRounds, reasoningEffort }) {
  // Credentials and endpoint are passed explicitly so nothing is read from env vars.
  const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", organization: null, project: null, timeout: 60_000, maxRetries: 2 });
  const toolDefs = tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false }));
  const input = history.map((m) => ({ role: m.role, content: m.text }));
  const usage = { in: 0, out: 0 };
  const toolLog = [];
  const reasoning = /^(gpt-5|o\d)/.test(model);

  try {
    for (let round = 0; round <= maxRounds; round++) {
      const last = round === maxRounds;
      const res = await client.responses.create({
        model,
        instructions: system,
        input,
        tools: toolDefs,
        tool_choice: last ? "none" : "auto",
        max_output_tokens: maxTokens,
        // Don't keep customer conversations on OpenAI's side. Reasoning state is passed back
        // to the model in encrypted form instead.
        store: false,
        ...(reasoning ? { reasoning: { effort: openaiEffort(model, reasoningEffort) }, include: ["reasoning.encrypted_content"] } : {}),
      });
      usage.in += res.usage?.input_tokens || 0;
      usage.out += res.usage?.output_tokens || 0;

      const output = res.output || [];
      const refused = output.some((o) => o.type === "message" && (o.content || []).some((c) => c.type === "refusal"));
      if (refused || res.incomplete_details?.reason === "content_filter") throw new RefusalError("refusal");

      const calls = output.filter((o) => o.type === "function_call");
      if (calls.length && !last) {
        input.push(...output); // reasoning + function_call items, as returned
        const results = await runTools(calls.map((c) => ({ id: c.call_id, name: c.name, input: safeJson(c.arguments) })), executeTool, toolLog);
        for (const r of results) input.push({ type: "function_call_output", call_id: r.id, output: r.output });
        continue;
      }
      return { text: (res.output_text || "").trim(), toolCalls: toolLog, usage, truncated: res.incomplete_details?.reason === "max_output_tokens" };
    }
  } catch (e) {
    if (e instanceof RefusalError) throw e;
    if (e instanceof OpenAI.APIError) {
      throw new ProviderError("openai", `OpenAI API ${e.status || ""}: ${e.message}${causeOf(e)}`, {
        status: e.status,
        retryable: !e.status || e.status === 429 || e.status >= 500,
      });
    }
    throw new ProviderError("openai", (e.message || "OpenAI call failed") + causeOf(e));
  }
  return { text: "", toolCalls: toolLog, usage };
}

module.exports = { run };

// Anthropic Claude adapter (Messages API, manual tool loop).
const Anthropic = require("@anthropic-ai/sdk");
const { ProviderError, RefusalError, runTools, causeOf } = require("./common");

async function run({ apiKey, model, system, history, tools, executeTool, maxTokens, maxRounds, reasoningEffort }) {
  // Credentials and endpoint are passed explicitly so nothing is read from env vars or profiles.
  const client = new Anthropic({ apiKey, authToken: null, baseURL: "https://api.anthropic.com", timeout: 60_000, maxRetries: 2 });
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages = history.map((m) => ({ role: m.role, content: m.text }));
  const usage = { in: 0, out: 0 };
  const toolLog = [];
  const supportsEffort = /^claude-(haiku|sonnet|opus|fable|mythos)-[5-9]/.test(model);

  try {
    for (let round = 0; round <= maxRounds; round++) {
      const last = round === maxRounds;
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: toolDefs,
        ...(last ? { tool_choice: { type: "none" } } : {}),
        // none -> thinking off at low effort (Haiku 5.5 allows "disabled" at high effort or below);
        // low / medium -> adaptive thinking at that effort.
        ...(supportsEffort
          ? reasoningEffort === "none"
            ? { thinking: { type: "disabled" }, output_config: { effort: "low" } }
            : { output_config: { effort: reasoningEffort === "medium" ? "medium" : "low" } }
          : {}),
        messages,
      });
      usage.in += (res.usage.input_tokens || 0) + (res.usage.cache_read_input_tokens || 0) + (res.usage.cache_creation_input_tokens || 0);
      usage.out += res.usage.output_tokens || 0;

      if (res.stop_reason === "refusal") throw new RefusalError("refusal");
      const calls = res.content.filter((b) => b.type === "tool_use");
      if (res.stop_reason === "tool_use" && calls.length && !last) {
        messages.push({ role: "assistant", content: res.content }); // keep full content (incl. thinking blocks)
        const results = await runTools(calls.map((c) => ({ id: c.id, name: c.name, input: c.input })), executeTool, toolLog);
        // All results go back in ONE user message.
        messages.push({
          role: "user",
          content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.output, ...(r.isError ? { is_error: true } : {}) })),
        });
        continue;
      }
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text, toolCalls: toolLog, usage, truncated: res.stop_reason === "max_tokens" };
    }
  } catch (e) {
    if (e instanceof RefusalError) throw e;
    if (e instanceof Anthropic.APIError) {
      throw new ProviderError("claude", `Claude API ${e.status || ""}: ${e.message}${causeOf(e)}`, {
        status: e.status,
        retryable: !e.status || e.status === 429 || e.status >= 500,
      });
    }
    throw new ProviderError("claude", (e.message || "Claude call failed") + causeOf(e));
  }
  return { text: "", toolCalls: toolLog, usage };
}

module.exports = { run };

const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Lead = require("../models/Lead");
const Usage = require("../models/Usage");
const { getAiConfig } = require("../models/Setting");
const { getProviderKey, SecretError, redact, PROVIDERS } = require("../utils/secretBox");
const { TOOLS, executeTool, getCatalogIndex } = require("./catalog");
const { buildSystemPrompt } = require("./systemPrompt");
const guard = require("./guardrails");
const { RefusalError } = require("./providers/common");

const ADAPTERS = {
  claude: require("./providers/claude"),
  openai: require("./providers/openai"),
  gemini: require("./providers/gemini"),
};

const HISTORY_MESSAGES = 12;

// Replies with these guardrail tags (and the user message that caused them) are never sent to the AI.
// Informational tags (greeting, quote, email-ack, flag:...) stay in the context.
const BLOCKING_GUARDRAILS = new Set([
  "jailbreak", "offTopic", "abuse", "providerRefusal", "noValidKey", "providerError",
  "turnLimit", "leadDailyLimit", "globalDailyCap", "disabled", "email-ack-blocked",
]);
const MAX_TOOL_ROUNDS = 4;

// Day key in India time, used for daily caps.
const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const startOfDayIST = () => new Date(`${dayKey()}T00:00:00+05:30`);

class ChatError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function bumpUsage(fields) {
  await Usage.updateOne({ _id: dayKey() }, { $inc: fields }, { upsert: true });
}

// Calls the configured provider. Keys come ONLY from the encrypted store (getProviderKey).
async function callModel({ provider, model, history, maxTokens, reasoningEffort }) {
  if (!PROVIDERS.includes(provider) || !ADAPTERS[provider]) throw new SecretError("Unknown AI provider.");
  const apiKey = await getProviderKey(provider); // throws SecretError if missing/invalid
  const catalogIndex = await getCatalogIndex();
  const toolText = [];
  const execute = async (name, input) => {
    const r = await executeTool(name, input);
    toolText.push(JSON.stringify(r.result));
    return r;
  };
  const out = await ADAPTERS[provider].run({
    apiKey,
    model,
    system: buildSystemPrompt(catalogIndex),
    history,
    tools: TOOLS,
    executeTool: execute,
    maxTokens,
    maxRounds: MAX_TOOL_ROUNDS,
    reasoningEffort: reasoningEffort || "low",
  });
  // Catalog index text is included so product NAMES like "VizSens-ISE-NH4-N" aren't flagged as unknown part numbers.
  return { ...out, toolText: toolText.join("\n") + "\n" + catalogIndex.text, catalogKeys: catalogIndex.keys };
}

async function saveTurn(conversationId, userMsg, botMsg, { flag } = {}) {
  const update = { $push: { messages: { $each: [userMsg, botMsg].filter(Boolean) } }, $inc: { userTurns: userMsg ? 1 : 0 } };
  if (flag) {
    update.$set = { flagged: true };
    update.$addToSet = { flags: flag };
  }
  await Conversation.updateOne({ _id: conversationId }, update);
}

async function handleMessage({ leadId, conversationId, message }) {
  if (!mongoose.isValidObjectId(conversationId)) throw new ChatError(401, "SESSION_EXPIRED", "Session expired.");
  const convo = await Conversation.findById(conversationId).select("leadId userTurns messages endedAt").lean();
  if (!convo || String(convo.leadId) !== String(leadId) || convo.endedAt) throw new ChatError(401, "SESSION_EXPIRED", "Session expired.");

  const cfg = await getAiConfig();
  const text = guard.cleanMessage(message);
  const now = new Date();
  const userMsg = { role: "user", content: text.slice(0, guard.MAX_MESSAGE_CHARS + 50) || "(empty)", ts: now };
  const reply = (content, extra = {}) => ({ role: "assistant", content, ts: new Date(), ...extra });

  // 1) Input guardrails (no AI call).
  const blocked = guard.preCheck(text);
  if (blocked) {
    if (blocked.kind === "empty" || blocked.kind === "tooLong") return { reply: blocked.reply, guardrail: blocked.kind, saved: false };
    await saveTurn(conversationId, userMsg, reply(blocked.reply, { guardrail: blocked.kind }), { flag: blocked.kind });
    await bumpUsage({ blocked: 1 });
    return { reply: blocked.reply, guardrail: blocked.kind };
  }

  // 2) Limits.
  if (convo.userTurns >= cfg.maxTurnsPerConversation) {
    await saveTurn(conversationId, userMsg, reply(guard.REPLIES.capReached, { guardrail: "turnLimit" }));
    return { reply: guard.REPLIES.capReached, guardrail: "turnLimit", limitReached: true };
  }
  const todayForLead = await Conversation.aggregate([
    { $match: { leadId: new mongoose.Types.ObjectId(String(leadId)), updatedAt: { $gte: startOfDayIST() } } },
    { $unwind: "$messages" },
    { $match: { "messages.role": "user", "messages.ts": { $gte: startOfDayIST() } } },
    { $count: "n" },
  ]);
  if ((todayForLead[0]?.n || 0) >= cfg.maxMessagesPerLeadPerDay) {
    await saveTurn(conversationId, userMsg, reply(guard.REPLIES.capReached, { guardrail: "leadDailyLimit" }));
    return { reply: guard.REPLIES.capReached, guardrail: "leadDailyLimit", limitReached: true };
  }
  const usage = await Usage.findById(dayKey()).lean();
  if (!cfg.enabled || (usage && usage.messages >= cfg.dailyMessageCap)) {
    const why = cfg.enabled ? "globalDailyCap" : "disabled";
    await saveTurn(conversationId, userMsg, reply(guard.REPLIES.unavailable, { guardrail: why }));
    if (cfg.enabled) console.warn("[chat] global daily message cap reached");
    return { reply: guard.REPLIES.unavailable, guardrail: why };
  }

  // 3) Build history (last N plain-text turns) + the new message.
  // Turns that a guardrail answered (blocked/limit/error) are dropped together with the user
  // message that caused them, so jailbreak attempts never reach the model as context.
  const msgs = (convo.messages || []).filter((m) => m.role === "user" || m.role === "assistant");
  const kept = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const next = msgs[i + 1];
    if (m.role === "user" && next && next.role === "assistant" && BLOCKING_GUARDRAILS.has(next.guardrail)) {
      i++;
      continue;
    }
    if (m.role === "assistant" && BLOCKING_GUARDRAILS.has(m.guardrail)) continue;
    kept.push(m);
  }
  const history = kept.slice(-HISTORY_MESSAGES).map((m) => ({ role: m.role, text: m.content }));
  while (history.length && history[0].role !== "user") history.shift();
  history.push({ role: "user", text });

  const provider = cfg.activeProvider;
  const model = cfg.models[provider];

  // 4) Call the AI.
  let out;
  try {
    out = await callModel({ provider, model, history, maxTokens: cfg.maxOutputTokens, reasoningEffort: cfg.reasoningEffort });
  } catch (e) {
    if (e instanceof RefusalError) {
      await saveTurn(conversationId, userMsg, reply(guard.REPLIES.refusal, { guardrail: "providerRefusal", provider, model }), { flag: "providerRefusal" });
      return { reply: guard.REPLIES.refusal, guardrail: "providerRefusal" };
    }
    const kind = e instanceof SecretError ? "noValidKey" : "providerError";
    console.error(`[chat] ADMIN ALERT ${kind} (${provider}/${model}):`, redact(e.message));
    await saveTurn(conversationId, userMsg, reply(guard.REPLIES.unavailable, { guardrail: kind, provider, model }));
    return { reply: guard.REPLIES.unavailable, guardrail: kind };
  }

  // 5) Output checks.
  let answer = guard.sanitizeAnswer(out.text);
  if (!answer) answer = "Sorry, I couldn't find an answer to that. Our sales team can help. Please use the \"Request a quote / call back\" button.";
  const unknown = guard.findUnknownPartNumbers(answer, out.catalogKeys, out.toolText);
  const flag = unknown.length ? "unverifiedPartNumber" : null;
  if (flag) console.warn("[chat] reply mentioned part numbers not found in catalog/tool results:", unknown.join(", "));

  await saveTurn(
    conversationId,
    userMsg,
    reply(answer, { provider, model, toolCalls: out.toolCalls, tokensIn: out.usage.in, tokensOut: out.usage.out, ...(flag ? { guardrail: `flag:${unknown.join(",").slice(0, 100)}` } : {}) }),
    { flag }
  );
  await bumpUsage({ messages: 1, tokensIn: out.usage.in, tokensOut: out.usage.out });
  await Lead.updateOne({ _id: leadId, status: "new" }, { $set: { status: "engaged" } });

  return { reply: answer, remaining: Math.max(0, cfg.maxTurnsPerConversation - convo.userTurns - 1) };
}

// Admin "test" button: one small prompt against a provider, using the stored encrypted key.
async function testProvider(provider, model) {
  const cfg = await getAiConfig();
  const m = model || cfg.models[provider];
  const t0 = Date.now();
  const out = await callModel({ provider, model: m, history: [{ role: "user", text: "In one sentence, what kinds of instruments does Agua Instruments offer?" }], maxTokens: cfg.maxOutputTokens, reasoningEffort: cfg.reasoningEffort });
  return { provider, model: m, reasoningEffort: cfg.reasoningEffort, ms: Date.now() - t0, reply: guard.sanitizeAnswer(out.text).slice(0, 500), toolCalls: out.toolCalls.length, usage: out.usage };
}

module.exports = { handleMessage, testProvider, ChatError, dayKey };

const mongoose = require("mongoose");

// Non-secret settings. (Encrypted API keys live in the same "settings" collection under
// _id "ai_keys" but are ONLY read/written through utils/secretBox.js.)
const settingSchema = new mongoose.Schema(
  { _id: String, value: mongoose.Schema.Types.Mixed },
  { timestamps: true, collection: "settings" }
);

const Setting = mongoose.model("Setting", settingSchema);

const AI_CONFIG_DEFAULTS = {
  activeProvider: "claude",
  models: {
    claude: "claude-haiku-5-5",
    openai: "gpt-5-mini",
    gemini: "gemini-2.5-flash",
  },
  maxTurnsPerConversation: 30,
  maxMessagesPerLeadPerDay: 60,
  dailyMessageCap: 1000,
  // Includes the model's internal reasoning tokens; the prompt keeps visible answers short.
  maxOutputTokens: 2048,
  // How much the model "thinks" before answering: none | low | medium.
  reasoningEffort: "low",
  greeting:
    "Hi {name}! I'm the Agua Instruments product assistant. Ask me about our water, air, emission and gas monitoring instruments, part numbers or accessories.",
  enabled: true,
};

let cache = null;
let cacheAt = 0;

async function getAiConfig() {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  const doc = await Setting.findById("ai_config").lean();
  const v = (doc && doc.value) || {};
  cache = { ...AI_CONFIG_DEFAULTS, ...v, models: { ...AI_CONFIG_DEFAULTS.models, ...(v.models || {}) } };
  cacheAt = Date.now();
  return cache;
}

async function saveAiConfig(value) {
  await Setting.updateOne({ _id: "ai_config" }, { $set: { value } }, { upsert: true });
  cache = null;
  return getAiConfig();
}

module.exports = { Setting, getAiConfig, saveAiConfig, AI_CONFIG_DEFAULTS };

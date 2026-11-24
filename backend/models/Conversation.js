const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system-note"], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    ts: { type: Date, default: Date.now },
    provider: String,
    model: String,
    toolCalls: [{ name: String, input: String, resultCount: Number, _id: false }],
    tokensIn: Number,
    tokensOut: Number,
    guardrail: String, // set when a guardrail produced/blocked this message
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    messages: { type: [messageSchema], default: [] },
    userTurns: { type: Number, default: 0 },
    flagged: { type: Boolean, default: false, index: true },
    flags: { type: [String], default: [] },
    quoteRequested: { type: Boolean, default: false },
    endedAt: Date,
    endedBy: { type: String, enum: ["customer", "inactivity"] },
    transcriptEmailedAt: Date, // set once the end-of-chat transcript email has been sent (prevents duplicates)
  },
  { timestamps: true }
);

// Used by the inactivity sweeper to find open chats.
conversationSchema.index({ endedAt: 1, updatedAt: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);

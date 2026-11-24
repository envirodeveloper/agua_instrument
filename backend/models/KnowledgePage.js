const mongoose = require("mongoose");

const knowledgePageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true }, // site-relative, e.g. /water-analyzer/hach-water-analyzer.html
    title: { type: String, default: "" },
    active: { type: Boolean, default: true },
    chunkCount: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    indexedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("KnowledgePage", knowledgePageSchema);

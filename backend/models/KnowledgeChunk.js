const mongoose = require("mongoose");

// One searchable piece of a product page (~800 chars).
const knowledgeChunkSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: "KnowledgePage", index: true },
  url: { type: String, required: true },
  title: { type: String, default: "" },
  heading: { type: String, default: "" },
  text: { type: String, required: true },
  active: { type: Boolean, default: true },
});

knowledgeChunkSchema.index({ title: "text", heading: "text", text: "text" }, { weights: { title: 4, heading: 3, text: 1 }, name: "chunk_text" });

module.exports = mongoose.model("KnowledgeChunk", knowledgeChunkSchema);

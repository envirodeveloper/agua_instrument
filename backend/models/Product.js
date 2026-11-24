const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    partNo: { type: String, required: true, trim: true, maxlength: 80 },
    partNoKey: { type: String, required: true, unique: true }, // upper-cased, whitespace-collapsed
    name: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", maxlength: 5000 },
    extra: { type: Map, of: String, default: {} }, // any extra Excel columns
    active: { type: Boolean, default: true }, // false = hidden from the chatbot
    source: { type: String, default: "manual" }, // excel-import | manual
  },
  { timestamps: true }
);

productSchema.index({ partNo: "text", name: "text", description: "text" }, { weights: { partNo: 10, name: 5, description: 1 }, name: "product_text" });
productSchema.index({ active: 1, name: 1 });

productSchema.statics.keyOf = (partNo) => String(partNo || "").trim().replace(/\s+/g, " ").toUpperCase();

module.exports = mongoose.model("Product", productSchema);

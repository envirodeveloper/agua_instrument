const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 150, index: true },
    phone: { type: String, required: true, maxlength: 20 },
    company: { type: String, default: "", maxlength: 150 },
    campaign: { type: String, default: "", maxlength: 80, index: true },
    utm: {
      source: String, medium: String, campaign: String, term: String, content: String,
    },
    referrer: { type: String, default: "", maxlength: 300 },
    userAgent: { type: String, default: "", maxlength: 300 },
    ipHash: { type: String, default: "" },
    consent: { type: Boolean, default: false },
    status: { type: String, enum: ["new", "engaged", "quote-requested", "contacted", "closed"], default: "new", index: true },
    visits: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: Date.now },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lead", leadSchema);

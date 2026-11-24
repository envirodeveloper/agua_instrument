const mongoose = require("mongoose");

// One document per day (YYYY-MM-DD, server time) for the global cost cap.
const usageSchema = new mongoose.Schema({
  _id: String,
  messages: { type: Number, default: 0 },
  tokensIn: { type: Number, default: 0 },
  tokensOut: { type: Number, default: 0 },
  blocked: { type: Number, default: 0 },
});

module.exports = mongoose.model("Usage", usageSchema);

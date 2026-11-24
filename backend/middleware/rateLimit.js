const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const json = (message) => (req, res) => res.status(429).json({ success: false, code: "RATE_LIMITED", message });

const common = { standardHeaders: "draft-8", legacyHeaders: false };

const enquiryLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: json("Too many submissions from this network. Please try again later."),
});

// Keyed by lead (from the chat token) so people behind one office IP don't block each other.
const chatLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => (req.lead ? `lead:${req.lead.leadId}` : ipKeyGenerator(req.ip)),
  handler: json("You're sending messages too quickly. Please wait a moment."),
});

// Backstop per IP for chat (covers many leads from one IP).
const chatIpLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 40,
  handler: json("Too many requests from this network. Please wait a moment."),
});

const adminLoginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  handler: json("Too many login attempts. Try again in 15 minutes."),
});

module.exports = { enquiryLimiter, chatLimiter, chatIpLimiter, adminLoginLimiter };

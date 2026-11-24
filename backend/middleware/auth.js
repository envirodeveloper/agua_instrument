const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ADMIN_TTL = "8h";
const LEAD_TTL = "2h";

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is not set (or too short).");
  return s;
}

// Timing-safe comparison against ADMIN_KEY (same approach as the original visitor download).
function checkAdminKey(given) {
  const expected = process.env.ADMIN_KEY || "";
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return !!expected && crypto.timingSafeEqual(a, b);
}

function bearer(req) {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// POST /api/admin/login {key} -> {token}
function adminLogin(req, res) {
  if (!checkAdminKey(req.body && req.body.key)) {
    return res.status(401).json({ success: false, message: "Wrong admin key." });
  }
  const token = jwt.sign({ typ: "admin" }, jwtSecret(), { expiresIn: ADMIN_TTL, algorithm: "HS256" });
  res.json({ success: true, token, expiresIn: ADMIN_TTL });
}

function requireAdmin(req, res, next) {
  try {
    const p = jwt.verify(bearer(req), jwtSecret(), { algorithms: ["HS256"] });
    if (p.typ !== "admin") throw new Error("wrong type");
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Please log in again." });
  }
}

function signLeadToken(leadId, conversationId) {
  return jwt.sign({ typ: "lead", lid: String(leadId), cid: String(conversationId) }, jwtSecret(), {
    expiresIn: LEAD_TTL,
    algorithm: "HS256",
  });
}

function requireLeadToken(req, res, next) {
  try {
    const p = jwt.verify(bearer(req), jwtSecret(), { algorithms: ["HS256"] });
    if (p.typ !== "lead" || !p.lid || !p.cid) throw new Error("wrong type");
    req.lead = { leadId: p.lid, conversationId: p.cid };
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, code: "SESSION_EXPIRED", message: "Your chat session has expired. Please fill in the form again." });
  }
}

module.exports = { checkAdminKey, adminLogin, requireAdmin, signLeadToken, requireLeadToken };

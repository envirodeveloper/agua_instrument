const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const { appendVisitor, FILE_PATH } = require("../utils/excelStore");

const router = express.Router();

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

// Excel treats cells starting with = + - @ as formulas. Neutralise them.
const safeCell = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s);

// Which website did this visitor come from? (from the browser's Origin, else the page URL sent by the popup)
function siteName(req, body) {
  let host = "";
  try { host = new URL(req.get("origin") || String(body.page || "")).hostname.toLowerCase(); } catch (e) {}
  if (!host) return "Unknown";
  if (host.includes("aguainstruments")) return "Agua Instruments";
  if (host === "localhost" || host === "127.0.0.1" || /^(192\.168|10\.)/.test(host)) return "Local test";
  return host;
}

// ---- Visitor popup submit -> adds one row to aguainstruments-visitors.xlsx
router.post("/", async (req, res) => {
  const body = req.body || {};

  console.log("[visitors] request received from", req.get("origin") || "unknown origin");

  // honeypot: bots fill this hidden field. Pretend success, save nothing.
  // (field name is unusual on purpose so browsers do not autofill it)
  if (body.hp_check || body.website) {
    console.warn("[visitors] SKIPPED: hidden spam-trap field was filled (bot or browser autofill)");
    return res.status(200).json({ success: true });
  }

  const name = clean(body.name, 100);
  const email = clean(body.email, 150).toLowerCase();
  const phone = clean(body.phone, 20).replace(/\D/g, "");
  const education = clean(body.education, 300);

  if (!name || !email || !phone || !education) {
    console.warn("[visitors] REJECTED: missing field(s)");
    return res.status(400).json({ success: false, message: "All fields are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email." });
  }
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: "Mobile number must be 10 digits." });
  }

  try {
    await appendVisitor({
      name: safeCell(name),
      email: safeCell(email),
      phone,
      education: safeCell(education),
      website: siteName(req, body),
    });
    console.log("[visitors] SAVED:", name, "->", FILE_PATH);
    res.status(200).json({ success: true, message: "Saved." });
  } catch (err) {
    console.error("Visitor save error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ---- Download the Excel file (owner only).
// Open:  https://YOUR-BACKEND/api/visitors/download?key=YOUR_ADMIN_KEY
router.get("/download", (req, res) => {
  const expected = process.env.ADMIN_KEY || "";
  const given = String(req.query.key || req.get("x-admin-key") || "");

  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  if (!fs.existsSync(FILE_PATH)) {
    return res.status(404).json({ success: false, message: "No visitors yet." });
  }
  res.download(FILE_PATH, "aguainstruments-visitors.xlsx");
});

module.exports = router;

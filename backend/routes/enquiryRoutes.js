const express = require("express");
const crypto = require("crypto");
const Lead = require("../models/Lead");
const Conversation = require("../models/Conversation");
const { getAiConfig } = require("../models/Setting");
const { clean, isEmail, normalisePhone, isPhone } = require("../utils/validate");
const { signLeadToken } = require("../middleware/auth");
const { enquiryLimiter } = require("../middleware/rateLimit");
const { notifySales } = require("../utils/mailer");
const { isDbReady } = require("../utils/db");
const guard = require("../ai/guardrails");

const router = express.Router();

const ipHash = (ip) => crypto.createHash("sha256").update(String(ip || "") + "|" + (process.env.JWT_SECRET || "")).digest("hex").slice(0, 32);
const tag = (v) => clean(v, 80).replace(/[^\w\-. ]/g, "");

const EMAIL_ACK =
  "Thank you! Your enquiry has been sent to our sales team, and they will reply by email or phone shortly. Meanwhile, you can ask me about any of our products here.";

// POST /api/enquiry  {mode: "chat"|"email", name, email, phone, company?, requirement?, consent, src?, utm_*?}
router.post("/", enquiryLimiter, async (req, res) => {
  const b = req.body || {};

  // Honeypot: bots fill this hidden field. Pretend success, store nothing, start no chat.
  if (b.hp_check || b.website) {
    console.warn("[enquiry] honeypot filled; ignored");
    return res.json({ success: true, token: null, greeting: "Thank you! Our team will contact you shortly." });
  }
  if (!isDbReady()) return res.status(503).json({ success: false, message: "Service is starting up. Please try again in a minute." });

  const name = clean(b.name, 100);
  const email = clean(b.email, 150).toLowerCase();
  const phone = normalisePhone(clean(b.phone, 25));
  const company = clean(b.company, 150);
  const mode = b.mode === "email" ? "email" : "chat";
  // Multi-line text: keep newlines, strip other control characters.
  const requirement = String(b.requirement ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 2000);

  if (mode === "email" && requirement.length < 5) {
    return res.status(400).json({ success: false, field: "requirement", message: "Please describe your requirement so our team can reply." });
  }
  if (!name || name.length < 2) return res.status(400).json({ success: false, field: "name", message: "Please enter your name." });
  if (!isEmail(email)) return res.status(400).json({ success: false, field: "email", message: "Please enter a valid email address." });
  if (!isPhone(phone)) return res.status(400).json({ success: false, field: "phone", message: "Please enter a valid phone number." });
  if (b.consent !== true && b.consent !== "true" && b.consent !== "on") {
    return res.status(400).json({ success: false, field: "consent", message: "Please accept so we can store this chat and follow up." });
  }

  const campaign = tag(b.src || b.utm_campaign || "");
  const utm = { source: tag(b.utm_source), medium: tag(b.utm_medium), campaign: tag(b.utm_campaign), term: tag(b.utm_term), content: tag(b.utm_content) };

  try {
    // Returning visitor (same email) -> same lead, new conversation.
    let lead = await Lead.findOne({ email });
    const isNew = !lead;
    if (lead) {
      lead.name = name;
      lead.phone = phone;
      if (company) lead.company = company;
      if (campaign) lead.campaign = campaign;
      lead.visits += 1;
      lead.lastSeenAt = new Date();
      lead.consent = true;
      await lead.save();
    } else {
      lead = await Lead.create({
        name, email, phone, company, campaign, utm,
        referrer: clean(req.get("referer"), 300),
        userAgent: clean(req.get("user-agent"), 300),
        ipHash: ipHash(req.ip),
        consent: true,
      });
    }
    const first = name.split(" ")[0];
    const now = new Date();
    let messages;
    let greeting;
    if (mode === "email") {
      // The requirement is kept as the customer's first message, so the AI has it as context if they chat later.
      greeting = EMAIL_ACK;
      // Same input guardrails as chat: abusive / jailbreak text is still emailed to sales,
      // but is tagged so it never becomes AI context.
      const blocked = guard.preCheck(requirement.slice(0, guard.MAX_MESSAGE_CHARS));
      const risky = blocked && ["jailbreak", "abuse"].includes(blocked.kind);
      messages = [
        { role: "system-note", content: "Enquiry sent by email form", ts: now },
        { role: "user", content: requirement, ts: now },
        { role: "assistant", content: EMAIL_ACK, ts: now, guardrail: risky ? "email-ack-blocked" : "email-ack" },
      ];
    } else {
      const cfg = await getAiConfig();
      greeting = String(cfg.greeting || "").replace(/\{name\}/g, first);
      messages = [{ role: "assistant", content: greeting, ts: now, guardrail: "greeting" }];
    }
    const convo = await Conversation.create({ leadId: lead._id, messages });

    const kind = mode === "email" ? "EMAIL ENQUIRY" : `${isNew ? "New" : "Returning"} chat enquiry`;
    notifySales(
      `${kind}: ${name}${company ? ` (${company})` : ""}${campaign ? ` [${campaign}]` : ""}`,
      `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nCompany: ${company || "-"}\nCampaign: ${campaign || "-"}\nVisits: ${lead.visits}\n\n` +
        `Requirement:\n${requirement || "(none given; customer started the AI chat)"}\n\n` +
        (mode === "email" ? "Please reply to the customer directly." : "The chat transcript is available in Admin > Leads.")
    );

    res.json({ success: true, mode, token: signLeadToken(lead._id, convo._id), greeting, name: first });
  } catch (err) {
    console.error("[enquiry] error:", err.message);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

module.exports = router;

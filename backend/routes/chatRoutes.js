const express = require("express");
const Conversation = require("../models/Conversation");
const Lead = require("../models/Lead");
const { requireLeadToken } = require("../middleware/auth");
const { chatLimiter, chatIpLimiter } = require("../middleware/rateLimit");
const { handleMessage, ChatError } = require("../ai/chatService");
const { clean } = require("../utils/validate");
const { notifySales } = require("../utils/mailer");
const { endConversation } = require("../utils/chatTranscript");

const router = express.Router();

// POST /api/chat {message}  (Authorization: Bearer <lead token>)
router.post("/", chatIpLimiter, requireLeadToken, chatLimiter, async (req, res) => {
  try {
    const out = await handleMessage({ ...req.lead, message: req.body && req.body.message });
    res.json({ success: true, ...out });
  } catch (e) {
    if (e instanceof ChatError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
    console.error("[chat] error:", e.message);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

// POST /api/chat/end -> customer closes the chat (to start a new enquiry). The token stops working.
router.post("/end", chatIpLimiter, requireLeadToken, async (req, res) => {
  try {
    // Closes the chat and emails the transcript to the sales inbox (once).
    await endConversation(req.lead.conversationId, req.lead.leadId, "customer");
    res.json({ success: true });
  } catch (e) {
    console.error("[chat/end] error:", e.message);
    res.status(500).json({ success: false });
  }
});

// GET /api/chat/history -> restore the conversation after a page refresh
router.get("/history", chatIpLimiter, requireLeadToken, async (req, res) => {
  const c = await Conversation.findById(req.lead.conversationId).select("leadId messages quoteRequested endedAt").lean();
  if (!c || String(c.leadId) !== req.lead.leadId || c.endedAt) return res.status(401).json({ success: false, code: "SESSION_EXPIRED" });
  res.json({
    success: true,
    quoteRequested: !!c.quoteRequested,
    messages: c.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content })),
  });
});

// POST /api/chat/quote {note?} -> customer asks for a quotation / call back
router.post("/quote", chatIpLimiter, requireLeadToken, chatLimiter, async (req, res) => {
  try {
    const note = clean(req.body && req.body.note, 500);
    const c = await Conversation.findById(req.lead.conversationId).lean();
    if (!c || String(c.leadId) !== req.lead.leadId || c.endedAt) return res.status(401).json({ success: false, code: "SESSION_EXPIRED" });
    const lead = await Lead.findByIdAndUpdate(req.lead.leadId, { $set: { status: "quote-requested" } }, { returnDocument: "after" }).lean();
    const msg = "Thank you! We've passed your request to our sales team. They will contact you shortly with a quotation.";
    const firstRequest = !c.quoteRequested;
    await Conversation.updateOne(
      { _id: c._id },
      {
        $set: { quoteRequested: true },
        $push: {
          messages: {
            $each: [
              { role: "system-note", content: `Quote / call back requested${note ? `: ${note}` : ""}`, ts: new Date() },
              { role: "assistant", content: msg, ts: new Date(), guardrail: "quote" },
            ],
          },
        },
      }
    );
    if (firstRequest) {
      const transcript = c.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `${m.role === "user" ? lead.name : "Bot"}: ${m.content}`)
        .join("\n\n");
      notifySales(
        `QUOTE REQUEST: ${lead.name}${lead.campaign ? ` [${lead.campaign}]` : ""}`,
        `Name: ${lead.name}\nEmail: ${lead.email}\nPhone: ${lead.phone}\nCompany: ${lead.company || "-"}\nNote: ${note || "-"}\n\n--- Chat transcript ---\n\n${transcript}`
      );
    }
    res.json({ success: true, reply: msg });
  } catch (e) {
    console.error("[chat/quote] error:", e.message);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

module.exports = router;

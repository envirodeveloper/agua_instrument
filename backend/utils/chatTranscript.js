// End-of-chat transcript email to the sales inbox (EMAIL_RECEIVER), plus a background sweeper
// that closes chats left idle (customer just closed the tab) so they are emailed too.
const Conversation = require("../models/Conversation");
const Lead = require("../models/Lead");
const { notifySales } = require("./mailer");
const { isDbReady } = require("./db");

const IDLE_MINUTES = 30; // a chat with no activity for this long is treated as ended
const SWEEP_EVERY_MS = 5 * 60 * 1000;

const fmt = (d) =>
  new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeOnly = (d) => new Date(d).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

function buildEmail(lead, convo, endedBy) {
  const msgs = convo.messages || [];
  const questions = msgs.filter((m) => m.role === "user").length;
  const started = convo.createdAt || (msgs[0] && msgs[0].ts) || new Date();
  const ended = convo.endedAt || new Date();
  const mins = Math.max(1, Math.round((new Date(ended) - new Date(started)) / 60000));
  const how = endedBy === "customer" ? "Customer clicked \"End chat\"" : `Closed automatically after ${IDLE_MINUTES} minutes of inactivity`;
  const site = (process.env.PUBLIC_SITE_URL || "https://www.aguainstruments.com").replace(/\/$/, "");

  const transcript = msgs
    .filter((m) => m.role !== "system-note" || /quote|email/i.test(m.content))
    .map((m) => {
      const who = m.role === "user" ? lead.name : m.role === "assistant" ? "AI assistant" : "Note";
      return `[${timeOnly(m.ts)}] ${who}:\n${String(m.content).replace(/\*\*/g, "")}`;
    })
    .join("\n\n");

  const subject = `Chat transcript: ${lead.name}${lead.company ? ` (${lead.company})` : ""} · ${questions} question${questions === 1 ? "" : "s"}${convo.quoteRequested ? " · QUOTE REQUESTED" : ""}`;
  const text = [
    `A customer chat on the enquiry page has ended.`,
    ``,
    `Name:      ${lead.name}`,
    `Email:     ${lead.email}`,
    `Phone:     ${lead.phone}`,
    `Company:   ${lead.company || "-"}`,
    `Campaign:  ${lead.campaign || "-"}`,
    `Status:    ${lead.status}${convo.quoteRequested ? " (asked for a quote / call back)" : ""}`,
    ``,
    `Chat:      ${fmt(started)} to ${timeOnly(ended)} IST (${mins} min), ${questions} question(s)`,
    `Ended:     ${how}`,
    convo.flagged ? `Flags:     ${(convo.flags || []).join(", ")} (review in admin)` : null,
    ``,
    `---------------- Transcript ----------------`,
    ``,
    transcript,
    ``,
    `--------------------------------------------`,
    `Full details: ${site}/admin-chatbot.html (Leads & chats)`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return { subject, text };
}

// Sends the transcript once per conversation. Safe to call more than once.
async function emailTranscript(conversationId, endedBy) {
  // Atomically claim the send so two triggers can't both email.
  const convo = await Conversation.findOneAndUpdate(
    { _id: conversationId, transcriptEmailedAt: null },
    { $set: { transcriptEmailedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();
  if (!convo) return false;
  if (convo.userTurns < 1) return false; // no chat questions: the enquiry email already covered it
  const lead = await Lead.findById(convo.leadId).lean();
  if (!lead) return false;
  const { subject, text } = buildEmail(lead, convo, endedBy);
  const sent = await notifySales(subject, text);
  if (sent === false) {
    // Delivery failed: release the claim so the sweeper retries later.
    await Conversation.updateOne({ _id: convo._id }, { $set: { transcriptEmailedAt: null } });
  }
  return sent === true;
}

// Close the chat (if still open) and email it.
async function endConversation(conversationId, leadId, endedBy) {
  const note = endedBy === "customer" ? "Chat ended by customer" : `Chat closed after ${IDLE_MINUTES} minutes of inactivity`;
  const r = await Conversation.updateOne(
    { _id: conversationId, ...(leadId ? { leadId } : {}), endedAt: null },
    { $set: { endedAt: new Date(), endedBy }, $push: { messages: { role: "system-note", content: note, ts: new Date() } } }
  );
  if (r.modifiedCount) emailTranscript(conversationId, endedBy).catch((e) => console.error("[transcript] email error:", e.message));
  return r.modifiedCount > 0;
}

async function sweepIdleChats() {
  if (!isDbReady()) return;
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60 * 1000);
  // 1) Close idle chats where the customer asked at least one question.
  const idle = await Conversation.find({ endedAt: null, userTurns: { $gt: 0 }, updatedAt: { $lt: cutoff } }).select("_id").limit(50).lean();
  for (const c of idle) await endConversation(c._id, null, "inactivity");
  // 2) Retry ended chats whose email failed earlier.
  const pending = await Conversation.find({ endedAt: { $ne: null, $lt: cutoff }, transcriptEmailedAt: null, userTurns: { $gt: 0 } }).select("_id endedBy").limit(20).lean();
  for (const c of pending) await emailTranscript(c._id, c.endedBy || "inactivity");
  if (idle.length) console.log(`[transcript] closed ${idle.length} idle chat(s)`);
}

function startChatSweeper() {
  const run = () => sweepIdleChats().catch((e) => console.error("[transcript] sweep error:", e.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, SWEEP_EVERY_MS).unref();
}

module.exports = { endConversation, emailTranscript, sweepIdleChats, startChatSweeper, buildEmail, IDLE_MINUTES };

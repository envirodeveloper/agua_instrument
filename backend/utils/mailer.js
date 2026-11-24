const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

// Fire-and-forget notification to the sales inbox. Never throws.
// Returns true (sent), false (send failed: worth retrying) or null (email not configured: skipped).
async function notifySales(subject, text) {
  try {
    const t = getTransporter();
    if (!t || !process.env.EMAIL_RECEIVER) {
      console.warn("[mail] EMAIL_USER/EMAIL_PASS/EMAIL_RECEIVER not set; skipped:", subject);
      return null;
    }
    await t.sendMail({ from: process.env.EMAIL_USER, to: process.env.EMAIL_RECEIVER, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] send failed:", e.message);
    return false;
  }
}

module.exports = { notifySales };

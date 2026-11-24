// Shared input helpers (moved from routes/visitorRoutes.js so all routes use the same rules).

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// Excel treats cells starting with = + - @ as formulas. Neutralise them.
const safeCell = (s) => (/^[=+\-@\t\r]/.test(String(s ?? "")) ? "'" + s : s);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE10_RE = /^\d{10}$/;

const isEmail = (s) => EMAIL_RE.test(s);
const isPhone10 = (s) => PHONE10_RE.test(s);

// International-friendly phone: 7-15 digits after removing spaces, dashes, brackets and a leading +.
// Indian numbers may be entered with +91 / 0 prefix; we store them as 10 digits.
function normalisePhone(raw) {
  let d = String(raw ?? "").replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const isPhone = (d) => /^\d{7,15}$/.test(d);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { clean, safeCell, isEmail, isPhone10, normalisePhone, isPhone, escapeRegex, EMAIL_RE, PHONE10_RE };

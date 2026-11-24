// Decrypt-only helper for AI provider API keys.
//
// Keys are encrypted OFFLINE by the owner's local utility (not part of this repo).
// This server can only DECRYPT them, and only if it has the same
// ENCRYPTION_KEY. Format of a stored/pasted key:
//
//   agua-enc:v1:<provider>:<base64url( salt[16] | iv[12] | tag[16] | ciphertext )>
//
// AES-256-GCM, key = scrypt(ENCRYPTION_KEY, salt, 32). The string "agua-ai-key:v1:<provider>"
// is bound in as GCM associated data, so a blob made for one provider cannot be used for another.
// Any blob not made with this ENCRYPTION_KEY fails the GCM auth-tag check and is rejected.

const crypto = require("crypto");

const PROVIDERS = ["claude", "openai", "gemini"];
const PREFIX = "agua-enc";
const VERSION = "v1";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

const BLOB_RE = /^agua-enc:v1:(claude|openai|gemini):([A-Za-z0-9_-]+)$/;

// Things that look like a raw provider key. Never accepted anywhere.
const PLAINTEXT_KEY_RE = /^(sk-|sk-ant-|sk-proj-|AIza|ya29\.)/;

class SecretError extends Error {}

const aadFor = (provider) => Buffer.from(`agua-ai-key:${VERSION}:${provider}`, "utf8");

// scrypt is deliberately slow; cache derived keys per (secret, salt) in memory.
const keyCache = new Map();
function deriveKey(secret, salt) {
  const id = crypto.createHash("sha256").update(secret).update(salt).digest("hex");
  let k = keyCache.get(id);
  if (!k) {
    k = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
    if (keyCache.size > 20) keyCache.clear();
    keyCache.set(id, k);
  }
  return k;
}

function looksLikePlainKey(s) {
  return PLAINTEXT_KEY_RE.test(String(s || "").trim());
}

// Parse + verify format only (no decryption). Throws SecretError.
function parseBlob(blob, expectedProvider) {
  const s = String(blob || "").trim();
  if (looksLikePlainKey(s)) throw new SecretError("Plain API keys are not accepted. Encrypt it with the local utility.");
  const m = BLOB_RE.exec(s);
  if (!m) throw new SecretError("Not a valid encrypted key (expected agua-enc:v1:...).");
  const [, provider, b64] = m;
  if (expectedProvider && provider !== expectedProvider) {
    throw new SecretError(`This encrypted key is for "${provider}", not "${expectedProvider}".`);
  }
  const raw = Buffer.from(b64, "base64url");
  if (raw.length <= SALT_LEN + IV_LEN + TAG_LEN) throw new SecretError("Encrypted key is too short.");
  return {
    provider,
    salt: raw.subarray(0, SALT_LEN),
    iv: raw.subarray(SALT_LEN, SALT_LEN + IV_LEN),
    tag: raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN),
    ct: raw.subarray(SALT_LEN + IV_LEN + TAG_LEN),
  };
}

// Decrypt a blob. `secret` defaults to process.env.ENCRYPTION_KEY. Throws SecretError.
function decryptBlob(blob, expectedProvider, secret = process.env.ENCRYPTION_KEY) {
  if (!secret) throw new SecretError("ENCRYPTION_KEY is not set on the server.");
  const p = parseBlob(blob, expectedProvider);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret, p.salt), p.iv, { authTagLength: TAG_LEN });
    decipher.setAAD(aadFor(p.provider));
    decipher.setAuthTag(p.tag);
    const out = Buffer.concat([decipher.update(p.ct), decipher.final()]).toString("utf8");
    if (!out) throw new Error("empty");
    return out;
  } catch (e) {
    throw new SecretError("Encrypted key could not be verified (wrong ENCRYPTION_KEY or tampered data).");
  }
}

// ---- MongoDB-backed key loading (the ONLY way the AI layer gets a key) ----

async function settingsCollection() {
  const mongoose = require("mongoose");
  if (mongoose.connection.readyState !== 1) throw new SecretError("Database is not connected.");
  return mongoose.connection.collection("settings");
}

async function getProviderKey(provider) {
  if (!PROVIDERS.includes(provider)) throw new SecretError("Unknown AI provider.");
  const col = await settingsCollection();
  const doc = await col.findOne({ _id: "ai_keys" });
  const entry = doc && doc.keys && doc.keys[provider];
  if (!entry || !entry.blob) throw new SecretError(`No encrypted key is stored for ${provider}.`);
  return decryptBlob(entry.blob, provider);
}

// Store a pasted blob after verifying it decrypts. Never returns the key or blob.
async function storeProviderBlob(provider, blob) {
  if (!PROVIDERS.includes(provider)) throw new SecretError("Unknown AI provider.");
  decryptBlob(blob, provider); // verify; result discarded
  const col = await settingsCollection();
  await col.updateOne(
    { _id: "ai_keys" },
    { $set: { [`keys.${provider}`]: { blob: String(blob).trim(), updatedAt: new Date(), source: "admin-paste" } } },
    { upsert: true }
  );
}

// true/false per provider + updatedAt; never includes the blob.
async function keyStatus() {
  const col = await settingsCollection();
  const doc = await col.findOne({ _id: "ai_keys" });
  const out = {};
  for (const p of PROVIDERS) {
    const e = doc && doc.keys && doc.keys[p];
    let valid = false;
    if (e && e.blob) {
      try { decryptBlob(e.blob, p); valid = true; } catch (_) { valid = false; }
    }
    out[p] = { configured: !!(e && e.blob), valid, updatedAt: e ? e.updatedAt || null : null };
  }
  return out;
}

// Environment variables the AI SDKs would otherwise read as a fallback credential,
// base URL or alternative auth mode. Removed at startup so ONLY encrypted keys work.
const SDK_ENV_PATTERN = /^(ANTHROPIC_|OPENAI_|AZURE_OPENAI_|GEMINI_|GOOGLE_GENAI_|GOOGLE_GEMINI_|GOOGLE_VERTEX_|GOOGLE_API_KEY$|GOOGLE_CLOUD_PROJECT$|GOOGLE_CLOUD_LOCATION$|AWS_BEARER_TOKEN_BEDROCK$|AWS_BEDROCK_BASE_URL$)/;

function scrubSdkEnv(env = process.env) {
  const removed = [];
  for (const name of Object.keys(env)) {
    if (SDK_ENV_PATTERN.test(name)) {
      removed.push(name);
      delete env[name];
    }
  }
  return removed;
}

// Remove anything that looks like a secret from text before it is logged.
function redact(text) {
  return String(text ?? "")
    .replace(/agua-enc:v1:[a-z]+:[A-Za-z0-9_-]+/g, "agua-enc:[redacted]")
    .replace(/(sk-[A-Za-z0-9_*-]{6,}|AIza[0-9A-Za-z_*-]{10,}|ya29\.[0-9A-Za-z_.*-]+)/g, "[redacted-key]")
    .replace(/([?&](key|api_key)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(x-api-key|x-goog-api-key|authorization)(["']?\s*[:=]\s*["']?)(Bearer\s+)?[^\s"',}]+/gi, "$1$2[redacted]");
}

module.exports = {
  PROVIDERS,
  PREFIX,
  VERSION,
  SecretError,
  aadFor,
  parseBlob,
  decryptBlob,
  looksLikePlainKey,
  getProviderKey,
  storeProviderBlob,
  keyStatus,
  scrubSdkEnv,
  redact,
};

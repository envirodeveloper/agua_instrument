const { redact } = require("../../utils/secretBox");

class ProviderError extends Error {
  constructor(provider, message, { status, retryable } = {}) {
    super(redact(message));
    this.provider = provider;
    this.status = status;
    this.retryable = !!retryable;
  }
}

class RefusalError extends Error {}

// Run tool calls in parallel; never throw (errors are returned to the model as data).
async function runTools(calls, executeTool, log) {
  return Promise.all(
    calls.map(async (c) => {
      try {
        const { result, count } = await executeTool(c.name, c.input);
        log.push({ name: c.name, input: JSON.stringify(c.input || {}).slice(0, 300), resultCount: count });
        return { ...c, output: JSON.stringify(result).slice(0, 12000), isError: false };
      } catch (e) {
        log.push({ name: c.name, input: JSON.stringify(c.input || {}).slice(0, 300), resultCount: -1 });
        return { ...c, output: JSON.stringify({ error: "Lookup failed" }), isError: true };
      }
    })
  );
}

// Network errors hide the real reason (DNS, TLS certificate, refused...) in error.cause.
function causeOf(e) {
  const c = e && e.cause;
  if (!c) return "";
  const code = c.code || (c.cause && c.cause.code) || "";
  const hint =
    /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)/.test(code)
      ? " (HTTPS is being intercepted, e.g. by antivirus or a proxy. Locally, start with: npm run start:local)"
      : /ENOTFOUND|EAI_AGAIN/.test(code)
      ? " (DNS lookup failed: check the internet connection)"
      : /ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/.test(code)
      ? " (outbound connection blocked or timed out: check firewall/hosting outbound rules)"
      : "";
  return ` [cause: ${code || c.message || "unknown"}]${hint}`;
}

const safeJson = (s) => {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
};

module.exports = { ProviderError, RefusalError, runTools, safeJson, causeOf };

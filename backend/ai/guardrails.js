// Server-side guardrails that run BEFORE and AFTER the AI call. They don't depend on the model
// behaving well: obvious misuse never reaches the AI at all (no cost, no risk).

const MAX_MESSAGE_CHARS = 500;

const REPLIES = {
  offTopic:
    "I can only help with Agua Instruments products and services: water, air, emission and gas monitoring instruments, analyzers, sensors and accessories. What would you like to know about our products?",
  jailbreak:
    "I'm here to help with Agua Instruments products only. Ask me about an analyzer, a monitoring system, a part number or an accessory.",
  abuse: "Let's keep this conversation professional. I'm happy to help with any question about Agua Instruments products.",
  tooLong: `Please keep your question under ${MAX_MESSAGE_CHARS} characters.`,
  unavailable:
    "Thanks for your question! Our product assistant is unavailable right now, but our team has your details and will get back to you shortly. You can also use the \"Request a quote / call back\" button.",
  capReached:
    "Thanks for all your questions! You've reached the chat limit for now. Our sales team has your details and will contact you shortly. You can also use the \"Request a quote / call back\" button.",
  refusal: "I'm not able to help with that. I can answer questions about Agua Instruments products, part numbers and monitoring solutions.",
};

// Patterns are deliberately narrow so real product questions are never blocked.
const RULES = [
  {
    kind: "jailbreak",
    re: /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|your|all|the|system)\b.{0,30}\b(instructions?|prompts?|rules?|guidelines?|messages?)\b/i,
  },
  { kind: "jailbreak", re: /\b(system|hidden|initial|developer)\s+(prompt|instructions?|message)\b/i },
  { kind: "jailbreak", re: /\b(jailbreak|DAN mode|developer mode|do anything now|prompt injection)\b/i },
  {
    kind: "jailbreak",
    re: /\b(you are now (an?|my|in)|from now on,? you|pretend (to be|you are|that you)|role-?play as|act as (if you|my|an? (ai|assistant|chatbot|gpt|llm|different|unrestricted|unfiltered|evil|uncensored)))\b/i,
  },
  { kind: "jailbreak", re: /<\/?(system|instructions?|assistant)>|\[\/?INST\]|<\|im_(start|end)\|>/i },
  {
    kind: "offTopic",
    re: /\b(write|generate|create|give me|show me)\b.{0,30}\b(python|javascript|java|c\+\+|c#|php|sql|html|css|code|script|program|regex|function|essay|poem|story|song|joke|letter|cover letter|resume|homework|assignment)\b/i,
  },
  { kind: "offTopic", re: /\b(translate|summari[sz]e)\b.{0,20}\b(this|the following|text|article|paragraph)\b/i },
  {
    kind: "offTopic",
    re: /\b(bitcoin|crypto|stock tips?|lottery|betting|horoscope|dating|recipe|movie|cricket score|weather forecast for|election|politics|religion)\b/i,
  },
  { kind: "abuse", re: /\b(fuck\w*|shit\w*|bitch\w*|bastard|asshole|cunt|madarchod|behenchod|bhenchod|chutiya|gandu)\b/i },
];

function cleanMessage(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/[ \t]{3,}/g, "  ")
    .trim();
}

// -> null (ok) or { kind, reply }
function preCheck(message) {
  if (!message) return { kind: "empty", reply: "Please type a question about our products." };
  if (message.length > MAX_MESSAGE_CHARS) return { kind: "tooLong", reply: REPLIES.tooLong };
  for (const r of RULES) if (r.re.test(message)) return { kind: r.kind, reply: REPLIES[r.kind] };
  return null;
}

// Part-number-like tokens in the answer that exist neither in the catalog nor in anything a tool returned.
function findUnknownPartNumbers(answer, catalogKeys, toolText) {
  const tokens = String(answer).match(/\b[A-Z0-9]{2,}(?:[-/][A-Z0-9"]{1,})+\b|\b\d{6,}\b/g) || [];
  const hay = String(toolText || "").toUpperCase();
  const keys = [...catalogKeys];
  const unknown = [];
  for (const t of new Set(tokens)) {
    const k = t.toUpperCase();
    // Tokens like NRV-2" lose the trailing quote at the word boundary, so also accept prefixes of catalog keys.
    if (catalogKeys.has(k) || hay.includes(k) || keys.some((key) => key.startsWith(k))) continue;
    if (/^(RS-?485|RS-?232|4-20|0-10|24V|230V|PM2\.5|PM10|PM1|NO2|SO2|CO2|O3|H2S|NH3|ISO-\d+|IP\d\d|COD|BOD|TOC|TSS)$/i.test(k)) continue;
    unknown.push(t);
  }
  return unknown;
}

// Remove raw HTML / markdown images that the model might emit; the frontend renders text safely anyway.
function sanitizeAnswer(text) {
  return String(text || "")
    .replace(/<[^>]{1,200}>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .slice(0, 4000)
    .trim();
}

module.exports = { MAX_MESSAGE_CHARS, REPLIES, cleanMessage, preCheck, findUnknownPartNumbers, sanitizeAnswer };

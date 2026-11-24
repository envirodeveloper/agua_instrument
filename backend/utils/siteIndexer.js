// Builds chatbot knowledge from the website's own product pages (read from disk, not over HTTP).
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const KnowledgePage = require("../models/KnowledgePage");
const KnowledgeChunk = require("../models/KnowledgeChunk");

const FRONTEND = path.join(__dirname, "..", "..", "frontend");

const PRODUCT_DIRS = [
  "water-analyzer", "water-quality-monitoring", "air-quality-monitoring", "ambient-air-quality",
  "gas-analyzer", "dust-analyzer", "auto-sampler", "pharma-toc",
];
const TOP_LEVEL_RE = /^(.*-monitoring-system|tech-.*|hach|suntex|bettair|instran|lar|technicrafts|water-analyzer|gas-analyzer|dust-analyzer|ambient-air-quality|auto-sampler|pharma-toc|aboutus|contact)\.html$/;

const CHUNK_CHARS = 800;

function listPages() {
  const out = [];
  for (const f of fs.readdirSync(FRONTEND)) if (TOP_LEVEL_RE.test(f)) out.push(f);
  for (const d of PRODUCT_DIRS) {
    const dir = path.join(FRONTEND, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".html")) out.push(`${d}/${f}`);
  }
  return out.sort();
}

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

function extract(html) {
  const $ = cheerio.load(html);
  const title = squash($("title").first().text()).replace(/\s*\|\s*Agua Instruments.*$/i, "") || squash($("h1").first().text());
  $("script, style, noscript, iframe, svg, header, footer, nav, form, [data-include-html], .navbar, .footer, #footer, #header").remove();

  // Walk the body in document order, splitting at headings.
  const sections = [];
  let cur = { heading: title, parts: [] };
  $("body").find("h1, h2, h3, h4, p, li, td, th, span, div").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-4]$/.test(tag)) {
      if (cur.parts.length) sections.push(cur);
      cur = { heading: squash($(el).text()).slice(0, 150), parts: [] };
      return;
    }
    // Only take text from leaf-ish elements to avoid duplicates.
    if ((tag === "div" || tag === "span") && $(el).children("p, li, div, table, ul, ol, h1, h2, h3, h4").length) return;
    const t = squash($(el).clone().children("p, li, div, ul, ol, table").remove().end().text());
    if (t && t.length > 2) cur.parts.push(t);
  });
  if (cur.parts.length) sections.push(cur);

  // De-duplicate repeated lines and pack into ~CHUNK_CHARS chunks.
  const seen = new Set();
  const chunks = [];
  for (const s of sections) {
    let buf = "";
    for (const p of s.parts) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (buf.length + p.length + 1 > CHUNK_CHARS && buf) {
        chunks.push({ heading: s.heading, text: buf });
        buf = "";
      }
      buf += (buf ? " " : "") + p.slice(0, CHUNK_CHARS * 2);
    }
    if (buf) chunks.push({ heading: s.heading, text: buf });
  }
  return { title, chunks };
}

// Re-index all product pages. Keeps the admin's include/exclude choice per page.
async function reindexSite() {
  const files = listPages();
  const prev = new Map((await KnowledgePage.find({}).lean()).map((p) => [p.url, p]));
  const report = { pages: 0, chunks: 0, skipped: [] };
  const keepUrls = [];
  for (const rel of files) {
    const url = "/" + rel.replace(/\\/g, "/");
    let parsed;
    try {
      parsed = extract(fs.readFileSync(path.join(FRONTEND, rel), "utf8"));
    } catch (e) {
      report.skipped.push({ url, reason: e.message });
      continue;
    }
    if (!parsed.chunks.length) { report.skipped.push({ url, reason: "no text" }); continue; }
    const active = prev.has(url) ? prev.get(url).active : true;
    const words = parsed.chunks.reduce((n, c) => n + c.text.split(" ").length, 0);
    const page = await KnowledgePage.findOneAndUpdate(
      { url },
      { $set: { title: parsed.title, chunkCount: parsed.chunks.length, wordCount: words, indexedAt: new Date() }, $setOnInsert: { active } },
      { upsert: true, returnDocument: "after" }
    );
    await KnowledgeChunk.deleteMany({ pageId: page._id });
    await KnowledgeChunk.insertMany(parsed.chunks.map((c) => ({ pageId: page._id, url, title: parsed.title, heading: c.heading, text: c.text, active: page.active })));
    keepUrls.push(url);
    report.pages++;
    report.chunks += parsed.chunks.length;
  }
  // Remove pages that no longer exist on disk.
  const gone = await KnowledgePage.find({ url: { $nin: keepUrls } }).select("_id").lean();
  if (gone.length) {
    await KnowledgeChunk.deleteMany({ pageId: { $in: gone.map((g) => g._id) } });
    await KnowledgePage.deleteMany({ _id: { $in: gone.map((g) => g._id) } });
  }
  report.removed = gone.length;
  return report;
}

async function setPageActive(id, active) {
  const page = await KnowledgePage.findByIdAndUpdate(id, { $set: { active: !!active } }, { returnDocument: "after" });
  if (page) await KnowledgeChunk.updateMany({ pageId: page._id }, { $set: { active: !!active } });
  return page;
}

module.exports = { reindexSite, setPageActive, listPages, extract };

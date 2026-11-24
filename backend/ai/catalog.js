// Read-only knowledge access for the chatbot. Everything is read live from MongoDB, so
// edits/imports in Admin > Inventory take effect on the very next message.
const Product = require("../models/Product");
const KnowledgeChunk = require("../models/KnowledgeChunk");
const { escapeRegex } = require("../utils/validate");

let indexCache = null;
let indexVersion = 0;
let cachedVersion = -1;
let cachedAt = 0;

// Call after any product change.
function invalidateCatalog() {
  indexVersion++;
}

// Compact "Part No. | Item Name" list of every active product (goes into the system prompt).
async function getCatalogIndex() {
  // Also refresh every 60 s so changes made outside this process (e.g. the local import script) show up.
  if (indexCache && cachedVersion === indexVersion && Date.now() - cachedAt < 60_000) return indexCache;
  const items = await Product.find({ active: true }).select("partNo name").sort({ name: 1 }).lean();
  indexCache = { text: items.map((p) => `${p.partNo} | ${p.name}`).join("\n"), count: items.length, keys: new Set(items.map((p) => Product.keyOf(p.partNo))) };
  cachedVersion = indexVersion;
  cachedAt = Date.now();
  return indexCache;
}

const STOP = new Set("a an and are about any can do does for from have i in is it me my of on or our please show tell the to what which with you your we need want price cost".split(" "));
const terms = (q) =>
  String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\-"/ ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .slice(0, 8);

const shapeProduct = (p, full) => {
  const o = { partNo: p.partNo, name: p.name };
  const d = p.description || "";
  o.description = full ? d || "(no description in catalog)" : d.length > 220 ? d.slice(0, 220) + "…" : d || "(no description in catalog)";
  if (full && p.extra) {
    const ex = p.extra instanceof Map ? Object.fromEntries(p.extra) : p.extra;
    if (Object.keys(ex).length) o.otherDetails = ex;
  }
  return o;
};

async function searchProducts(query, limit = 8) {
  const q = String(query || "").trim().slice(0, 200);
  if (!q) return [];
  const found = new Map();
  const add = (list) => list.forEach((p) => { if (!found.has(String(p._id))) found.set(String(p._id), p); });

  // 1) Part-number match (exact, then partial).
  const key = Product.keyOf(q);
  add(await Product.find({ active: true, partNoKey: key }).limit(limit).lean());
  if (key.length >= 2) add(await Product.find({ active: true, partNoKey: { $regex: escapeRegex(key) } }).limit(limit).lean());

  // 2) Full-text search.
  if (found.size < limit) {
    try {
      add(
        await Product.find({ active: true, $text: { $search: q } }, { score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } })
          .limit(limit)
          .lean()
      );
    } catch (_) { /* text index not ready */ }
  }

  // 3) Fallback: every term as a substring of name/description.
  if (found.size < limit) {
    const ts = terms(q);
    if (ts.length) {
      const and = ts.map((t) => ({ $or: [{ name: { $regex: escapeRegex(t), $options: "i" } }, { description: { $regex: escapeRegex(t), $options: "i" } }, { partNo: { $regex: escapeRegex(t), $options: "i" } }] }));
      add(await Product.find({ active: true, $and: and }).limit(limit).lean());
      if (found.size === 0 && ts.length > 1) {
        add(await Product.find({ active: true, $or: and.map((x) => x) }).limit(limit).lean());
      }
    }
  }
  return [...found.values()].slice(0, limit).map((p) => shapeProduct(p, false));
}

async function getProductDetails(partNos) {
  const list = (Array.isArray(partNos) ? partNos : [partNos]).slice(0, 6).map((p) => Product.keyOf(p)).filter(Boolean);
  if (!list.length) return [];
  const items = await Product.find({ active: true, partNoKey: { $in: list } }).lean();
  const out = items.map((p) => shapeProduct(p, true));
  const missing = list.filter((k) => !items.some((p) => p.partNoKey === k));
  if (missing.length) out.push({ notFound: missing });
  return out;
}

async function searchProductPages(query, limit = 4) {
  const q = String(query || "").trim().slice(0, 200);
  if (!q) return [];
  let chunks = [];
  try {
    chunks = await KnowledgeChunk.find({ active: true, $text: { $search: q } }, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .lean();
  } catch (_) { /* text index not ready */ }
  if (!chunks.length) {
    const ts = terms(q).slice(0, 4);
    if (ts.length) {
      chunks = await KnowledgeChunk.find({ active: true, $or: ts.map((t) => ({ text: { $regex: escapeRegex(t), $options: "i" } })) }).limit(limit).lean();
    }
  }
  const base = (process.env.PUBLIC_SITE_URL || "https://www.aguainstruments.com").replace(/\/$/, "");
  return chunks.map((c) => ({ page: c.title, section: c.heading, link: base + c.url, text: c.text }));
}

// ---- Tool definitions shared by all providers (plain JSON Schema) ----
const TOOLS = [
  {
    name: "search_products",
    description:
      "Search the Agua Instruments product catalog (the inventory spreadsheet) by part number, product name, brand, parameter (e.g. pH, ammonia, PM2.5) or application. Returns matching items with short descriptions. Always use this before describing or recommending any product.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search words, e.g. 'ammonia analyzer' or 'NRV-2\"'" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_product_details",
    description: "Get the full catalog description (and any extra columns) for up to 6 exact part numbers found via search_products or the catalog index.",
    parameters: {
      type: "object",
      properties: { partNos: { type: "array", items: { type: "string" }, description: "Exact part numbers" } },
      required: ["partNos"],
      additionalProperties: false,
    },
  },
  {
    name: "search_product_pages",
    description:
      "Search the text of the Agua Instruments website product pages (brands such as Hach, Suntex, Maxx, Airpointer, Bettair, LKS, Instran, LAR; monitoring systems; company/contact info). Use it for features, applications and specs not in the catalog. Returns passages with a page link.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search words" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

async function executeTool(name, input) {
  const args = input && typeof input === "object" ? input : {};
  switch (name) {
    case "search_products": {
      const r = await searchProducts(args.query);
      return { result: r.length ? r : { message: "No matching products in the catalog." }, count: r.length };
    }
    case "get_product_details": {
      const r = await getProductDetails(args.partNos);
      return { result: r, count: r.filter((x) => !x.notFound).length };
    }
    case "search_product_pages": {
      const r = await searchProductPages(args.query);
      return { result: r.length ? r : { message: "No matching website content." }, count: r.length };
    }
    default:
      return { result: { error: "Unknown tool" }, count: 0 };
  }
}

module.exports = { TOOLS, executeTool, getCatalogIndex, invalidateCatalog, searchProducts, getProductDetails, searchProductPages };

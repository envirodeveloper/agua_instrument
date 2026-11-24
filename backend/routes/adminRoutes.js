const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const Product = require("../models/Product");
const KnowledgePage = require("../models/KnowledgePage");
const KnowledgeChunk = require("../models/KnowledgeChunk");
const Lead = require("../models/Lead");
const Conversation = require("../models/Conversation");
const Usage = require("../models/Usage");
const { getAiConfig, saveAiConfig, AI_CONFIG_DEFAULTS } = require("../models/Setting");
const { adminLogin, requireAdmin } = require("../middleware/auth");
const { adminLoginLimiter } = require("../middleware/rateLimit");
const { clean, escapeRegex, safeCell } = require("../utils/validate");
const { parseWorkbook, diffWithDb, commitImport, buildWorkbook } = require("../utils/excelProducts");
const { reindexSite, setPageActive } = require("../utils/siteIndexer");
const { invalidateCatalog } = require("../ai/catalog");
const { testProvider, dayKey } = require("../ai/chatService");
const { PROVIDERS, keyStatus, storeProviderBlob, SecretError, looksLikePlainKey, redact } = require("../utils/secretBox");

const router = express.Router();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname)),
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isId = (id) => mongoose.isValidObjectId(id);
const sendXlsx = (res, buf, name) => {
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(Buffer.from(buf));
};

router.post("/login", adminLoginLimiter, adminLogin);
router.use(requireAdmin);

// ---------------------------------------------------------------- summary
router.get(
  "/summary",
  wrap(async (req, res) => {
    const [active, hidden, pages, chunks, leads, quotes, flagged, today, keys, cfg] = await Promise.all([
      Product.countDocuments({ active: true }),
      Product.countDocuments({ active: false }),
      KnowledgePage.countDocuments({ active: true }),
      KnowledgeChunk.countDocuments({ active: true }),
      Lead.countDocuments({}),
      Lead.countDocuments({ status: "quote-requested" }),
      Conversation.countDocuments({ flagged: true }),
      Usage.findById(dayKey()).lean(),
      keyStatus(),
      getAiConfig(),
    ]);
    res.json({
      success: true,
      products: { active, hidden },
      knowledge: { pages, chunks },
      leads: { total: leads, quoteRequested: quotes, flaggedChats: flagged },
      today: today || { messages: 0, tokensIn: 0, tokensOut: 0, blocked: 0 },
      ai: { provider: cfg.activeProvider, model: cfg.models[cfg.activeProvider], enabled: cfg.enabled, keys },
    });
  })
);

// ---------------------------------------------------------------- products
router.get(
  "/products",
  wrap(async (req, res) => {
    const q = clean(req.query.q, 100);
    const status = req.query.status || "all";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(200, Math.max(10, parseInt(req.query.size, 10) || 50));
    const filter = {};
    if (status === "active") filter.active = true;
    if (status === "hidden") filter.active = false;
    if (status === "nodesc") filter.description = { $in: ["", null] };
    if (q) {
      const re = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ partNo: re }, { name: re }, { description: re }];
    }
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ name: 1 }).skip((page - 1) * size).limit(size).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, items, total, page, size });
  })
);

function productInput(b) {
  const partNo = clean(b.partNo, 80).replace(/\s+/g, " ");
  const name = clean(b.name, 300);
  const description = String(b.description ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, 5000);
  const extra = {};
  if (b.extra && typeof b.extra === "object") {
    for (const [k, v] of Object.entries(b.extra).slice(0, 20)) {
      const key = clean(k, 60).replace(/[.$]/g, "_");
      const val = clean(v, 1000);
      if (key && val) extra[key] = val;
    }
  }
  return { partNo, name, description, extra, active: b.active !== false && b.active !== "false" };
}

router.post(
  "/products",
  wrap(async (req, res) => {
    const p = productInput(req.body || {});
    if (!p.partNo || !p.name) return res.status(400).json({ success: false, message: "Part No. and Item Name are required." });
    const key = Product.keyOf(p.partNo);
    if (await Product.exists({ partNoKey: key })) return res.status(409).json({ success: false, message: "That Part No. already exists." });
    const doc = await Product.create({ ...p, partNoKey: key, source: "manual" });
    invalidateCatalog();
    res.json({ success: true, item: doc });
  })
);

router.put(
  "/products/:id",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    const p = productInput(req.body || {});
    if (!p.partNo || !p.name) return res.status(400).json({ success: false, message: "Part No. and Item Name are required." });
    const key = Product.keyOf(p.partNo);
    const clash = await Product.findOne({ partNoKey: key, _id: { $ne: req.params.id } }).lean();
    if (clash) return res.status(409).json({ success: false, message: "Another product already uses that Part No." });
    const doc = await Product.findByIdAndUpdate(req.params.id, { $set: { ...p, partNoKey: key } }, { returnDocument: "after" });
    if (!doc) return res.status(404).json({ success: false, message: "Not found." });
    invalidateCatalog();
    res.json({ success: true, item: doc });
  })
);

// Soft delete (hide from chatbot) by default; ?permanent=1 removes it.
router.delete(
  "/products/:id",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    if (req.query.permanent === "1") await Product.deleteOne({ _id: req.params.id });
    else await Product.updateOne({ _id: req.params.id }, { $set: { active: false } });
    invalidateCatalog();
    res.json({ success: true });
  })
);

router.post(
  "/products/bulk",
  wrap(async (req, res) => {
    const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).filter(isId).slice(0, 1000);
    const action = req.body && req.body.action;
    if (!ids.length) return res.status(400).json({ success: false, message: "No products selected." });
    let r;
    if (action === "hide") r = await Product.updateMany({ _id: { $in: ids } }, { $set: { active: false } });
    else if (action === "show") r = await Product.updateMany({ _id: { $in: ids } }, { $set: { active: true } });
    else if (action === "delete") r = await Product.deleteMany({ _id: { $in: ids } });
    else return res.status(400).json({ success: false, message: "Unknown action." });
    invalidateCatalog();
    res.json({ success: true, affected: r.modifiedCount ?? r.deletedCount ?? 0 });
  })
);

router.get(
  "/products/export",
  wrap(async (req, res) => {
    const filter = req.query.status === "active" ? { active: true } : {};
    const items = await Product.find(filter).sort({ name: 1 }).lean();
    const buf = await buildWorkbook(items);
    sendXlsx(res, buf, `inventory_items_${dayKey()}.xlsx`);
  })
);

router.get(
  "/products/template",
  wrap(async (req, res) => {
    const buf = await buildWorkbook([{ partNo: "ABC-123", name: "Example item name", description: "Example description used by the chatbot", extra: {} }], { template: true });
    sendXlsx(res, buf, "inventory_items_template.xlsx");
  })
);

// Import step 1: upload + preview (nothing is saved yet).
const pendingImports = new Map(); // importId -> { rows, at }
setInterval(() => {
  for (const [id, v] of pendingImports) if (Date.now() - v.at > 20 * 60 * 1000) pendingImports.delete(id);
}, 5 * 60 * 1000).unref();

router.post(
  "/products/import/preview",
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "Please choose an .xlsx file (max 5 MB)." });
    let parsed;
    try {
      parsed = await parseWorkbook(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message || "Could not read the Excel file." });
    }
    const diff = await diffWithDb(parsed.rows);
    const importId = crypto.randomBytes(12).toString("hex");
    pendingImports.set(importId, { rows: parsed.rows, at: Date.now(), file: req.file.originalname });
    const brief = (r) => ({ rowNo: r.rowNo, partNo: r.partNo, name: r.name, changes: r.changes });
    res.json({
      success: true,
      importId,
      file: req.file.originalname,
      sheet: parsed.sheet,
      extraColumns: parsed.columns.extra,
      totalRows: parsed.rows.length,
      errors: parsed.errors,
      added: diff.added.map(brief),
      updated: diff.updated.map(brief),
      unchanged: diff.unchanged.length,
      missing: diff.missing,
    });
  })
);

// Import step 2: commit. mode = merge | replace
router.post(
  "/products/import/commit",
  wrap(async (req, res) => {
    const { importId, mode } = req.body || {};
    const pending = pendingImports.get(String(importId || ""));
    if (!pending) return res.status(400).json({ success: false, message: "This import has expired. Please upload the file again." });
    if (!["merge", "replace"].includes(mode)) return res.status(400).json({ success: false, message: "Choose merge or replace." });
    const result = await commitImport(pending.rows, mode);
    pendingImports.delete(importId);
    invalidateCatalog();
    console.log(`[admin] import committed (${mode}) from ${pending.file}:`, result);
    res.json({ success: true, ...result });
  })
);

// ---------------------------------------------------------------- knowledge (site pages)
router.get(
  "/knowledge",
  wrap(async (req, res) => {
    const pages = await KnowledgePage.find({}).sort({ url: 1 }).lean();
    res.json({ success: true, pages });
  })
);

router.post(
  "/knowledge/reindex",
  wrap(async (req, res) => {
    const report = await reindexSite();
    res.json({ success: true, ...report });
  })
);

router.put(
  "/knowledge/:id",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    const page = await setPageActive(req.params.id, !!(req.body && req.body.active));
    if (!page) return res.status(404).json({ success: false, message: "Not found." });
    res.json({ success: true, page });
  })
);

router.get(
  "/knowledge/:id/chunks",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    const chunks = await KnowledgeChunk.find({ pageId: req.params.id }).select("heading text").lean();
    res.json({ success: true, chunks });
  })
);

// ---------------------------------------------------------------- leads
function leadFilter(q) {
  const f = {};
  const s = clean(q.q, 100);
  if (s) {
    const re = { $regex: escapeRegex(s), $options: "i" };
    f.$or = [{ name: re }, { email: re }, { phone: re }, { company: re }];
  }
  if (q.campaign) f.campaign = clean(q.campaign, 80);
  if (q.status) f.status = clean(q.status, 30);
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    f.createdAt = {};
    if (from && !isNaN(from)) f.createdAt.$gte = from;
    if (to && !isNaN(to)) f.createdAt.$lte = new Date(to.getTime() + 24 * 3600 * 1000 - 1);
  }
  return f;
}

router.get(
  "/leads",
  wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(200, Math.max(10, parseInt(req.query.size, 10) || 50));
    const filter = leadFilter(req.query);
    if (req.query.flagged === "1") {
      const ids = await Conversation.distinct("leadId", { flagged: true });
      filter._id = { $in: ids };
    }
    const [items, total] = await Promise.all([
      Lead.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * size).limit(size).lean(),
      Lead.countDocuments(filter),
    ]);
    const stats = await Conversation.aggregate([
      { $match: { leadId: { $in: items.map((l) => l._id) } } },
      { $group: { _id: "$leadId", chats: { $sum: 1 }, turns: { $sum: "$userTurns" }, flagged: { $max: "$flagged" } } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    res.json({
      success: true,
      total,
      page,
      size,
      items: items.map((l) => ({ ...l, chats: byId.get(String(l._id))?.chats || 0, turns: byId.get(String(l._id))?.turns || 0, flagged: !!byId.get(String(l._id))?.flagged })),
    });
  })
);

router.get(
  "/leads/campaigns",
  wrap(async (req, res) => {
    const list = await Lead.aggregate([{ $match: { campaign: { $ne: "" } } }, { $group: { _id: "$campaign", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
    res.json({ success: true, campaigns: list.map((c) => ({ campaign: c._id, leads: c.n })) });
  })
);

router.get(
  "/leads/export",
  wrap(async (req, res) => {
    const leads = await Lead.find(leadFilter(req.query)).sort({ createdAt: -1 }).limit(10000).lean();
    const convos = await Conversation.find({ leadId: { $in: leads.map((l) => l._id) } }).sort({ createdAt: 1 }).lean();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Leads");
    ws.addRow(["Created", "Name", "Email", "Phone", "Company", "Campaign", "Status", "Visits", "Chats", "Questions asked", "Notes"]);
    ws.getRow(1).font = { bold: true };
    const byLead = new Map();
    for (const c of convos) {
      const k = String(c.leadId);
      byLead.set(k, (byLead.get(k) || []).concat(c));
    }
    for (const l of leads) {
      const cs = byLead.get(String(l._id)) || [];
      ws.addRow([
        new Date(l.createdAt).toISOString().replace("T", " ").slice(0, 16),
        safeCell(l.name), safeCell(l.email), safeCell(l.phone), safeCell(l.company || ""), safeCell(l.campaign || ""),
        l.status, l.visits, cs.length, cs.reduce((n, c) => n + (c.userTurns || 0), 0), safeCell(l.notes || ""),
      ]);
    }
    const ws2 = wb.addWorksheet("Chats");
    ws2.addRow(["Time", "Lead email", "Who", "Message"]);
    ws2.getRow(1).font = { bold: true };
    const emailOf = new Map(leads.map((l) => [String(l._id), l.email]));
    for (const c of convos) {
      for (const m of c.messages) {
        if (m.role === "system-note" && !m.content) continue;
        ws2.addRow([new Date(m.ts).toISOString().replace("T", " ").slice(0, 16), emailOf.get(String(c.leadId)), m.role === "user" ? "Customer" : m.role === "assistant" ? "Bot" : "Note", safeCell(m.content)]);
      }
    }
    ws.columns.forEach((c) => (c.width = 20));
    ws2.columns = [{ width: 18 }, { width: 30 }, { width: 10 }, { width: 100 }];
    sendXlsx(res, await wb.xlsx.writeBuffer(), `leads_${dayKey()}.xlsx`);
  })
);

router.get(
  "/leads/:id",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ success: false, message: "Not found." });
    const conversations = await Conversation.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, lead, conversations });
  })
);

router.put(
  "/leads/:id",
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: "Not found." });
    const set = {};
    const b = req.body || {};
    if (b.status && ["new", "engaged", "quote-requested", "contacted", "closed"].includes(b.status)) set.status = b.status;
    if (b.notes != null) set.notes = clean(b.notes, 2000);
    const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: "after" }).lean();
    res.json({ success: true, lead });
  })
);

// ---------------------------------------------------------------- AI settings
router.get(
  "/ai-config",
  wrap(async (req, res) => {
    const [config, keys] = await Promise.all([getAiConfig(), keyStatus()]);
    const days = [];
    for (let i = 0; i < 14; i++) days.push(dayKey(new Date(Date.now() - i * 86400000)));
    const usage = await Usage.find({ _id: { $in: days } }).sort({ _id: -1 }).lean();
    res.json({ success: true, config, keys, providers: PROVIDERS, defaults: AI_CONFIG_DEFAULTS, usage });
  })
);

const MODEL_RE = /^[A-Za-z0-9._:\-\/]{2,80}$/;
const int = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

router.put(
  "/ai-config",
  wrap(async (req, res) => {
    const b = req.body || {};
    const cur = await getAiConfig();
    const next = { ...cur, models: { ...cur.models } };
    if (b.activeProvider) {
      if (!PROVIDERS.includes(b.activeProvider)) return res.status(400).json({ success: false, message: "Unknown provider." });
      next.activeProvider = b.activeProvider;
    }
    if (b.models && typeof b.models === "object") {
      for (const p of PROVIDERS) {
        if (b.models[p] == null) continue;
        const m = String(b.models[p]).trim();
        if (looksLikePlainKey(m) || !MODEL_RE.test(m)) return res.status(400).json({ success: false, message: `Invalid model name for ${p}.` });
        next.models[p] = m;
      }
    }
    next.maxTurnsPerConversation = int(b.maxTurnsPerConversation, 1, 200, cur.maxTurnsPerConversation);
    next.maxMessagesPerLeadPerDay = int(b.maxMessagesPerLeadPerDay, 1, 1000, cur.maxMessagesPerLeadPerDay);
    next.dailyMessageCap = int(b.dailyMessageCap, 0, 100000, cur.dailyMessageCap);
    next.maxOutputTokens = int(b.maxOutputTokens, 256, 16000, cur.maxOutputTokens);
    if (b.reasoningEffort != null) {
      if (!["none", "low", "medium"].includes(b.reasoningEffort)) return res.status(400).json({ success: false, message: "Reasoning effort must be none, low or medium." });
      next.reasoningEffort = b.reasoningEffort;
    }
    if (b.greeting != null) next.greeting = clean(b.greeting, 500) || cur.greeting;
    if (b.enabled != null) next.enabled = b.enabled === true || b.enabled === "true";
    const config = await saveAiConfig(next);
    res.json({ success: true, config });
  })
);

// Write-only: accepts ONLY an agua-enc:v1 blob produced by the local utility. Never returns it.
router.put(
  "/ai-keys/:provider",
  wrap(async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ success: false, message: "Unknown provider." });
    const blob = String((req.body && req.body.encryptedKey) || "").trim();
    try {
      await storeProviderBlob(provider, blob);
    } catch (e) {
      if (e instanceof SecretError) return res.status(400).json({ success: false, message: e.message });
      throw e;
    }
    console.log(`[admin] encrypted ${provider} key updated`);
    res.json({ success: true });
  })
);

router.post(
  "/ai-config/test",
  wrap(async (req, res) => {
    const provider = (req.body && req.body.provider) || (await getAiConfig()).activeProvider;
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ success: false, message: "Unknown provider." });
    const model = req.body && req.body.model ? String(req.body.model).trim() : undefined;
    if (model && !MODEL_RE.test(model)) return res.status(400).json({ success: false, message: "Invalid model name." });
    try {
      res.json({ success: true, ...(await testProvider(provider, model)) });
    } catch (e) {
      res.status(400).json({ success: false, message: redact(e.message || "Test failed") });
    }
  })
);

// Admin-scoped error handler that never leaks internals.
router.use((err, req, res, next) => {
  console.error("[admin] error:", redact(err && err.message));
  res.status(500).json({ success: false, message: "Server error." });
});

module.exports = router;

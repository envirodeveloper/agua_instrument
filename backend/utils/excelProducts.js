// Excel <-> products. Columns are matched by HEADER NAME (not position), so the sheet can be
// re-ordered or gain new columns later. Unknown columns are kept in product.extra and are also
// shown to the chatbot.
const ExcelJS = require("exceljs");
const Product = require("../models/Product");

const HEADER_ALIASES = {
  partNo: ["part no", "part no.", "part number", "partno", "part #", "part", "item code", "code", "sku", "model", "model no", "model no."],
  name: ["item name", "name", "product", "product name", "item", "title"],
  description: ["description", "desc", "details", "specification", "specifications", "specs"],
  active: ["active", "show in chatbot", "visible"],
};
const IGNORED_EXTRA = new Set(["updated", "updated at", "last updated", "created", "created at"]);

const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v);
}

const toBool = (s) => !/^(no|n|false|0|hidden|inactive)$/i.test(String(s).trim());

// Returns { rows: [{rowNo, partNo, name, description, extra, active}], errors: [...], columns, sheet }
async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) throw new Error("The workbook has no data.");

  // Header = first row that contains a part-number-like and a name-like header (within first 10 rows).
  let headerRowNo = 0;
  let map = null;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const m = { extra: {} };
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = norm(cellText(cell));
      if (!h) return;
      const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(h));
      if (field && m[field] == null) m[field] = col;
      else if (!IGNORED_EXTRA.has(h)) m.extra[col] = cellText(cell).trim();
    });
    if (m.partNo && m.name) { headerRowNo = r; map = m; break; }
  }
  if (!map) throw new Error('Could not find header columns. The sheet needs at least "Part No." and "Item Name" headers.');

  const rows = [];
  const errors = [];
  const seen = new Map();
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (col) => (col ? cellText(row.getCell(col)).trim() : "");
    const partNo = get(map.partNo).replace(/\s+/g, " ");
    const name = get(map.name);
    const description = get(map.description);
    const extra = {};
    for (const [col, header] of Object.entries(map.extra)) {
      const v = get(Number(col));
      if (v) extra[header.replace(/[.$]/g, "_").slice(0, 60)] = v.slice(0, 1000);
    }
    if (!partNo && !name && !description && !Object.keys(extra).length) continue; // blank row
    if (!partNo) { errors.push({ rowNo: r, message: "Missing Part No." }); continue; }
    if (!name) { errors.push({ rowNo: r, partNo, message: "Missing Item Name" }); continue; }
    const key = Product.keyOf(partNo);
    if (seen.has(key)) { errors.push({ rowNo: r, partNo, message: `Duplicate Part No. (also on row ${seen.get(key)})` }); continue; }
    seen.set(key, r);
    rows.push({
      rowNo: r,
      partNo: partNo.slice(0, 80),
      partNoKey: key,
      name: name.slice(0, 300),
      description: description.slice(0, 5000),
      extra,
      active: map.active ? toBool(get(map.active) || "yes") : true,
    });
  }
  return { rows, errors, columns: { headerRow: headerRowNo, extra: Object.values(map.extra) }, sheet: ws.name };
}

const sameExtra = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());

// Compare parsed rows with the DB.
async function diffWithDb(rows) {
  const existing = await Product.find({}).lean();
  const byKey = new Map(existing.map((p) => [p.partNoKey, p]));
  const added = [], updated = [], unchanged = [], reactivated = [];
  const fileKeys = new Set();
  for (const r of rows) {
    fileKeys.add(r.partNoKey);
    const p = byKey.get(r.partNoKey);
    if (!p) { added.push(r); continue; }
    const changes = [];
    if (p.partNo !== r.partNo) changes.push("partNo");
    if (p.name !== r.name) changes.push("name");
    if ((p.description || "") !== r.description) changes.push("description");
    if (!sameExtra(p.extra, r.extra)) changes.push("extra columns");
    if (p.active !== r.active) changes.push(r.active ? "re-activated" : "hidden");
    if (!p.active && r.active) reactivated.push(r.partNo);
    if (changes.length) updated.push({ ...r, changes, before: { name: p.name, description: p.description } });
    else unchanged.push(r.partNo);
  }
  const missing = existing.filter((p) => p.active && !fileKeys.has(p.partNoKey)).map((p) => ({ partNo: p.partNo, name: p.name }));
  return { added, updated, unchanged, missing, reactivated };
}

// mode: "merge" (add/update only) | "replace" (also hide products missing from the file)
async function commitImport(rows, mode) {
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { partNoKey: r.partNoKey },
      update: {
        $set: { partNo: r.partNo, name: r.name, description: r.description, extra: r.extra, active: r.active, source: "excel-import" },
        $setOnInsert: { partNoKey: r.partNoKey },
      },
      upsert: true,
    },
  }));
  let res = { upserted: 0, modified: 0, hidden: 0 };
  if (ops.length) {
    const b = await Product.bulkWrite(ops, { ordered: false });
    res.upserted = b.upsertedCount || 0;
    res.modified = b.modifiedCount || 0;
  }
  if (mode === "replace") {
    const keys = rows.map((r) => r.partNoKey);
    const h = await Product.updateMany({ partNoKey: { $nin: keys }, active: true }, { $set: { active: false } });
    res.hidden = h.modifiedCount || 0;
  }
  return res;
}

async function buildWorkbook(products, { template = false } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agua Instruments admin";
  const ws = wb.addWorksheet("Inventory Items");
  const extraHeaders = [];
  for (const p of products) for (const k of Object.keys(p.extra || {})) if (!extraHeaders.includes(k)) extraHeaders.push(k);
  const headers = ["Part No.", "Item Name", "Description", ...extraHeaders, ...(template ? [] : ["Active", "Updated"])];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const guard = (s) => (/^[=+\-@]/.test(String(s ?? "")) ? "'" + s : s ?? "");
  for (const p of products) {
    const ex = p.extra || {};
    ws.addRow([
      guard(p.partNo), guard(p.name), guard(p.description),
      ...extraHeaders.map((h) => guard(ex[h] || "")),
      ...(template ? [] : [p.active ? "Yes" : "No", p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : ""]),
    ]);
  }
  ws.columns.forEach((c, i) => { c.width = [16, 40, 90][i] || 18; });
  ws.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  return wb.xlsx.writeBuffer();
}

module.exports = { parseWorkbook, diffWithDb, commitImport, buildWorkbook };

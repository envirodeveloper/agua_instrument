const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

// Folder for visitors.xlsx. Uses DATA_DIR from .env if it can be created/written,
// otherwise falls back to backend/data so the file is never lost or silently missing.
const DEFAULT_DIR = path.join(__dirname, "..", "data");
function pickDataDir() {
  const wanted = process.env.DATA_DIR;
  if (wanted) {
    try {
      fs.mkdirSync(wanted, { recursive: true });
      fs.accessSync(wanted, fs.constants.W_OK);
      return path.resolve(wanted);
    } catch (e) {
      console.warn("DATA_DIR '" + wanted + "' is not usable here (" + e.code + "). Using " + DEFAULT_DIR);
    }
  }
  fs.mkdirSync(DEFAULT_DIR, { recursive: true });
  return DEFAULT_DIR;
}
const DATA_DIR = pickDataDir();
const FILE_PATH = path.join(DATA_DIR, "aguainstruments-visitors.xlsx");

// If an older visitors.xlsx exists, keep its data by renaming it to the new name
const OLD_PATH = path.join(DATA_DIR, "visitors.xlsx");
if (!fs.existsSync(FILE_PATH) && fs.existsSync(OLD_PATH)) fs.renameSync(OLD_PATH, FILE_PATH);
const SHEET_NAME = "Visitors";

const COLUMNS = [
  { header: "Sr No", key: "sr", width: 8 },
  { header: "Name", key: "name", width: 28 },
  { header: "Email", key: "email", width: 34 },
  { header: "Mobile Number", key: "phone", width: 16 },
  { header: "Education", key: "education", width: 40 },
  { header: "Submitted Date", key: "date", width: 16 },
  { header: "Submitted Time", key: "time", width: 16 },
  { header: "Website", key: "website", width: 26 },
];

// All writes go through this queue, one at a time, so two visitors
// submitting together can never corrupt or overwrite each other's row.
let queue = Promise.resolve();

function istParts(d = new Date()) {
  const fmt = (opts) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(d);
  return {
    date: fmt({ day: "2-digit", month: "2-digit", year: "numeric" }), // 16/11/2026
    time: fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
  };
}

async function loadWorkbook() {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(FILE_PATH)) {
    await wb.xlsx.readFile(FILE_PATH);
    let ws = wb.getWorksheet(SHEET_NAME);
    if (!ws) ws = createSheet(wb);
    return { wb, ws };
  }
  return { wb, ws: createSheet(wb) };
}

function createSheet(wb) {
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS;
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  return ws;
}

function appendVisitor({ name, email, phone, education, website }) {
  const job = queue.then(async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const { wb, ws } = await loadWorkbook();
    // re-apply keys so addRow with an object works on a re-opened file
    ws.columns = COLUMNS;
    // files made before the Website column existed get the new header, styled like the others
    const head = ws.getRow(1);
    head.getCell(COLUMNS.length).style = head.getCell(COLUMNS.length - 1).style;

    const { date, time } = istParts();
    ws.addRow({
      sr: ws.rowCount, // header is row 1, so first visitor gets 1
      name,
      email,
      phone, // stored as text so leading zeros / long numbers are safe
      education,
      date,
      time,
      website: website || "",
    });

    // write to a temp file, then rename: a crash mid-write cannot damage the real file
    const tmp = FILE_PATH + ".tmp";
    await wb.xlsx.writeFile(tmp);
    fs.renameSync(tmp, FILE_PATH);

  });
  // keep the queue alive even if one job fails
  queue = job.catch(() => {});
  return job;
}

module.exports = { appendVisitor, FILE_PATH };

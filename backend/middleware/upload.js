const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Resumes are saved here. On Hostinger set UPLOAD_DIR to a folder OUTSIDE the app
// (e.g. /home/u308786844/visitor-data/resumes) so redeploys never delete them.
const DEFAULT_UPLOAD_DIR = path.join(__dirname, "..", "uploads");
function pickUploadDir() {
  const wanted = process.env.UPLOAD_DIR;
  if (wanted) {
    try {
      fs.mkdirSync(wanted, { recursive: true });
      fs.accessSync(wanted, fs.constants.W_OK);
      return path.resolve(wanted);
    } catch (e) {
      console.warn("UPLOAD_DIR '" + wanted + "' is not usable here (" + e.code + "). Using " + DEFAULT_UPLOAD_DIR);
    }
  }
  fs.mkdirSync(DEFAULT_UPLOAD_DIR, { recursive: true });
  return DEFAULT_UPLOAD_DIR;
}
const UPLOAD_DIR = pickUploadDir();

const ALLOWED_EXT = [".pdf", ".doc", ".docx"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `resume-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXT.includes(ext)) return cb(null, true);
  cb(new Error("Only .pdf, .doc, .docx files are allowed."));
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE, files: 1 } });

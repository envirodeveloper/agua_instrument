const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const upload = require("../middleware/upload");

const router = express.Router();

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

// Run multer, and turn its errors (wrong type, too big) into a clean JSON reply
const handleUpload = (req, res, next) => {
  upload.single("resume")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Resume must be smaller than 5 MB." : err.message;
    res.status(400).json({ success: false, message });
  });
};

router.post("/", handleUpload, async (req, res) => {
  const body = req.body || {};
  const fullname = clean(body.fullname, 100);
  const address = clean(body.address, 300);
  const phone = clean(body.phone, 20).replace(/\D/g, "");
  const qualification = clean(body.qualification, 200);
  const skills = clean(body.skills, 1000);

  if (!fullname || !address || !phone || !qualification || !req.file) {
    return res.status(400).json({ success: false, message: "All fields and a resume are required." });
  }
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: "Phone number must be 10 digits." });
  }

  // Rename the saved resume to: Name_Phone_Date.ext  (e.g. Asha_Sharma_9820012345_2026-11-16.pdf)
  const safeName = fullname.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Applicant";
  const stamp = new Date().toISOString().slice(0, 10);
  const ext = path.extname(req.file.filename).toLowerCase();
  let finalName = `${safeName}_${phone}_${stamp}${ext}`;
  let finalPath = path.join(path.dirname(req.file.path), finalName);
  for (let i = 2; fs.existsSync(finalPath); i++) {          // same person applying again
    finalName = `${safeName}_${phone}_${stamp}_${i}${ext}`;
    finalPath = path.join(path.dirname(req.file.path), finalName);
  }
  try {
    fs.renameSync(req.file.path, finalPath);
  } catch (err) {
    console.error("Resume rename error:", err);
    finalName = req.file.filename;
    finalPath = req.file.path;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_RECEIVER,
      subject: `New Career Application from ${fullname}`,
      text:
        `Name: ${fullname}\nPhone: ${phone}\nQualification: ${qualification}\n` +
        `Skills & Experience: ${skills}\nAddress: ${address}`,
      attachments: [{ filename: finalName, path: finalPath }],
    });

    res.status(200).json({ success: true, message: "Application submitted!" });
  } catch (err) {
    console.error("Career error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;


// Load .env first
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const contactRoutes = require("./routes/contactRoutes");
const careerRoutes = require("./routes/careerRoutes");
const visitorRoutes = require("./routes/visitorRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = [
  "https://www.aguainstruments.com",
  "https://aguainstruments.com",
];

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
  origin: (origin, cb) => {
    if (
      !origin ||
      ALLOWED_ORIGINS.includes(origin) ||
      LOCAL_ORIGIN.test(origin)
    ) {
      return cb(null, true);
    }
    cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Serve frontend website
app.use(express.static(path.join(__dirname, "../frontend")));

// API routes
app.use("/api/contact", contactRoutes);
app.use("/api/careers", careerRoutes);
app.use("/api/visitors", visitorRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Server error."
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Visitors Excel file: ${
      require("./utils/excelStore").FILE_PATH
    }`
  );

  if (!process.env.ADMIN_KEY) {
    console.warn("ADMIN_KEY is not set.");
  }
});

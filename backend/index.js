
// Load .env first (backend/.env, then the repo-root .env). On Hostinger, variables come from the panel.
const path = require("path");
require("dotenv").config({ path: [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")], quiet: true });

// SECURITY: only API keys encrypted with our local utility may be used. The AI SDKs would
// otherwise silently fall back to plain keys / base URLs in env vars, so remove them up front.
const { scrubSdkEnv } = require("./utils/secretBox");
const scrubbed = scrubSdkEnv();
if (scrubbed.length) {
  console.warn(`[security] Ignored and removed AI SDK environment variables: ${scrubbed.join(", ")}. Only encrypted keys stored via the local utility are used.`);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const contactRoutes = require("./routes/contactRoutes");
const careerRoutes = require("./routes/careerRoutes");
const visitorRoutes = require("./routes/visitorRoutes");
const enquiryRoutes = require("./routes/enquiryRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { connectDb } = require("./utils/db");

const app = express();
const PORT = process.env.PORT || 5000;

// Hostinger runs the app behind a proxy; needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);
app.disable("x-powered-by");

const ALLOWED_ORIGINS = [
  "https://www.aguainstruments.com",
  "https://aguainstruments.com",
];

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Existing pages use inline scripts and CDNs, so CSP stays off; the other helmet headers apply.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

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
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Keep the enquiry and admin pages out of search engines.
app.use((req, res, next) => {
  if (/^\/(enquiry(\.html)?|admin-[\w-]+\.html)$/i.test(req.path)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

// Clean URL for the emailed link: https://www.aguainstruments.com/enquiry?src=campaign-name
app.get("/enquiry", (req, res) => res.sendFile(path.join(__dirname, "../frontend/enquiry.html")));

// Serve frontend website
app.use(express.static(path.join(__dirname, "../frontend")));

// API routes
app.use("/api/contact", contactRoutes);
app.use("/api/careers", careerRoutes);
app.use("/api/visitors", visitorRoutes);
app.use("/api/enquiry", enquiryRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(require("./utils/secretBox").redact(err && (err.stack || err.message)));
  res.status(500).json({
    success: false,
    message: "Server error."
  });
});

// Connect to MongoDB, retrying in the background so the website stays up even if the DB is briefly unreachable.
function connectWithRetry() {
  connectDb().catch((e) => {
    console.error("[db] MongoDB connection failed:", require("./utils/secretBox").redact(e.message), "— retrying in 30s");
    setTimeout(connectWithRetry, 30_000).unref();
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Visitors Excel file: ${
      require("./utils/excelStore").FILE_PATH
    }`
  );

  for (const v of ["ADMIN_KEY", "MONGO_URI", "ENCRYPTION_KEY", "JWT_SECRET"]) {
    if (!process.env[v]) console.warn(`${v} is not set.`);
  }
  if (process.env.MONGO_URI) {
    connectWithRetry();
    // Closes chats idle for 30 min (customer closed the tab) and emails their transcripts.
    require("./utils/chatTranscript").startChatSweeper();
  }
});

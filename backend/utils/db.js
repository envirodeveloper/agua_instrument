const dns = require("dns");
const mongoose = require("mongoose");

let connecting = null;
let usedDnsFallback = false;

// Some networks (ISP routers, VPNs, antivirus DNS proxies on Windows) refuse the SRV
// lookup that mongodb+srv:// URIs need ("querySrv ECONNREFUSED"). When that happens,
// switch Node's resolver to public DNS (override with DNS_SERVERS=ip1,ip2) and retry.
function isSrvDnsError(e) {
  return /querySrv|queryTxt/i.test(e && e.message) && /ECONNREFUSED|ETIMEOUT|ESERVFAIL|ENOTFOUND/i.test(e.message);
}

async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connecting) return connecting;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");
  mongoose.set("strictQuery", true);
  connecting = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 15000, maxPoolSize: 10 })
    .then(async () => {
      // Make sure text/unique indexes exist (cheap no-op when already built).
      const models = ["Product", "KnowledgePage", "KnowledgeChunk", "Lead", "Conversation"];
      for (const m of models) {
        try { await require(`../models/${m}`).syncIndexes(); } catch (e) { console.warn(`[db] index sync ${m}:`, e.message); }
      }
      console.log("[db] MongoDB connected");
      return mongoose.connection;
    })
    .catch((e) => {
      connecting = null;
      if (!usedDnsFallback && uri.startsWith("mongodb+srv://") && isSrvDnsError(e)) {
        usedDnsFallback = true;
        const servers = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map((s) => s.trim()).filter(Boolean);
        console.warn(`[db] SRV DNS lookup failed on the system resolver; retrying with ${servers.join(", ")}`);
        dns.setServers(servers);
        return connectDb();
      }
      throw e;
    });
  return connecting;
}

const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = { connectDb, isDbReady };

const mongoose = require("mongoose");

let connecting = null;

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
      throw e;
    });
  return connecting;
}

const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = { connectDb, isDbReady };

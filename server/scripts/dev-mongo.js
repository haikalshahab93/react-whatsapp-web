#!/usr/bin/env node
/**
 * Starts a throwaway in-memory MongoDB for local development.
 *
 *   node server/scripts/dev-mongo.js        # listens on 127.0.0.1:27017
 *
 * Requires the optional dev dependency:
 *   npm install --no-save mongodb-memory-server
 *
 * Everything is kept in memory, so data disappears when the process stops.
 * Use a real MongoDB (set MONGO_URI) when you need data to survive restarts.
 */
const path = require("path");

// Resolve from the repo root (where the script is usually run from) or from server/node_modules.
const candidates = ["mongodb-memory-server", path.resolve(__dirname, "../node_modules/mongodb-memory-server")];
let MongoMemoryServer;
for (const candidate of candidates) {
  try {
    ({ MongoMemoryServer } = require(candidate));
    break;
  } catch {
    /* try the next location */
  }
}
if (!MongoMemoryServer) {
  console.error(
    "mongodb-memory-server is not installed.\n" +
      "Run: npm install --no-save mongodb-memory-server\n" +
      "or point MONGO_URI at your own MongoDB instance."
  );
  process.exit(1);
}

const PORT = Number(process.env.MONGO_PORT || 27017);

(async () => {
  const server = await MongoMemoryServer.create({
    instance: { port: PORT, dbName: "chateasy_dev", ip: "127.0.0.1" },
  });
  console.log("MONGO_READY", server.getUri());

  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
})().catch((error) => {
  console.error("Failed to start in-memory MongoDB:", error.message);
  process.exit(1);
});

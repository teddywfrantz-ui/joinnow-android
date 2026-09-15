import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { setupWebSocket } from "./websocket";
import { runStartupSeed } from "./startup-seed";
import { closePool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const webSocketServer = setupWebSocket(server);

async function start() {
  const sessionReady = app.locals.sessionReady as Promise<void> | undefined;
  if (sessionReady) await sessionReady;

  server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
    if (process.env.NODE_ENV !== "production" && process.env.DISABLE_STARTUP_SEED !== "true") {
      runStartupSeed().catch((err) => {
        logger.error({ err }, "Startup seed failed");
      });
    }
  });
}

start().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  webSocketServer.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await (app.locals.sessionPool as { end: () => Promise<void> } | undefined)?.end();
  await closePool();
}

process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));
process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));

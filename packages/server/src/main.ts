// Entry point: node --experimental-strip-types packages/server/src/main.ts
// Config comes from GROUNDWORK_* environment variables (see config.ts).

import { loadConfig } from "./config.ts";
import { startServer } from "./server.ts";

const config = loadConfig(process.env);
const server = await startServer(config);
const h = server.health();
if (server.archived !== undefined) {
  console.log(`groundwork: the old world was an older format, kept as ${server.archived}. A new world started`);
}
console.log(`groundwork: listening on ${config.host}:${server.port}, data in ${config.dataDir}, ${h.town}, ${h.date} (tick ${h.tick})`);

let stopping = false;
const stop = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  console.log(`groundwork: ${signal}, saving and stopping at tick ${server.health().tick}`);
  await server.close();
  process.exit(0);
};
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));

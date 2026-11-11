// A throwaway server for the client smoke test: it wipes its data dir first,
// so every run starts from a brand new world. Same config as main.ts.

import { rmSync } from "node:fs";
import { loadConfig } from "../src/config.ts";
import { startServer } from "../src/server.ts";

const config = loadConfig(process.env);
rmSync(config.dataDir, { recursive: true, force: true });
const server = await startServer(config);
console.log(`groundwork test server: listening on ${config.host}:${server.port}, client from ${config.clientDir}`);

const stop = async (): Promise<void> => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

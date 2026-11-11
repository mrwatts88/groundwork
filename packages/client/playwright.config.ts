// Client smoke test (DESIGN.md 17). Starts a fresh test server that serves the
// built client, so the browser loads everything from one port. Run it with
// `pnpm --filter @groundwork/client smoke`, which builds the client first.

import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repo = join(import.meta.dirname, "..", "..");
const SMOKE_PORT = 8791;
/** The fast-clock test server. smoke.spec.ts reaches it as FAST_URL. */
const FAST_PORT = 8792;

/** A fresh test server on a port with its own data dir and tick length. */
function testServer(port: number, data: string, tickMs: number) {
  return {
    command: "node --experimental-strip-types --no-warnings packages/server/scripts/test-server.ts",
    cwd: repo,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: "pipe" as const,
    env: {
      GROUNDWORK_PORT: String(port),
      GROUNDWORK_HOST: "127.0.0.1",
      GROUNDWORK_DATA_DIR: join(repo, "test-results", data),
      GROUNDWORK_CLIENT_DIR: join(import.meta.dirname, "dist"),
      GROUNDWORK_SEED: "1",
      GROUNDWORK_MAP_SIZE: "128",
      GROUNDWORK_TICK_MS: String(tickMs),
    },
  };
}

export default defineConfig({
  testDir: "e2e",
  outputDir: join(repo, "test-results", "playwright"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${SMOKE_PORT}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    testServer(SMOKE_PORT, "smoke-data", 250),
    // A fast clock, so a survey finishes within a test: 6 game hours in 9 seconds.
    testServer(FAST_PORT, "smoke-data-fast", 25),
  ],
});

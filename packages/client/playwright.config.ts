// Client smoke test (DESIGN.md 17). Starts a fresh test server that serves the
// built client, so the browser loads everything from one port. Run it with
// `pnpm --filter @groundwork/client smoke`, which builds the client first.

import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repo = join(import.meta.dirname, "..", "..");
const SMOKE_PORT = 8791;

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
  webServer: {
    command: "node --experimental-strip-types --no-warnings packages/server/scripts/test-server.ts",
    cwd: repo,
    url: `http://127.0.0.1:${SMOKE_PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: "pipe",
    env: {
      GROUNDWORK_PORT: String(SMOKE_PORT),
      GROUNDWORK_HOST: "127.0.0.1",
      GROUNDWORK_DATA_DIR: join(repo, "test-results", "smoke-data"),
      GROUNDWORK_CLIENT_DIR: join(import.meta.dirname, "dist"),
      GROUNDWORK_SEED: "1",
      GROUNDWORK_MAP_SIZE: "128",
      GROUNDWORK_TICK_MS: "250",
    },
  },
});

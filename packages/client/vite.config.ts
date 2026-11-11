// Vite builds the client into dist/, which the server serves at /. In
// development, `pnpm --filter @groundwork/client dev` proxies /ws and /health
// to a server on port 8787.

import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
      "/health": "http://127.0.0.1:8787",
    },
  },
});

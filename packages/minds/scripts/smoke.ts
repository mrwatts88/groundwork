// Live mind smoke (plan item R0-10). One real `claude -p` call as a named NPC
// through the Mind, the governor and a SQLite usage recorder. Not part of
// pnpm test or make check: it spends real subscription budget.
//
//   pnpm --filter @groundwork/minds smoke
//
// GROUNDWORK_DATA_DIR picks the world SQLite (default ~/.local/share/groundwork).
// GROUNDWORK_CLAUDE_BIN picks the binary (default ~/.local/bin/claude).

import { homedir } from "node:os";
import { join } from "node:path";
import { BudgetGovernor, ClaudeCliBackend, DEFAULT_CLAUDE_MODELS, Mind, SqliteUsageRecorder } from "../src/index.ts";

const dataDir = process.env["GROUNDWORK_DATA_DIR"] || join(homedir(), ".local/share/groundwork");
const binary = process.env["GROUNDWORK_CLAUDE_BIN"] || join(homedir(), ".local/bin/claude");

const recorder = new SqliteUsageRecorder(dataDir);
const mind = new Mind({
  backend: new ClaudeCliBackend({ binary, models: DEFAULT_CLAUDE_MODELS }),
  governor: new BudgetGovernor(),
  recorder,
});

const outcome = await mind.think({
  agent: "Ada Fenwick",
  tier: "deliberation",
  priority: "low",
  persona:
    "You are Ada Fenwick, a road builder in a small isometric town. You answer only with the JSON the schema asks for. Keep notes short.",
  prompt:
    "Your plot runs from (10,10) to (14,14). The town hall is east of it. Lay one road tile toward the town hall, with op set to \"smoke-1\", and write one short note about why.",
});

const row = recorder.recent(1)[0];
recorder.close();
console.log(JSON.stringify({ outcome, usage: row }, null, 2));

if (outcome.status !== "ok" || row === undefined || !row.ok) process.exit(1);
const tokens = row.inputTokens + row.outputTokens;
if (tokens >= 3000) {
  console.error(`smoke: ${tokens} tokens, over the 3000 limit`);
  process.exit(1);
}
console.log(`smoke: ok, ${tokens} tokens, ${row.ms} ms, as ${row.agent}`);

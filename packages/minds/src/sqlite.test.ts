import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteUsageRecorder } from "./sqlite.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("SqliteUsageRecorder", () => {
  it("writes rows that survive reopening", () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-usage-"));
    dirs.push(dir);
    const a = new SqliteUsageRecorder(dir, () => 1000);
    a.record({ agent: "Ada", backend: "fake", model: "m", inputTokens: 10, outputTokens: 5, ms: 3, ok: true });
    a.record({ agent: "Ada", backend: "fake", model: "m", inputTokens: 0, outputTokens: 0, ms: 1, ok: false, error: "timeout" });
    a.close();
    const b = new SqliteUsageRecorder(dir);
    const rows = b.recent();
    b.close();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ok: false, error: "timeout" });
    expect(rows[1]).toMatchObject({ agent: "Ada", inputTokens: 10, outputTokens: 5, ok: true, at: 1000 });
    expect(rows[1]).not.toHaveProperty("error");
  });
});

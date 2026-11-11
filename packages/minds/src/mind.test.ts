import { describe, expect, it } from "vitest";
import { ClaudeCliBackend, type ProcessRunner } from "./claude.ts";
import { FakeBackend, promptHash } from "./fake.ts";
import { BudgetGovernor } from "./governor.ts";
import { MemoryRecorder, Mind } from "./mind.ts";
import type { MindRequest } from "./types.ts";

const req: MindRequest = {
  agent: "rival-1",
  tier: "deliberation",
  priority: "normal",
  persona: "You run a quarry.",
  prompt: "Cash 500. What now?",
};

const good = { commands: [], notes: ["wait"] };

/** A clock that advances 25 ms every time it is read. */
function ticking(): () => number {
  let t = 0;
  return () => (t += 25);
}

describe("mind", () => {
  it("records a usage row for every successful call", async () => {
    const recorder = new MemoryRecorder();
    const mind = new Mind({
      backend: new FakeBackend({ recordings: { [promptHash(req)]: good }, model: "fake-haiku" }),
      governor: new BudgetGovernor(),
      recorder,
      now: ticking(),
    });
    expect(await mind.think(req)).toEqual({ status: "ok", reply: good });
    expect(recorder.rows).toHaveLength(1);
    const row = recorder.rows[0]!;
    expect(row).toMatchObject({ agent: "rival-1", backend: "fake", model: "fake-haiku", ms: 25, ok: true });
    expect(row.inputTokens).toBeGreaterThan(0);
    expect(row.outputTokens).toBeGreaterThan(0);
  });

  it("records a failed call with ok false and the error code", async () => {
    const recorder = new MemoryRecorder();
    const mind = new Mind({ backend: new FakeBackend(), governor: new BudgetGovernor(), recorder, now: ticking() });
    const out = await mind.think(req);
    expect(out.status).toBe("error");
    expect(recorder.rows).toEqual([
      { agent: "rival-1", backend: "fake", model: "unknown", inputTokens: 0, outputTokens: 0, ms: 25, ok: false, error: "no_recording" },
    ]);
  });

  it("records claude -p usage, including on a schema-invalid reply", async () => {
    const replies = [
      { structured_output: good, usage: { input_tokens: 1200, output_tokens: 40 } },
      { structured_output: { commands: "none" }, usage: { input_tokens: 1100, output_tokens: 30 } },
    ];
    let i = 0;
    const run: ProcessRunner = async () => ({ exitCode: 0, stdout: JSON.stringify(replies[i++]), stderr: "", timedOut: false });
    const recorder = new MemoryRecorder();
    const mind = new Mind({
      backend: new ClaudeCliBackend({ binary: "/nonexistent/claude", models: { deliberation: "haiku", conversation: "sonnet" }, run }),
      governor: new BudgetGovernor(),
      recorder,
      now: ticking(),
    });
    expect((await mind.think(req)).status).toBe("ok");
    expect((await mind.think(req)).status).toBe("error");
    expect(recorder.rows).toEqual([
      { agent: "rival-1", backend: "claude-cli", model: "haiku", inputTokens: 1200, outputTokens: 40, ms: 25, ok: true },
      {
        agent: "rival-1",
        backend: "claude-cli",
        model: "haiku",
        inputTokens: 1100,
        outputTokens: 30,
        ms: 25,
        ok: false,
        error: "schema_invalid",
      },
    ]);
  });

  it("does not call the backend when the governor defers or refuses", async () => {
    const fake = new FakeBackend({ rules: [() => good] });
    const recorder = new MemoryRecorder();
    const mind = new Mind({ backend: fake, governor: new BudgetGovernor({ callsPerHour: 1 }), recorder, now: () => 0 });
    expect((await mind.think(req)).status).toBe("ok");
    expect(await mind.think(req)).toMatchObject({ status: "deferred" });
    expect(await mind.think({ ...req, priority: "low" })).toMatchObject({ status: "refused" });
    expect((await mind.think({ ...req, tier: "conversation" })).status).toBe("ok");
    expect(fake.calls).toHaveLength(2);
    expect(recorder.rows).toHaveLength(2);
  });
});

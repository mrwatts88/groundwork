// The claude -p backend against a stubbed process. No test here spawns claude.

import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ClaudeCliBackend, claudeArgs, runProcess, type ProcessResult, type ProcessRunner, type RunOptions } from "./claude.ts";
import { MIND_REPLY_SCHEMA_JSON } from "./reply.ts";
import { MindError, type MindRequest } from "./types.ts";

const BINARY = "/home/mattwatts/.local/bin/claude";

const req: MindRequest = {
  agent: "rival-1",
  tier: "deliberation",
  priority: "normal",
  persona: "You run a quarry.",
  prompt: "Cash 500. What now?",
};

const good = { commands: [{ type: "place_road", op: "rival-1", x: 3, y: 4 }], notes: ["start small"] };

function claudeJson(extra: Record<string, unknown>): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "",
    usage: { input_tokens: 1000, cache_creation_input_tokens: 150, cache_read_input_tokens: 50, output_tokens: 80 },
    ...extra,
  });
}

interface Seen {
  file: string;
  args: readonly string[];
  options: RunOptions;
  cwdExisted: boolean;
  cwdEntries: string[];
}

function stub(result: Partial<ProcessResult> | Error): { run: ProcessRunner; seen: Seen[] } {
  const seen: Seen[] = [];
  const run: ProcessRunner = async (file, args, options) => {
    seen.push({
      file,
      args,
      options,
      cwdExisted: existsSync(options.cwd),
      cwdEntries: existsSync(options.cwd) ? readdirSync(options.cwd) : [],
    });
    if (result instanceof Error) throw result;
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...result };
  };
  return { run, seen };
}

function backend(run: ProcessRunner): ClaudeCliBackend {
  return new ClaudeCliBackend({ binary: BINARY, models: { deliberation: "haiku", conversation: "sonnet" }, run });
}

async function failure(b: ClaudeCliBackend, r: MindRequest = req): Promise<MindError> {
  const e = await b.call(r).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(MindError);
  return e as MindError;
}

describe("claude -p backend", () => {
  it("builds the exact flags from DESIGN.md 13.4", () => {
    expect(claudeArgs(req, "haiku")).toEqual([
      "-p",
      "Cash 500. What now?",
      "--model",
      "haiku",
      "--output-format",
      "json",
      "--tools",
      "",
      "--system-prompt",
      "You run a quarry.",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--json-schema",
      MIND_REPLY_SCHEMA_JSON,
    ]);
  });

  it("runs the configured absolute binary in an empty working dir and parses structured_output", async () => {
    const { run, seen } = stub({ stdout: claudeJson({ structured_output: good }) });
    const { reply, usage } = await backend(run).call(req);
    expect(reply).toEqual(good);
    expect(usage).toEqual({ model: "haiku", inputTokens: 1200, outputTokens: 80 });
    expect(seen).toHaveLength(1);
    const call = seen[0]!;
    expect(call.file).toBe(BINARY);
    expect(call.args).toEqual(claudeArgs(req, "haiku"));
    expect(call.cwdExisted).toBe(true);
    expect(call.cwdEntries).toEqual([]);
    expect(call.options.cwd).not.toBe(process.cwd());
    expect(existsSync(call.options.cwd)).toBe(false);
  });

  it("picks the model by tier from config", async () => {
    const { run, seen } = stub({ stdout: claudeJson({ structured_output: good }) });
    await backend(run).call({ ...req, tier: "conversation" });
    expect(seen[0]!.args[3]).toBe("sonnet");
  });

  it("rejects output that is not JSON as malformed_output", async () => {
    const { run } = stub({ stdout: "Sure! Here is my plan." });
    expect((await failure(backend(run))).code).toBe("malformed_output");
  });

  it("rejects JSON with no structured_output as malformed_output", async () => {
    const { run } = stub({ stdout: claudeJson({ result: "{}" }) });
    expect((await failure(backend(run))).code).toBe("malformed_output");
  });

  it("rejects a schema-invalid structured_output as schema_invalid, keeping usage", async () => {
    const { run } = stub({ stdout: claudeJson({ structured_output: { commands: [{ type: "place_road", op: "rival-1" }], notes: [] } }) });
    const err = await failure(backend(run));
    expect(err.code).toBe("schema_invalid");
    expect(err.usage?.inputTokens).toBe(1200);
  });

  it("maps is_error, a non-zero exit, a timeout and a failed spawn to typed errors", async () => {
    expect((await failure(backend(stub({ stdout: claudeJson({ is_error: true, result: "rate limited" }) }).run))).code).toBe(
      "process_failed",
    );
    expect((await failure(backend(stub({ exitCode: 1, stderr: "boom" }).run))).code).toBe("process_failed");
    expect((await failure(backend(stub({ exitCode: null, timedOut: true }).run))).code).toBe("timeout");
    expect((await failure(backend(stub(new Error("ENOENT")).run))).code).toBe("spawn_failed");
  });
});

describe("runProcess", () => {
  // Spawns node itself, never claude.
  it("returns stdout and the exit code, and rejects when the binary is missing", async () => {
    const opts = { cwd: process.cwd(), timeoutMs: 10_000 };
    const ok = await runProcess(process.execPath, ["-e", "process.stdout.write('hi')"], opts);
    expect(ok).toEqual({ exitCode: 0, stdout: "hi", stderr: "", timedOut: false });
    const bad = await runProcess(process.execPath, ["-e", "process.exit(3)"], opts);
    expect(bad.exitCode).toBe(3);
    await expect(runProcess("/nonexistent/claude", [], opts)).rejects.toThrow();
  });

  it("reports a timeout", async () => {
    const r = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { cwd: process.cwd(), timeoutMs: 100 });
    expect(r.timedOut).toBe(true);
  });
});

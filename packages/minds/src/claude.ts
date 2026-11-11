// The `claude -p` backend (DESIGN.md 13.4). Shells out to Claude Code in
// headless mode with tools off, no settings, no MCP and no session, from an
// empty working directory, and reads `structured_output` from the JSON reply.

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIND_REPLY_SCHEMA_JSON, parseMindReply } from "./reply.ts";
import {
  MindError,
  type BackendReply,
  type BackendUsage,
  type MindBackend,
  type MindRequest,
  type MindTier,
} from "./types.ts";

export interface ProcessResult {
  /** null when the process was killed. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
}

/** Runs one process. Rejects only when it could not be started. Injected in tests. */
export type ProcessRunner = (file: string, args: readonly string[], options: RunOptions) => Promise<ProcessResult>;

export interface ClaudeCliConfig {
  /** Absolute path to the claude binary. Non-interactive ssh and systemd lack it on the PATH. */
  readonly binary: string;
  /** Model per tier. Models are config, not code. */
  readonly models: Readonly<Record<MindTier, string>>;
  readonly timeoutMs?: number;
  /** Where the empty per-call working directories go. Defaults to the OS temp dir. */
  readonly workRoot?: string;
  readonly run?: ProcessRunner;
}

export const DEFAULT_CLAUDE_MODELS: Readonly<Record<MindTier, string>> = {
  deliberation: "haiku",
  conversation: "sonnet",
};

/** The exact flags from DESIGN.md 13.4. */
export function claudeArgs(request: MindRequest, model: string, schemaJson: string = MIND_REPLY_SCHEMA_JSON): string[] {
  return [
    "-p",
    request.prompt,
    "--model",
    model,
    "--output-format",
    "json",
    "--tools",
    "",
    "--system-prompt",
    request.persona,
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--json-schema",
    schemaJson,
  ];
}

export const runProcess: ProcessRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error !== null && typeof error.code === "string") {
          reject(error);
          return;
        }
        const timedOut = error !== null && error.killed === true;
        const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resolve({ exitCode, stdout, stderr, timedOut });
      },
    );
  });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function usageOf(out: Record<string, unknown>, model: string): BackendUsage {
  const u = isRecord(out["usage"]) ? out["usage"] : {};
  return {
    model,
    inputTokens:
      num(u["input_tokens"]) + num(u["cache_creation_input_tokens"]) + num(u["cache_read_input_tokens"]),
    outputTokens: num(u["output_tokens"]),
  };
}

/** Turn the stdout of `claude -p --output-format json` into a reply, or throw a MindError. */
export function parseClaudeOutput(stdout: string, model: string): BackendReply {
  let out: unknown;
  try {
    out = JSON.parse(stdout);
  } catch {
    throw new MindError("malformed_output", "claude output is not JSON");
  }
  if (!isRecord(out)) throw new MindError("malformed_output", "claude output is not an object");
  const usage = usageOf(out, model);
  if (out["is_error"] === true) {
    throw new MindError("process_failed", `claude reported an error: ${String(out["result"] ?? out["subtype"])}`, usage);
  }
  if (!("structured_output" in out)) {
    throw new MindError("malformed_output", "claude output has no structured_output", usage);
  }
  const parsed = parseMindReply(out["structured_output"]);
  if (!parsed.ok) throw new MindError("schema_invalid", parsed.message, usage);
  return { reply: parsed.value, usage };
}

export class ClaudeCliBackend implements MindBackend {
  readonly name = "claude-cli";
  private readonly config: ClaudeCliConfig;
  private readonly run: ProcessRunner;

  constructor(config: ClaudeCliConfig) {
    this.config = config;
    this.run = config.run ?? runProcess;
  }

  async call(request: MindRequest): Promise<BackendReply> {
    const model = this.config.models[request.tier];
    const dir = await mkdtemp(join(this.config.workRoot ?? tmpdir(), "groundwork-mind-"));
    try {
      let result: ProcessResult;
      try {
        result = await this.run(this.config.binary, claudeArgs(request, model), {
          cwd: dir,
          timeoutMs: this.config.timeoutMs ?? 120_000,
        });
      } catch (e) {
        throw new MindError("spawn_failed", `could not start ${this.config.binary}: ${(e as Error).message}`);
      }
      if (result.timedOut) throw new MindError("timeout", "claude timed out");
      if (result.exitCode !== 0) {
        throw new MindError("process_failed", `claude exited ${String(result.exitCode)}: ${result.stderr.slice(0, 500)}`);
      }
      return parseClaudeOutput(result.stdout, model);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

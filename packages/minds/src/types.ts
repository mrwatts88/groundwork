// The Mind interface and what flows through it (DESIGN.md 13.1, 13.4).

import type { MindReply } from "./reply.ts";

/** Deliberation runs on a schedule and on events. Conversation runs when someone talks. */
export type MindTier = "deliberation" | "conversation";

/**
 * Who goes last when the budget is tight (DESIGN.md 13.5). low: named citizens.
 * normal: rival leaders. high: the foreman.
 */
export type MindPriority = "low" | "normal" | "high";

export interface MindRequest {
  /** The agent asking, for the usage log and the governor. */
  readonly agent: string;
  readonly tier: MindTier;
  readonly priority: MindPriority;
  /** The system prompt: who the agent is. */
  readonly persona: string;
  /** What the agent sees now and is asked to decide. */
  readonly prompt: string;
}

export interface BackendUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface BackendReply {
  readonly reply: MindReply;
  readonly usage: BackendUsage;
}

/** One backend: `claude -p`, the API, or the fake. */
export interface MindBackend {
  readonly name: string;
  /** Resolve with a schema-valid reply or reject with a MindError. */
  call(request: MindRequest): Promise<BackendReply>;
}

/** One row per backend call, for the debug panel (DESIGN.md 13.5). */
export interface UsageRow {
  readonly agent: string;
  readonly backend: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly ms: number;
  readonly ok: boolean;
  /** The MindError code when ok is false. */
  readonly error?: MindErrorCode;
}

export interface UsageRecorder {
  record(row: UsageRow): void;
}

export type MindErrorCode =
  | "spawn_failed"
  | "process_failed"
  | "timeout"
  | "malformed_output"
  | "schema_invalid"
  | "no_recording";

export class MindError extends Error {
  readonly code: MindErrorCode;
  /** Usage reported before the failure, when the backend got that far. */
  readonly usage: BackendUsage | undefined;

  constructor(code: MindErrorCode, message: string, usage?: BackendUsage) {
    super(message);
    this.name = "MindError";
    this.code = code;
    this.usage = usage;
  }
}

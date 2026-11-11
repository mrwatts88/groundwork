// A Mind: one backend behind the budget governor, with every call recorded
// (DESIGN.md 13.4, 13.5).

import type { BudgetGovernor } from "./governor.ts";
import type { MindReply } from "./reply.ts";
import { MindError, type MindBackend, type MindRequest, type UsageRecorder, type UsageRow } from "./types.ts";

export type MindOutcome =
  | { readonly status: "ok"; readonly reply: MindReply }
  /** The governor said wait. The caller reschedules. */
  | { readonly status: "deferred"; readonly retryAfterMs: number; readonly reason: string }
  /** The governor said no. The caller falls back to reflex. */
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "error"; readonly error: MindError };

export interface MindDeps {
  readonly backend: MindBackend;
  readonly governor: BudgetGovernor;
  readonly recorder: UsageRecorder;
  /** Real-time ms. Minds run outside the sim, so wall time is fine, but tests inject it. */
  readonly now?: () => number;
}

export class Mind {
  private readonly deps: MindDeps;
  private readonly now: () => number;

  constructor(deps: MindDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
  }

  async think(request: MindRequest): Promise<MindOutcome> {
    const { backend, governor, recorder } = this.deps;
    const decision = governor.acquire(request, this.now());
    if (decision.kind === "defer") return { status: "deferred", retryAfterMs: decision.retryAfterMs, reason: decision.reason };
    if (decision.kind === "refuse") return { status: "refused", reason: decision.reason };

    const start = this.now();
    try {
      const { reply, usage } = await backend.call(request);
      recorder.record({
        agent: request.agent,
        backend: backend.name,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ms: this.now() - start,
        ok: true,
      });
      return { status: "ok", reply };
    } catch (e) {
      const error = e instanceof MindError ? e : new MindError("process_failed", (e as Error).message);
      recorder.record({
        agent: request.agent,
        backend: backend.name,
        model: error.usage?.model ?? "unknown",
        inputTokens: error.usage?.inputTokens ?? 0,
        outputTokens: error.usage?.outputTokens ?? 0,
        ms: this.now() - start,
        ok: false,
        error: error.code,
      });
      return { status: "error", error };
    }
  }
}

/** An in-memory recorder. The server will swap in one that writes SQLite. */
export class MemoryRecorder implements UsageRecorder {
  readonly rows: UsageRow[] = [];
  record(row: UsageRow): void {
    this.rows.push(row);
  }
}

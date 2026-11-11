// The fake backend (DESIGN.md 13.4). Replays recorded replies by prompt hash,
// or answers through scripted rules. Every automated test uses it.

import { createHash } from "node:crypto";
import { parseMindReply } from "./reply.ts";
import { MindError, type BackendReply, type MindBackend, type MindRequest } from "./types.ts";

/** Stable hash of what the model would see: tier, persona and prompt. */
export function promptHash(request: Pick<MindRequest, "tier" | "persona" | "prompt">): string {
  return createHash("sha256")
    .update(JSON.stringify([request.tier, request.persona, request.prompt]))
    .digest("hex");
}

/** A recorded raw reply, as the model returned it. It is validated on replay. */
export type Recordings = Readonly<Record<string, unknown>>;

/** A scripted rule. Return a raw reply to answer, or undefined to pass. */
export type FakeRule = (request: MindRequest) => unknown;

export interface FakeOptions {
  readonly recordings?: Recordings;
  readonly rules?: readonly FakeRule[];
  readonly model?: string;
}

export class FakeBackend implements MindBackend {
  readonly name = "fake";
  readonly calls: MindRequest[] = [];
  private readonly recordings: Map<string, unknown>;
  private readonly rules: readonly FakeRule[];
  private readonly model: string;

  constructor(options: FakeOptions = {}) {
    this.recordings = new Map(Object.entries(options.recordings ?? {}));
    this.rules = options.rules ?? [];
    this.model = options.model ?? "fake";
  }

  /** Record a raw reply for a request, keyed by its prompt hash. */
  record(request: Pick<MindRequest, "tier" | "persona" | "prompt">, reply: unknown): void {
    this.recordings.set(promptHash(request), reply);
  }

  async call(request: MindRequest): Promise<BackendReply> {
    this.calls.push(request);
    const hash = promptHash(request);
    let raw: unknown = this.recordings.get(hash);
    if (raw === undefined) {
      for (const rule of this.rules) {
        raw = rule(request);
        if (raw !== undefined) break;
      }
    }
    if (raw === undefined) throw new MindError("no_recording", `no recorded reply for prompt hash ${hash}`);
    const parsed = parseMindReply(raw);
    if (!parsed.ok) throw new MindError("schema_invalid", parsed.message);
    const prompt = request.persona.length + request.prompt.length;
    return {
      reply: parsed.value,
      usage: { model: this.model, inputTokens: Math.ceil(prompt / 4), outputTokens: Math.ceil(JSON.stringify(raw).length / 4) },
    };
  }
}

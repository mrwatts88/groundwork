// The budget governor (DESIGN.md 13.5). Counts `claude -p` calls per real
// hour and per day so NPC minds never starve Matt's own Claude Code sessions.
// Conversation is exempt from the main limit but has its own rate limit.
// Near the limit, low-priority agents fall back to reflex first, and
// deliberation intervals stretch. Past it, deliberation is refused (low
// priority) or deferred (normal and high).

import type { MindPriority, MindRequest } from "./types.ts";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export interface GovernorLimits {
  /** Deliberation calls per real hour. */
  readonly callsPerHour: number;
  /** Deliberation calls per real day. Undefined means no daily cap beyond the hourly one. */
  readonly callsPerDay?: number;
  /** Conversation calls per real hour. */
  readonly conversationPerHour: number;
  /** From this share of the hourly limit, low-priority agents fall back to reflex. */
  readonly softFraction: number;
}

export const DEFAULT_LIMITS: GovernorLimits = {
  callsPerHour: 120,
  conversationPerHour: 60,
  softFraction: 0.8,
};

export type GovernorDecision =
  | { readonly kind: "allow" }
  /** Try again after this many ms. */
  | { readonly kind: "defer"; readonly retryAfterMs: number; readonly reason: string }
  /** Fall back to reflex. */
  | { readonly kind: "refuse"; readonly reason: string };

/** Timestamps inside a sliding window. */
class Window {
  private readonly stamps: number[] = [];
  private readonly spanMs: number;

  constructor(spanMs: number) {
    this.spanMs = spanMs;
  }

  count(now: number): number {
    while (this.stamps.length > 0 && (this.stamps[0] as number) <= now - this.spanMs) this.stamps.shift();
    return this.stamps.length;
  }

  /** Ms until one slot frees. Call count(now) first. */
  retryAfter(now: number): number {
    const oldest = this.stamps[0];
    return oldest === undefined ? 0 : Math.max(1, oldest + this.spanMs - now);
  }

  add(now: number): void {
    this.stamps.push(now);
  }
}

export class BudgetGovernor {
  readonly limits: GovernorLimits;
  private readonly hour = new Window(HOUR_MS);
  private readonly day = new Window(DAY_MS);
  private readonly talk = new Window(HOUR_MS);

  constructor(limits: Partial<GovernorLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** Decide without counting. */
  decide(request: Pick<MindRequest, "tier" | "priority">, now: number): GovernorDecision {
    if (request.tier === "conversation") {
      if (this.talk.count(now) >= this.limits.conversationPerHour) {
        return { kind: "defer", retryAfterMs: this.talk.retryAfter(now), reason: "conversation rate limit" };
      }
      return { kind: "allow" };
    }
    const dayLimit = this.limits.callsPerDay;
    if (dayLimit !== undefined && this.day.count(now) >= dayLimit) {
      return this.overLimit(request.priority, this.day.retryAfter(now), "daily limit reached");
    }
    const used = this.hour.count(now);
    if (used >= this.limits.callsPerHour) {
      return this.overLimit(request.priority, this.hour.retryAfter(now), "hourly limit reached");
    }
    if (request.priority === "low" && used >= this.limits.softFraction * this.limits.callsPerHour) {
      return { kind: "refuse", reason: "near the hourly limit, low priority falls back to reflex" };
    }
    return { kind: "allow" };
  }

  /** Decide, and count the call when allowed. */
  acquire(request: Pick<MindRequest, "tier" | "priority">, now: number): GovernorDecision {
    const decision = this.decide(request, now);
    if (decision.kind === "allow") {
      if (request.tier === "conversation") {
        this.talk.add(now);
      } else {
        this.hour.add(now);
        this.day.add(now);
      }
    }
    return decision;
  }

  /**
   * How much to stretch deliberation intervals: 1 below the soft limit, rising
   * linearly to 4 at the hourly limit. The scheduler multiplies by this.
   */
  stretch(now: number): number {
    const used = this.hour.count(now);
    const soft = this.limits.softFraction * this.limits.callsPerHour;
    if (used <= soft) return 1;
    const span = Math.max(1, this.limits.callsPerHour - soft);
    return 1 + 3 * Math.min(1, (used - soft) / span);
  }

  usage(now: number): { readonly hour: number; readonly day: number; readonly conversationHour: number } {
    return { hour: this.hour.count(now), day: this.day.count(now), conversationHour: this.talk.count(now) };
  }

  private overLimit(priority: MindPriority, retryAfterMs: number, reason: string): GovernorDecision {
    if (priority === "low") return { kind: "refuse", reason };
    return { kind: "defer", retryAfterMs, reason };
  }
}

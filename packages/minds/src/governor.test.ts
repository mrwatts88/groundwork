import { describe, expect, it } from "vitest";
import { BudgetGovernor, DEFAULT_LIMITS, HOUR_MS } from "./governor.ts";

const delib = { tier: "deliberation", priority: "normal" } as const;
const low = { tier: "deliberation", priority: "low" } as const;
const high = { tier: "deliberation", priority: "high" } as const;
const talk = { tier: "conversation", priority: "normal" } as const;

describe("budget governor", () => {
  it("defaults to 120 claude -p calls per real hour", () => {
    expect(DEFAULT_LIMITS.callsPerHour).toBe(120);
  });

  it("defers calls past the per-hour limit until the window frees a slot", () => {
    const g = new BudgetGovernor({ callsPerHour: 5 });
    for (let i = 0; i < 5; i++) expect(g.acquire(delib, 1000 + i).kind).toBe("allow");
    const d = g.acquire(delib, 2000);
    expect(d.kind).toBe("defer");
    if (d.kind === "defer") expect(d.retryAfterMs).toBe(1000 + HOUR_MS - 2000);
    expect(g.acquire(high, 2000).kind).toBe("defer");
    expect(g.usage(2000).hour).toBe(5);
    // The oldest call leaves the window.
    expect(g.acquire(delib, 1000 + HOUR_MS).kind).toBe("allow");
  });

  it("refuses low-priority calls near and past the limit, so they fall back to reflex", () => {
    const g = new BudgetGovernor({ callsPerHour: 10, softFraction: 0.8 });
    for (let i = 0; i < 8; i++) expect(g.acquire(delib, i).kind).toBe("allow");
    expect(g.acquire(low, 10).kind).toBe("refuse");
    expect(g.acquire(delib, 10).kind).toBe("allow");
    expect(g.acquire(high, 10).kind).toBe("allow");
    expect(g.acquire(low, 11).kind).toBe("refuse");
    expect(g.acquire(delib, 11).kind).toBe("defer");
  });

  it("lets a conversation call through within its own limit while deliberation is over", () => {
    const g = new BudgetGovernor({ callsPerHour: 2, conversationPerHour: 3 });
    g.acquire(delib, 0);
    g.acquire(delib, 1);
    expect(g.acquire(delib, 2).kind).toBe("defer");
    expect(g.acquire(talk, 2).kind).toBe("allow");
    expect(g.acquire(talk, 3).kind).toBe("allow");
    expect(g.acquire(talk, 4).kind).toBe("allow");
    // Conversation is rate limited on its own.
    expect(g.acquire(talk, 5).kind).toBe("defer");
    // And it does not use up the deliberation budget.
    expect(g.usage(5)).toEqual({ hour: 2, day: 2, conversationHour: 3 });
  });

  it("applies a daily cap when one is set", () => {
    const g = new BudgetGovernor({ callsPerHour: 2, callsPerDay: 3 });
    g.acquire(delib, 0);
    g.acquire(delib, 1);
    expect(g.acquire(delib, HOUR_MS + 1).kind).toBe("allow");
    const d = g.acquire(delib, 2 * HOUR_MS + 2);
    expect(d.kind).toBe("defer");
    expect(g.acquire(low, 2 * HOUR_MS + 2).kind).toBe("refuse");
  });

  it("stretches deliberation intervals as usage nears the limit", () => {
    const g = new BudgetGovernor({ callsPerHour: 10, softFraction: 0.5 });
    expect(g.stretch(0)).toBe(1);
    for (let i = 0; i < 10; i++) g.acquire(high, i);
    expect(g.stretch(10)).toBe(4);
    expect(g.stretch(HOUR_MS + 10)).toBe(1);
  });
});

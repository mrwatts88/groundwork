import { describe, expect, it } from "vitest";
import { createRng, nextInt, nextU32 } from "./rng.ts";

describe("seeded rng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it("gives different sequences for nearby seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 8 }, () => nextU32(a));
    const sb = Array.from({ length: 8 }, () => nextU32(b));
    expect(sa).not.toEqual(sb);
  });

  it("keeps nextInt in range and covers it", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = nextInt(rng, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      seen.add(v);
    }
    expect(seen.size).toBe(10);
  });
});

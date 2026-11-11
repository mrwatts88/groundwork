import { TERRAIN, TERRAIN_NAMES } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { CLAIM_SIZE, createWorld } from "./mapgen.ts";
import { hashWorld } from "./hash.ts";

const make = (seed: number) => createWorld({ seed, width: 128, height: 128, ops: ["player", "rival"] });

describe("map generation", () => {
  it("produces the same terrain from the same seed", () => {
    const a = make(1234);
    const b = make(1234);
    expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
    expect(Buffer.from(a.richness).equals(Buffer.from(b.richness))).toBe(true);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("produces different terrain from different seeds", () => {
    const seeds = [1, 2, 3, 1234, 99999];
    const terrains = seeds.map((s) => Buffer.from(make(s).terrain).toString("hex"));
    expect(new Set(terrains).size).toBe(seeds.length);
  });

  it("has every terrain kind on a 128x128 map", () => {
    const world = make(1234);
    const counts = new Map<number, number>();
    for (const t of world.terrain) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const name of TERRAIN_NAMES) expect(counts.get(TERRAIN[name]) ?? 0, name).toBeGreaterThan(0);
  });

  it("puts richer deposits farther from the middle", () => {
    const world = make(1234);
    const near: number[] = [];
    const far: number[] = [];
    for (let i = 0; i < world.richness.length; i++) {
      const r = world.richness[i]!;
      if (r === 0) continue;
      expect(world.terrain[i]).toBe(TERRAIN.deposit);
      const d = Math.abs((i % 128) - 64) + Math.abs(Math.floor(i / 128) - 64);
      (d < 64 ? near : far).push(r);
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(far.length).toBeGreaterThan(near.length);
    expect(avg(far)).toBeGreaterThan(avg(near));
  });

  it("gives each op a dry starting claim of its own", () => {
    const world = make(1234);
    for (let k = 1; k <= world.ops.length; k++) {
      let tiles = 0;
      for (let i = 0; i < world.owner.length; i++) {
        if (world.owner[i] !== k) continue;
        tiles++;
        expect(world.terrain[i]).not.toBe(TERRAIN.water);
      }
      expect(tiles).toBe(CLAIM_SIZE * CLAIM_SIZE);
    }
  });
});

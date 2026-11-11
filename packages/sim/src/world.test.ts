// The Ring 1 world shape (DESIGN.md 4.2, 4.3, 6.1, 8, D-012): one town on dry
// land near water with roads and a market, two Ops with equal starting
// claims, and every tile owner a party.

import { TERRAIN } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.ts";
import { hashWorld } from "./hash.ts";
import { CLAIM_SIZE, createWorld, STARTING_CASH, TOWN_ID, TOWN_WATER_RANGE } from "./mapgen.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { partyIndex, partyOf, ROAD_BUILT, tileOwner, WORLD_FORMAT, type World } from "./world.ts";

const SEEDS = [1, 2, 3, 1234, 20261111, 99999, 424242, 7];
const make = (seed: number, size = 128): World =>
  createWorld({ seed, width: size, height: size, ops: ["player", "rival"] });

/** Tiles in the 4-connected component containing start, among those in the set. */
function component(world: World, set: Set<number>, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    const next = [
      x > 0 ? i - 1 : -1,
      x < world.width - 1 ? i + 1 : -1,
      y > 0 ? i - world.width : -1,
      y < world.height - 1 ? i + world.width : -1,
    ];
    for (const n of next) {
      if (n >= 0 && set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

function waterWithin(world: World, i: number, range: number): boolean {
  const x = i % world.width;
  const y = Math.floor(i / world.width);
  for (let yy = Math.max(0, y - range); yy <= Math.min(world.height - 1, y + range); yy++) {
    for (let xx = Math.max(0, x - range); xx <= Math.min(world.width - 1, x + range); xx++) {
      if (world.terrain[yy * world.width + xx] === TERRAIN.water) return true;
    }
  }
  return false;
}

function tilesOf(world: World, owner: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < world.owner.length; i++) if (world.owner[i] === owner) out.push(i);
  return out;
}

describe("Ring 1 world shape", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: one town, a connected block of dry town land within ${TOWN_WATER_RANGE} tiles of water, with roads and a market`, () => {
      const world = make(seed);
      const towns = world.parties.filter((p) => p.kind === "town");
      expect(towns).toEqual([{ kind: "town", id: TOWN_ID }]);
      expect(world.town.id).toBe(TOWN_ID);
      expect(world.town.name.length).toBeGreaterThan(0);

      const townParty = partyIndex(world, "town", TOWN_ID);
      const land = tilesOf(world, townParty);
      expect(land.length).toBeGreaterThanOrEqual(25);
      const set = new Set(land);
      expect(component(world, set, land[0]!).size).toBe(land.length);
      for (const i of land) {
        expect(world.terrain[i], `tile ${i}`).not.toBe(TERRAIN.water);
        expect(waterWithin(world, i, TOWN_WATER_RANGE), `water near tile ${i}`).toBe(true);
      }

      // Built roads on town land, connected to each other.
      const roads = land.filter((i) => world.road[i] === ROAD_BUILT);
      expect(roads.length).toBeGreaterThan(0);
      expect(component(world, new Set(roads), roads[0]!).size).toBe(roads.length);

      // One market tile, on town land, beside a town road, not on one.
      const m = world.town.market;
      expect(set.has(m)).toBe(true);
      expect(world.road[m]).not.toBe(ROAD_BUILT);
      const w = world.width;
      expect([m - 1, m + 1, m - w, m + w].some((n) => set.has(n) && world.road[n] === ROAD_BUILT)).toBe(true);

      // No starting claim overlaps the town.
      for (const op of world.ops) {
        for (const i of tilesOf(world, partyIndex(world, "op", op.id))) expect(set.has(i)).toBe(false);
      }
    });
  }

  it("has two Ops, player and rival, with 6x6 dry claims and the same starting cash", () => {
    for (const seed of SEEDS) {
      const world = make(seed);
      expect(world.ops.map((op) => op.id)).toEqual(["player", "rival"]);
      expect(world.ops.map((op) => op.cash)).toEqual([STARTING_CASH, STARTING_CASH]);
      for (const op of world.ops) {
        const tiles = tilesOf(world, partyIndex(world, "op", op.id));
        expect(tiles.length).toBe(CLAIM_SIZE * CLAIM_SIZE);
        const xs = tiles.map((i) => i % world.width);
        const ys = tiles.map((i) => Math.floor(i / world.width));
        expect(Math.max(...xs) - Math.min(...xs)).toBe(CLAIM_SIZE - 1);
        expect(Math.max(...ys) - Math.min(...ys)).toBe(CLAIM_SIZE - 1);
        for (const i of tiles) expect(world.terrain[i]).not.toBe(TERRAIN.water);
      }
    }
  });

  it("resolves every tile owner through one lookup to a party", () => {
    const world = make(1234);
    const kinds = new Set<string>();
    for (let i = 0; i < world.owner.length; i++) {
      const party = tileOwner(world, i);
      expect(party).toBe(partyOf(world, world.owner[i]!));
      expect(["frontier", "op", "town", "person"]).toContain(party.kind);
      kinds.add(party.kind);
    }
    expect([...kinds].sort()).toEqual(["frontier", "op", "town"]);
    expect(partyOf(world, 0)).toEqual({ kind: "frontier", id: "frontier" });
    expect(partyOf(world, partyIndex(world, "op", "rival"))).toEqual({ kind: "op", id: "rival" });
    // The person kind is a valid owner. Named people arrive in R1-02.
    world.parties.push({ kind: "person", id: "someone" });
    const k = world.parties.length - 1;
    world.owner[0] = k;
    expect(tileOwner(world, 0)).toEqual({ kind: "person", id: "someone" });
    expect(() => partyOf(world, world.parties.length)).toThrow(/not a party/);
  });

  it("refuses an Op's road on town land", () => {
    const world = make(1234);
    const m = world.town.market;
    const result = apply(world, { type: "place_road", op: "player", x: m % world.width, y: Math.floor(m / world.width) });
    expect(result.ok === false && result.error.code).toBe("not_owner");
  });

  it("round-trips the town and the parties through a snapshot", () => {
    const world = make(20261111);
    world.parties.push({ kind: "person", id: "someone" });
    const s = JSON.parse(JSON.stringify(toSnapshot(world)));
    expect(s.format).toBe(WORLD_FORMAT);
    expect(s.town).toEqual(world.town);
    expect(s.parties).toEqual(world.parties);
    const back = fromSnapshot(s);
    expect(back.town).toEqual(world.town);
    expect(back.parties).toEqual(world.parties);
    expect(hashWorld(back)).toBe(hashWorld(world));
  });

  it("puts the town and the parties in the state hash", () => {
    const a = make(1234);
    const renamed = fromSnapshot({ ...toSnapshot(a), town: { ...a.town, name: a.town.name + "x" } });
    expect(hashWorld(renamed)).not.toBe(hashWorld(a));
    const moreParties = fromSnapshot({ ...toSnapshot(a), parties: [...a.parties, { kind: "person", id: "p" }] });
    expect(hashWorld(moreParties)).not.toBe(hashWorld(a));
  });

  it("refuses a Ring 0 snapshot and an owner that is not a party", () => {
    const s = toSnapshot(make(1234));
    const { format: _format, ...ring0 } = s;
    expect(() => fromSnapshot(ring0 as typeof s)).toThrow(/format 1/);
    const owner = [...s.owner];
    owner[0] = s.parties.length;
    expect(() => fromSnapshot({ ...s, owner })).toThrow(/not one of/);
  });

  it("fits a town and two claims on the 64x64 test map", () => {
    const world = make(1, 64);
    expect(tilesOf(world, partyIndex(world, "town", TOWN_ID)).length).toBeGreaterThan(0);
  });
});

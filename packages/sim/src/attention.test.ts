import { COMMAND_TYPES, TICKS_PER_DAY, type Command } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.ts";
import { ATTENTION_COST, ATTENTION_PER_DAY } from "./attention.ts";
import { hashWorld } from "./hash.ts";
import { createWorld } from "./mapgen.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { tick } from "./tick.ts";
import { partyIndex, ROAD_NONE, type World } from "./world.ts";

const make = () => createWorld({ seed: 77, width: 128, height: 128, ops: ["player", "rival"] });

/** Every road tile an Op could lay today: its own dry land with no road yet. */
function roadTiles(world: World, op: string): Command[] {
  const party = partyIndex(world, "op", op);
  const out: Command[] = [];
  for (let i = 0; i < world.owner.length; i++) {
    if (world.owner[i] !== party || world.road[i] !== ROAD_NONE || world.terrain[i] === 2) continue;
    out.push({ type: "place_road", op, x: i % world.width, y: Math.floor(i / world.width) });
  }
  return out;
}

function runTicks(world: World, n: number): void {
  for (let t = 0; t < n; t++) tick(world);
}

describe("attention", () => {
  it("gives every Op, the rival included, 40 points at the start of each game day", () => {
    const world = make();
    expect(world.ops.map((op) => op.id)).toEqual(["player", "rival"]);
    expect(world.ops.map((op) => op.attention)).toEqual([ATTENTION_PER_DAY, ATTENTION_PER_DAY]);
    expect(ATTENTION_PER_DAY).toBe(40);
    for (const op of ["player", "rival"]) {
      for (const cmd of roadTiles(world, op).slice(0, 7)) expect(apply(world, cmd).ok).toBe(true);
    }
    expect(world.ops.map((op) => op.attention)).toEqual([33, 33]);
    runTicks(world, TICKS_PER_DAY - 1);
    // Still day 1: nothing refilled.
    expect(world.ops.map((op) => op.attention)).toEqual([33, 33]);
    tick(world);
    expect(world.tick).toBe(TICKS_PER_DAY);
    expect(world.ops.map((op) => op.attention)).toEqual([40, 40]);
  });

  it("does not carry unused points over a day boundary", () => {
    const world = make();
    // Spend nothing on day 1. Day 2 still starts at 40, not 80.
    runTicks(world, TICKS_PER_DAY);
    expect(world.ops.every((op) => op.attention === ATTENTION_PER_DAY)).toBe(true);
    apply(world, roadTiles(world, "rival")[0]!);
    runTicks(world, 2 * TICKS_PER_DAY);
    expect(world.ops.every((op) => op.attention === ATTENTION_PER_DAY)).toBe(true);
  });

  it("has one cost table with an entry for every command type", () => {
    expect(COMMAND_TYPES.length).toBeGreaterThan(0);
    for (const type of COMMAND_TYPES) {
      const cost = (ATTENTION_COST as Record<string, number | undefined>)[type];
      expect(cost, `no attention cost for ${type}`).toBeTypeOf("number");
      expect(Number.isInteger(cost) && cost! >= 0).toBe(true);
    }
  });

  it("rejects a command the Op cannot afford with insufficient_attention and leaves the state hash unchanged", () => {
    const world = make();
    const tiles = roadTiles(world, "player");
    world.ops[0]!.attention = ATTENTION_COST.place_road - 1;
    const before = hashWorld(world);
    const result = apply(world, tiles[0]!);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("insufficient_attention");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
    expect(hashWorld(world)).toBe(before);
    // The rival is not affected by the player's budget.
    expect(apply(world, roadTiles(world, "rival")[0]!).ok).toBe(true);
  });

  it("charges only for commands that succeed", () => {
    const world = make();
    apply(world, { type: "place_road", op: "player", x: -1, y: 0 });
    expect(world.ops[0]!.attention).toBe(ATTENTION_PER_DAY);
  });

  it("lets one day's budget lay at least 30 road tiles and still afford a building", () => {
    const world = make();
    const tiles = roadTiles(world, "player");
    expect(tiles.length).toBeGreaterThanOrEqual(30);
    for (const cmd of tiles.slice(0, 30)) expect(apply(world, cmd)).toEqual({ ok: true });
    expect(world.ops[0]!.attention).toBeGreaterThanOrEqual(ATTENTION_COST.place_building);
    expect(30 * ATTENTION_COST.place_road + ATTENTION_COST.place_building).toBeLessThanOrEqual(ATTENTION_PER_DAY);
  });

  it("survives a snapshot round trip", () => {
    const world = make();
    apply(world, roadTiles(world, "player")[0]!);
    const back = fromSnapshot(toSnapshot(world));
    expect(back.ops[0]!.attention).toBe(ATTENTION_PER_DAY - 1);
    expect(hashWorld(back)).toBe(hashWorld(world));
  });
});

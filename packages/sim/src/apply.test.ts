import { TERRAIN, type Command, type CommandErrorCode } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply, ROAD_BUILD_TICKS, ROAD_COST } from "./apply.ts";
import { hashWorld } from "./hash.ts";
import { createWorld, STARTING_CASH } from "./mapgen.ts";
import { tick } from "./tick.ts";
import { ROAD_BUILDING, ROAD_BUILT, type World } from "./world.ts";

const make = () => createWorld({ seed: 77, width: 128, height: 128, ops: ["player", "rival"] });

function firstTile(world: World, pred: (i: number) => boolean): { x: number; y: number } {
  for (let i = 0; i < world.terrain.length; i++) {
    if (pred(i)) return { x: i % world.width, y: Math.floor(i / world.width) };
  }
  throw new Error("no such tile");
}

function expectRejected(world: World, command: Command, code: CommandErrorCode): void {
  const before = hashWorld(world);
  const result = apply(world, command);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    expect(result.error.message.length).toBeGreaterThan(0);
  }
  expect(hashWorld(world)).toBe(before);
}

describe("place_road", () => {
  it("builds a road on an owned parcel, charges for it and finishes after the build time", () => {
    const world = make();
    const at = firstTile(world, (i) => world.owner[i] === 1);
    const i = at.y * world.width + at.x;
    const result = apply(world, { type: "place_road", op: "player", ...at });
    expect(result).toEqual({ ok: true });
    expect(world.road[i]).toBe(ROAD_BUILDING);
    expect(world.ops[0]!.cash).toBe(STARTING_CASH - ROAD_COST[world.terrain[i]!]!);
    for (let t = 0; t < ROAD_BUILD_TICKS - 1; t++) tick(world);
    expect(world.road[i]).toBe(ROAD_BUILDING);
    tick(world);
    expect(world.road[i]).toBe(ROAD_BUILT);
    expect(world.builds).toHaveLength(0);
  });

  it("rejects out of bounds with a typed error and leaves the state hash unchanged", () => {
    const world = make();
    expectRejected(world, { type: "place_road", op: "player", x: -1, y: 0 }, "out_of_bounds");
    expectRejected(world, { type: "place_road", op: "player", x: 128, y: 5 }, "out_of_bounds");
    expectRejected(world, { type: "place_road", op: "player", x: 3, y: 128 }, "out_of_bounds");
    expectRejected(world, { type: "place_road", op: "player", x: 1.5, y: 2 }, "out_of_bounds");
  });

  it("rejects water with a typed error and leaves the state hash unchanged", () => {
    const world = make();
    const at = firstTile(world, (i) => world.terrain[i] === TERRAIN.water);
    expectRejected(world, { type: "place_road", op: "player", ...at }, "on_water");
  });

  it("rejects a parcel the op does not own and leaves the state hash unchanged", () => {
    const world = make();
    const rivals = firstTile(world, (i) => world.owner[i] === 2);
    expectRejected(world, { type: "place_road", op: "player", ...rivals }, "not_owner");
    const frontier = firstTile(world, (i) => world.owner[i] === 0 && world.terrain[i] !== TERRAIN.water);
    expectRejected(world, { type: "place_road", op: "player", ...frontier }, "not_owner");
  });

  it("rejects an unknown op, a second road on a tile and a road it cannot pay for", () => {
    const world = make();
    const at = firstTile(world, (i) => world.owner[i] === 1);
    expectRejected(world, { type: "place_road", op: "nobody", ...at }, "unknown_op");
    expect(apply(world, { type: "place_road", op: "player", ...at }).ok).toBe(true);
    expectRejected(world, { type: "place_road", op: "player", ...at }, "already_road");
    const next = firstTile(world, (i) => world.owner[i] === 1 && world.road[i] === 0);
    world.ops[0]!.cash = 0;
    expectRejected(world, { type: "place_road", op: "player", ...next }, "insufficient_cash");
  });
});

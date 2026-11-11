import { TERRAIN, TICKS_PER_DAY, type Command, type CommandErrorCode, type WorldSnapshot } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.ts";
import { ATTENTION_COST, ATTENTION_PER_DAY } from "./attention.ts";
import { BUILDING_SPEC, buildingAt, buildingPrice } from "./buildings.ts";
import { hashWorld } from "./hash.ts";
import { createWorld, STARTING_CASH } from "./mapgen.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { tick } from "./tick.ts";
import { NO_OWNER, partyIndex, ROAD_NONE, type World } from "./world.ts";

const make = () => createWorld({ seed: 77, width: 128, height: 128, ops: ["player", "rival"] });
const DEPOT = BUILDING_SPEC.depot;

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

/** A dry tile the Op owns with a dry owned tile to its right, neither with a road. */
function site(world: World, op: string, skip = 0): { site: { x: number; y: number }; road: { x: number; y: number } } {
  const me = partyIndex(world, "op", op);
  const ok = (i: number) => world.owner[i] === me && world.terrain[i] !== TERRAIN.water && world.road[i] === ROAD_NONE && buildingAt(world, i) === undefined;
  for (let i = 0; i < world.terrain.length; i++) {
    const x = i % world.width;
    if (x + 1 >= world.width || !ok(i) || !ok(i + 1)) continue;
    if (skip-- > 0) continue;
    return { site: { x, y: Math.floor(i / world.width) }, road: { x: x + 1, y: Math.floor(i / world.width) } };
  }
  throw new Error("no site");
}

/** Lay the road, then place a depot next to it. Returns the depot's tile index. */
function buildDepot(world: World, op: string, skip = 0): number {
  const s = site(world, op, skip);
  expect(apply(world, { type: "place_road", op, ...s.road }).ok).toBe(true);
  expect(apply(world, { type: "place_building", op, kind: "depot", ...s.site })).toEqual({ ok: true });
  return s.site.y * world.width + s.site.x;
}

const ticks = (world: World, n: number) => {
  for (let t = 0; t < n; t++) tick(world);
};

describe("place_building depot", () => {
  it("charges the build price with hiring and attention, stays under construction for its build time, then is active", () => {
    const world = make();
    const s = site(world, "player");
    expect(apply(world, { type: "place_road", op: "player", ...s.road }).ok).toBe(true);
    const cash = world.ops[0]!.cash;
    const attention = world.ops[0]!.attention;
    expect(apply(world, { type: "place_building", op: "player", kind: "depot", ...s.site })).toEqual({ ok: true });
    expect(buildingPrice("depot")).toBe(DEPOT.cost + DEPOT.hiring);
    expect(DEPOT.hiring).toBeGreaterThan(0);
    expect(world.ops[0]!.cash).toBe(cash - DEPOT.cost - DEPOT.hiring);
    expect(world.ops[0]!.attention).toBe(attention - ATTENTION_COST.place_building);
    const i = s.site.y * world.width + s.site.x;
    expect(buildingAt(world, i)).toEqual({ kind: "depot", tile: i, op: "player", remaining: DEPOT.buildTicks, staffed: false });
    ticks(world, DEPOT.buildTicks - 1);
    expect(buildingAt(world, i)!.remaining).toBe(1);
    expect(buildingAt(world, i)!.staffed).toBe(false);
    tick(world);
    expect(buildingAt(world, i)).toMatchObject({ remaining: 0, staffed: true });
  });

  it("rejects a tile that is not the Op's, has no road beside it, is water, is built on, or lacks cash or attention, leaving the hash unchanged", () => {
    const world = make();
    const s = site(world, "player");
    // No road next to it yet.
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...s.site }, "no_road");
    expect(apply(world, { type: "place_road", op: "player", ...s.road }).ok).toBe(true);
    // Not the Op's: the rival's land, frontier and the town.
    const rival = site(world, "rival");
    expect(apply(world, { type: "place_road", op: "rival", ...rival.road }).ok).toBe(true);
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...rival.site }, "not_owner");
    const frontierTile = world.owner.findIndex((o, i) => o === NO_OWNER && world.terrain[i] !== TERRAIN.water && world.terrain[i + 1] !== TERRAIN.water && world.owner[i + 1] === NO_OWNER);
    const fx = frontierTile % world.width;
    const fy = Math.floor(frontierTile / world.width);
    expect(apply(world, { type: "place_road", op: "player", x: fx + 1, y: fy }).ok).toBe(true);
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", x: fx, y: fy }, "not_owner");
    const market = world.town.market;
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", x: market % world.width, y: Math.floor(market / world.width) }, "not_owner");
    // Water.
    const water = world.terrain.findIndex((t) => t === TERRAIN.water);
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", x: water % world.width, y: Math.floor(water / world.width) }, "on_water");
    // Already built on: the road tile itself, and a tile with a depot.
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...s.road }, "occupied");
    expect(apply(world, { type: "place_building", op: "player", kind: "depot", ...s.site }).ok).toBe(true);
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...s.site }, "occupied");
    // And a road cannot go on a depot's tile afterwards, by the owner or anyone.
    expectRejected(world, { type: "place_road", op: "player", ...s.site }, "occupied");
    expectRejected(world, { type: "place_road", op: "rival", ...s.site }, "not_owner");
    // Off the map and an unknown Op.
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", x: -1, y: 0 }, "out_of_bounds");
    expectRejected(world, { type: "place_building", op: "nobody", kind: "depot", ...s.site }, "unknown_op");
    // Cash and attention, on a fresh valid site.
    const next = site(world, "player");
    expect(apply(world, { type: "place_road", op: "player", ...next.road }).ok).toBe(true);
    world.ops[0]!.cash = buildingPrice("depot") - 1;
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...next.site }, "insufficient_cash");
    world.ops[0]!.cash = STARTING_CASH;
    world.ops[0]!.attention = ATTENTION_COST.place_building - 1;
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...next.site }, "insufficient_attention");
  });
});

describe("depot wages", () => {
  /** A world whose player depot has just been finished, part way through day 1. */
  const finished = (): { world: World; tile: number } => {
    const world = make();
    const tile = buildDepot(world, "player");
    ticks(world, DEPOT.buildTicks);
    expect(world.tick).toBeLessThan(TICKS_PER_DAY);
    return { world, tile };
  };

  it("pays the daily wage once per game day while active", () => {
    const { world, tile } = finished();
    const cash = world.ops[0]!.cash;
    ticks(world, TICKS_PER_DAY - world.tick - 1);
    expect(world.ops[0]!.cash).toBe(cash);
    tick(world); // Day 2 starts.
    expect(world.ops[0]!.cash).toBe(cash - DEPOT.wage);
    ticks(world, TICKS_PER_DAY - 1);
    expect(world.ops[0]!.cash).toBe(cash - DEPOT.wage);
    tick(world); // Day 3.
    expect(world.ops[0]!.cash).toBe(cash - 2 * DEPOT.wage);
    expect(buildingAt(world, tile)!.staffed).toBe(true);
  });

  it("does not pay wages while under construction", () => {
    const world = make();
    const s = site(world, "player");
    // Lay the road and place the depot late on day 1, so construction runs over midnight.
    ticks(world, TICKS_PER_DAY - 60);
    expect(apply(world, { type: "place_road", op: "player", ...s.road }).ok).toBe(true);
    expect(apply(world, { type: "place_building", op: "player", kind: "depot", ...s.site }).ok).toBe(true);
    const cash = world.ops[0]!.cash;
    ticks(world, 60);
    expect(world.ops[0]!.cash).toBe(cash);
  });

  it("leaves the depot unstaffed and idle when the Op cannot pay, staffs it again once it can, and never takes cash below 0", () => {
    const { world, tile } = finished();
    const short = DEPOT.wage - 1;
    world.ops[0]!.cash = short;
    let lowest = short;
    // Run to the start of day 2, payday.
    while (world.tick < TICKS_PER_DAY) {
      tick(world);
      lowest = Math.min(lowest, world.ops[0]!.cash);
    }
    expect(buildingAt(world, tile)!.staffed).toBe(false);
    expect(world.ops[0]!.cash).toBe(short);
    // Still idle while the Op stays short, over a whole day.
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      tick(world);
      lowest = Math.min(lowest, world.ops[0]!.cash);
    }
    expect(buildingAt(world, tile)!.staffed).toBe(false);
    expect(world.ops[0]!.cash).toBe(short);
    // The Op gets money (as a sale would give it). The crew is hired back on the next tick.
    world.ops[0]!.cash = DEPOT.wage + 5;
    tick(world);
    expect(buildingAt(world, tile)!.staffed).toBe(true);
    expect(world.ops[0]!.cash).toBe(5);
    expect(lowest).toBeGreaterThanOrEqual(0);
  });

  it("with two depots and money for one wage, staffs the first and idles the second, never going below 0", () => {
    const world = make();
    const first = buildDepot(world, "player");
    const second = buildDepot(world, "player", 2);
    ticks(world, DEPOT.buildTicks);
    world.ops[0]!.cash = DEPOT.wage + 10;
    ticks(world, TICKS_PER_DAY - world.tick);
    expect(buildingAt(world, first)!.staffed).toBe(true);
    expect(buildingAt(world, second)!.staffed).toBe(false);
    expect(world.ops[0]!.cash).toBe(10);
    // Each Op pays its own wages: the rival's cash is untouched by the player's depots.
    expect(world.ops[1]!.cash).toBe(STARTING_CASH);
    expect(world.ops[0]!.attention).toBe(ATTENTION_PER_DAY);
  });
});

describe("buildings in the state", () => {
  it("are in the snapshot and the hash, and a save from before buildings loads with none", () => {
    const world = make();
    const tile = buildDepot(world, "player");
    ticks(world, 100);
    const copy = fromSnapshot(toSnapshot(world));
    expect(hashWorld(copy)).toBe(hashWorld(world));
    expect(copy.buildings).toEqual([{ kind: "depot", tile, op: "player", remaining: DEPOT.buildTicks - 100, staffed: false }]);
    // The hash sees construction progress and staffing.
    const other = fromSnapshot(toSnapshot(world));
    other.buildings[0]!.staffed = true;
    expect(hashWorld(other)).not.toBe(hashWorld(world));
    const { buildings: _, ...old } = toSnapshot(make());
    expect(fromSnapshot(old as WorldSnapshot).buildings).toEqual([]);
  });
});

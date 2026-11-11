import { TERRAIN, type Command, type CommandErrorCode, type WorldSnapshot } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply, CLAIM_FEE, CLAIM_FEE_DEPOSIT, ROAD_BUILD_TICKS, ROAD_COST, SURVEY_TICKS } from "./apply.ts";
import { ATTENTION_COST, ATTENTION_PER_DAY } from "./attention.ts";
import { hashWorld } from "./hash.ts";
import { createWorld, STARTING_CASH } from "./mapgen.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { tick } from "./tick.ts";
import { NO_OWNER, partyIndex, ROAD_BUILDING, ROAD_BUILT, surveyAt, type World } from "./world.ts";

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

  it("is accepted on frontier as well as on the op's own land", () => {
    const world = make();
    const own = firstTile(world, (i) => world.owner[i] === 1);
    expect(apply(world, { type: "place_road", op: "player", ...own })).toEqual({ ok: true });
    const frontier = firstTile(world, (i) => world.owner[i] === NO_OWNER && world.terrain[i] !== TERRAIN.water);
    expect(apply(world, { type: "place_road", op: "player", ...frontier })).toEqual({ ok: true });
    expect(world.road[frontier.y * world.width + frontier.x]).toBe(ROAD_BUILDING);
    // The rival can lay roads on frontier too.
    const other = firstTile(world, (i) => world.owner[i] === NO_OWNER && world.terrain[i] !== TERRAIN.water && world.road[i] === 0);
    expect(apply(world, { type: "place_road", op: "rival", ...other })).toEqual({ ok: true });
  });

  it("rejects land another party owns with not_owner and leaves the state hash unchanged", () => {
    const world = make();
    // The rival, the town and a named person all own land the player cannot build on.
    for (const kind of ["op", "town", "person"] as const) {
      const owner = world.parties.findIndex((p, k) => k !== 1 && p.kind === kind);
      const at = firstTile(world, (i) => world.owner[i] === owner && world.terrain[i] !== TERRAIN.water && world.road[i] === 0);
      expectRejected(world, { type: "place_road", op: "player", ...at }, "not_owner");
    }
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

describe("stake_claim", () => {
  const frontier = (world: World, terrain?: number) =>
    firstTile(
      world,
      (i) =>
        world.owner[i] === NO_OWNER &&
        world.terrain[i] !== TERRAIN.water &&
        surveyAt(world, i) === undefined &&
        (terrain === undefined ? world.terrain[i] !== TERRAIN.deposit : world.terrain[i] === terrain),
    );

  it("charges the claim fee and attention, surveys the tile, and makes the op its owner when the survey is done", () => {
    const world = make();
    const at = frontier(world);
    const i = at.y * world.width + at.x;
    const result = apply(world, { type: "stake_claim", op: "player", ...at });
    expect(result).toEqual({ ok: true });
    expect(world.ops[0]!.cash).toBe(STARTING_CASH - CLAIM_FEE);
    expect(world.ops[0]!.attention).toBe(ATTENTION_PER_DAY - ATTENTION_COST.stake_claim);
    expect(surveyAt(world, i)).toEqual({ tile: i, op: "player", remaining: SURVEY_TICKS });
    expect(world.owner[i]).toBe(NO_OWNER);
    for (let t = 0; t < SURVEY_TICKS - 1; t++) tick(world);
    expect(world.owner[i]).toBe(NO_OWNER);
    expect(surveyAt(world, i)).toBeDefined();
    tick(world);
    expect(world.owner[i]).toBe(partyIndex(world, "op", "player"));
    expect(surveyAt(world, i)).toBeUndefined();
    expect(world.surveys).toHaveLength(0);
  });

  it("charges a higher claim fee on a deposit", () => {
    const world = make();
    const at = frontier(world, TERRAIN.deposit);
    expect(CLAIM_FEE_DEPOSIT).toBeGreaterThan(CLAIM_FEE);
    expect(apply(world, { type: "stake_claim", op: "rival", ...at })).toEqual({ ok: true });
    expect(world.ops[1]!.cash).toBe(STARTING_CASH - CLAIM_FEE_DEPOSIT);
    for (let t = 0; t < SURVEY_TICKS; t++) tick(world);
    expect(world.owner[at.y * world.width + at.x]).toBe(partyIndex(world, "op", "rival"));
  });

  it("rejects water, owned land, a tile someone else is surveying, off the map and no cash, leaving the hash unchanged", () => {
    const world = make();
    const water = firstTile(world, (i) => world.terrain[i] === TERRAIN.water);
    expectRejected(world, { type: "stake_claim", op: "player", ...water }, "on_water");
    for (const kind of ["op", "town", "person"] as const) {
      const owner = world.parties.findIndex((p) => p.kind === kind);
      const at = firstTile(world, (i) => world.owner[i] === owner && world.terrain[i] !== TERRAIN.water);
      expectRejected(world, { type: "stake_claim", op: "player", ...at }, "not_frontier");
    }
    const contested = frontier(world);
    expect(apply(world, { type: "stake_claim", op: "rival", ...contested }).ok).toBe(true);
    expectRejected(world, { type: "stake_claim", op: "player", ...contested }, "being_surveyed");
    expectRejected(world, { type: "stake_claim", op: "rival", ...contested }, "being_surveyed");
    expectRejected(world, { type: "stake_claim", op: "player", x: -1, y: 0 }, "out_of_bounds");
    expectRejected(world, { type: "stake_claim", op: "player", x: world.width, y: 0 }, "out_of_bounds");
    expectRejected(world, { type: "stake_claim", op: "player", x: 0, y: world.height }, "out_of_bounds");
    expectRejected(world, { type: "stake_claim", op: "nobody", x: 0, y: 0 }, "unknown_op");
    world.ops[0]!.cash = CLAIM_FEE - 1;
    expectRejected(world, { type: "stake_claim", op: "player", ...frontier(world) }, "insufficient_cash");
  });

  it("is refused without the attention", () => {
    const world = make();
    world.ops[0]!.attention = ATTENTION_COST.stake_claim - 1;
    expectRejected(world, { type: "stake_claim", op: "player", ...frontier(world) }, "insufficient_attention");
  });

  it("keeps a survey under way through a snapshot round trip", () => {
    const world = make();
    const at = frontier(world);
    expect(apply(world, { type: "stake_claim", op: "player", ...at }).ok).toBe(true);
    for (let t = 0; t < 100; t++) tick(world);
    const copy = fromSnapshot(toSnapshot(world));
    expect(hashWorld(copy)).toBe(hashWorld(world));
    expect(copy.surveys).toEqual([{ tile: at.y * world.width + at.x, op: "player", remaining: SURVEY_TICKS - 100 }]);
    // A format 3 save from before staking has no surveys and still loads.
    const { surveys: _, ...old } = toSnapshot(world);
    expect(fromSnapshot(old as WorldSnapshot).surveys).toEqual([]);
  });
});

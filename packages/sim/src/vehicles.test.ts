import { TERRAIN, TICKS_PER_DAY, type Command, type CommandErrorCode, type WorldSnapshot } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { apply } from "./apply.ts";
import { ATTENTION_COST } from "./attention.ts";
import { BUILDING_SPEC, buildingAt } from "./buildings.ts";
import { hashWorld } from "./hash.ts";
import { createWorld } from "./mapgen.ts";
import { harvesterSite, type HarvesterSite } from "./scenario.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { tick } from "./tick.ts";
import { findPath, VEHICLE_SPEC, vehicleById } from "./vehicles.ts";
import { NO_OWNER, partyIndex, ROAD_BUILT, type World } from "./world.ts";

const HARVESTER = VEHICLE_SPEC.harvester;
const make = (seed = 77) => createWorld({ seed, width: 128, height: 128, ops: ["player", "rival"] });

const ticks = (world: World, n: number) => {
  for (let t = 0; t < n; t++) tick(world);
};

const xy = (world: World, i: number) => ({ x: i % world.width, y: Math.floor(i / world.width) });

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

/** A seed whose world has a harvester site for the Op with this many road tiles. */
function siteWorld(op: string, roads: number): { world: World; site: HarvesterSite } {
  for (let seed = 1; seed < 200; seed++) {
    const world = make(seed);
    const site = harvesterSite(world, op, roads);
    if (site !== null) return { world, site };
  }
  throw new Error(`no world with a ${roads} tile harvester site`);
}

/**
 * Through apply() only: stake the deposit if it is frontier, lay the roads and
 * place the depot. Ticks until the deposit is the Op's and the depot is active.
 */
function prepare(world: World, op: string, site: HarvesterSite): void {
  if (world.owner[site.deposit] === NO_OWNER) {
    expect(apply(world, { type: "stake_claim", op, ...xy(world, site.deposit) })).toEqual({ ok: true });
  }
  for (const r of site.roads) expect(apply(world, { type: "place_road", op, ...xy(world, r) })).toEqual({ ok: true });
  expect(apply(world, { type: "place_building", op, kind: "depot", ...xy(world, site.depot) })).toEqual({ ok: true });
  ticks(world, BUILDING_SPEC.depot.buildTicks);
  expect(world.owner[site.deposit]).toBe(partyIndex(world, "op", op));
  expect(buildingAt(world, site.depot)).toMatchObject({ remaining: 0, staffed: true });
}

/** prepare, buy a harvester and route it. Returns its id. */
function harvester(world: World, op: string, site: HarvesterSite): number {
  prepare(world, op, site);
  const id = world.nextVehicle;
  expect(apply(world, { type: "buy_vehicle", op, kind: "harvester", ...xy(world, site.depot) })).toEqual({ ok: true });
  expect(apply(world, { type: "set_route", op, vehicle: id, ...xy(world, site.deposit) })).toEqual({ ok: true });
  return id;
}

describe("buy_vehicle", () => {
  it("charges a harvester's cost and attention at an active depot the Op owns and puts it on the depot tile", () => {
    const { world, site } = siteWorld("player", 4);
    prepare(world, "player", site);
    const op = world.ops[0]!;
    const cash = op.cash;
    const attention = op.attention;
    expect(apply(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...xy(world, site.depot) })).toEqual({ ok: true });
    expect(op.cash).toBe(cash - HARVESTER.cost);
    expect(op.attention).toBe(attention - ATTENTION_COST.buy_vehicle);
    expect(ATTENTION_COST.buy_vehicle).toBeGreaterThan(0);
    expect(world.vehicles).toEqual([
      { id: 1, kind: "harvester", op: "player", depot: site.depot, tile: site.depot, route: -1, task: "idle", path: [], cargo: 0, wait: 0 },
    ]);
    // With no route it stays home.
    ticks(world, 100);
    expect(world.vehicles[0]!.tile).toBe(site.depot);
    expect(world.nextVehicle).toBe(2);
  });

  it("is refused with a typed error, and nothing changes, without an active depot of the Op's own", () => {
    const { world, site } = siteWorld("player", 4);
    const at = xy(world, site.depot);
    for (const r of site.roads) apply(world, { type: "place_road", op: "player", ...xy(world, r) });
    expectRejected(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...at }, "no_depot");
    expect(apply(world, { type: "place_building", op: "player", kind: "depot", ...at })).toEqual({ ok: true });
    expectRejected(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...at }, "not_active");
    ticks(world, BUILDING_SPEC.depot.buildTicks);
    expectRejected(world, { type: "buy_vehicle", op: "rival", kind: "harvester", ...at }, "not_owner");
    expectRejected(world, { type: "buy_vehicle", op: "ghost", kind: "harvester", ...at }, "unknown_op");
    expectRejected(world, { type: "buy_vehicle", op: "player", kind: "harvester", x: -1, y: 0 }, "out_of_bounds");
    world.ops[0]!.cash = HARVESTER.cost - 1;
    expectRejected(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...at }, "insufficient_cash");
  });
});

describe("set_route and the harvester route", () => {
  it("drives the roads by the shortest path, mines the deposit down, returns and unloads into the depot", () => {
    const { world, site } = siteWorld("player", 6);
    prepare(world, "player", site);
    expect(apply(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...xy(world, site.depot) }).ok).toBe(true);
    const attention = world.ops[0]!.attention;
    expect(apply(world, { type: "set_route", op: "player", vehicle: 1, ...xy(world, site.deposit) })).toEqual({ ok: true });
    expect(world.ops[0]!.attention).toBe(attention - ATTENTION_COST.set_route);
    expect(findPath(world, site.depot, site.deposit)).toEqual([...[...site.roads].reverse(), site.deposit]);
    const v = vehicleById(world, 1)!;
    const richness = world.richness[site.deposit]!;
    const cash = world.ops[0]!.cash;
    const seen: number[] = [];
    let stepTicks = 0;
    const depot = buildingAt(world, site.depot)!;
    for (let t = 0; t < TICKS_PER_DAY && depot.ore === 0; t++) {
      const was = v.tile;
      tick(world);
      if (v.tile !== was) {
        // One tile at a time, onto a neighbour.
        const d = Math.abs(v.tile - was);
        expect(d === 1 || d === world.width).toBe(true);
        seen.push(v.tile);
      }
      if (v.task === "outbound" && v.tile === site.roads[site.roads.length - 1]) stepTicks = world.tick;
    }
    // Off the road it only steps onto its own deposit and depot.
    for (const t of seen) expect(world.road[t] === ROAD_BUILT || t === site.deposit || t === site.depot).toBe(true);
    const out = [...[...site.roads].reverse(), site.deposit];
    const back = [...site.roads, site.depot];
    expect(seen).toEqual([...out, ...back]);
    expect(stepTicks).toBeGreaterThan(0);
    // It mined a full load, lowering the deposit, and left it in the depot.
    expect(depot.ore).toBe(HARVESTER.capacity);
    expect(world.richness[site.deposit]).toBe(richness - HARVESTER.capacity);
    expect(v.cargo).toBe(0);
    // Running the route costs no attention or cash.
    expect(world.ops[0]!.cash).toBe(cash);
    // Then it goes out again by itself.
    ticks(world, 2 * HARVESTER.ticksPerTile);
    expect(v.task).toBe("outbound");
    expect(v.tile).not.toBe(site.depot);
  });

  it("takes the same path and timing in two runs", () => {
    const run = () => {
      const { world, site } = siteWorld("player", 6);
      harvester(world, "player", site);
      ticks(world, 2000);
      return hashWorld(world);
    };
    expect(run()).toBe(run());
  });

  it("is refused with no_path, and with typed errors for land, deposits and vehicles that are not right", () => {
    const { world, site } = siteWorld("player", 6);
    prepare(world, "player", site);
    expect(apply(world, { type: "buy_vehicle", op: "player", kind: "harvester", ...xy(world, site.depot) }).ok).toBe(true);
    const route = (op: string, vehicle: number, tile: number): Command => ({ type: "set_route", op, vehicle, ...xy(world, tile) });
    // A deposit the player owns with no road to it: stake a frontier deposit far from any road.
    const me = partyIndex(world, "op", "player");
    const far = world.terrain.findIndex(
      (t, i) => t === TERRAIN.deposit && world.owner[i] === NO_OWNER && world.richness[i]! > 0 && findPath(world, site.depot, i) === null,
    );
    expect(far).toBeGreaterThanOrEqual(0);
    expect(apply(world, { type: "stake_claim", op: "player", ...xy(world, far) }).ok).toBe(true);
    ticks(world, 400);
    expect(world.owner[far]).toBe(me);
    expectRejected(world, route("player", 1, far), "no_path");
    // A frontier deposit, not the player's.
    const frontier = world.terrain.findIndex((t, i) => t === TERRAIN.deposit && world.owner[i] === NO_OWNER);
    expectRejected(world, route("player", 1, frontier), "not_owner");
    // A tile that is not a deposit.
    expectRejected(world, route("player", 1, site.roads[0]!), "not_deposit");
    // Someone else's vehicle, and no vehicle at all.
    expectRejected(world, route("rival", 1, site.deposit), "not_your_vehicle");
    expectRejected(world, route("player", 99, site.deposit), "unknown_vehicle");
    expectRejected(world, route("ghost", 1, site.deposit), "unknown_op");
    expectRejected(world, { type: "set_route", op: "player", vehicle: 1, x: world.width, y: 0 }, "out_of_bounds");
    // A deposit with no ore left.
    world.richness[site.deposit] = 0;
    expectRejected(world, route("player", 1, site.deposit), "exhausted");
    world.richness[site.deposit] = 50;
    world.ops[0]!.attention = ATTENTION_COST.set_route - 1;
    expectRejected(world, route("player", 1, site.deposit), "insufficient_attention");
  });

  it("waits for a road still under construction", () => {
    const { world, site } = siteWorld("player", 6);
    const id = harvester(world, "player", site);
    const v = vehicleById(world, id)!;
    while (v.tile !== site.roads[1]) tick(world);
    // A road laid on the deposit now holds the harvester one tile short until it is built.
    expect(apply(world, { type: "place_road", op: "player", ...xy(world, site.deposit) }).ok).toBe(true);
    ticks(world, 4 * HARVESTER.ticksPerTile);
    expect(v.tile).toBe(site.roads[0]);
    ticks(world, 30);
    expect(v.tile).toBe(site.deposit);
  });

  it("keeps going when routed to the same deposit again", () => {
    const { world, site } = siteWorld("player", 6);
    const id = harvester(world, "player", site);
    const v = vehicleById(world, id)!;
    ticks(world, HARVESTER.ticksPerTile * 3);
    expect(v.task).toBe("outbound");
    const before = hashWorld(world);
    expect(apply(world, { type: "set_route", op: "player", vehicle: id, ...xy(world, site.deposit) }).ok).toBe(true);
    world.ops[0]!.attention += ATTENTION_COST.set_route;
    expect(hashWorld(world)).toBe(before);
  });
});

describe("an exhausted deposit", () => {
  it("stops yielding at 0 richness and its harvester waits at the depot", () => {
    const { world, site } = siteWorld("player", 4);
    // A thin deposit: one and a half loads.
    world.richness[site.deposit] = HARVESTER.capacity + HARVESTER.capacity / 2;
    const id = harvester(world, "player", site);
    ticks(world, TICKS_PER_DAY);
    const v = vehicleById(world, id)!;
    const depot = buildingAt(world, site.depot)!;
    expect(world.richness[site.deposit]).toBe(0);
    expect(depot.ore).toBe(HARVESTER.capacity + HARVESTER.capacity / 2);
    expect(v).toMatchObject({ tile: site.depot, task: "idle", cargo: 0, path: [] });
    // It stays there.
    ticks(world, TICKS_PER_DAY);
    expect(v).toMatchObject({ tile: site.depot, task: "idle" });
    expect(depot.ore).toBe(HARVESTER.capacity + HARVESTER.capacity / 2);
  });

  it("holds the ore on board while its depot is idle, and unloads once the crew is back", () => {
    const { world, site } = siteWorld("player", 4);
    const id = harvester(world, "player", site);
    const depot = buildingAt(world, site.depot)!;
    const v = vehicleById(world, id)!;
    // The wage goes unpaid: no cash.
    world.ops[0]!.cash = 0;
    ticks(world, TICKS_PER_DAY - (world.tick % TICKS_PER_DAY));
    expect(depot.staffed).toBe(false);
    const ore = depot.ore;
    ticks(world, 600);
    expect(v).toMatchObject({ tile: site.depot, task: "returning", cargo: HARVESTER.capacity });
    expect(depot.ore).toBe(ore);
    world.ops[0]!.cash = 1000;
    ticks(world, 2);
    expect(depot.staffed).toBe(true);
    expect(depot.ore).toBe(ore + HARVESTER.capacity);
    expect(v.cargo).toBe(0);
  });
});

describe("scenario: a harvester 20 road tiles from its depot (DESIGN.md 17)", () => {
  it("delivers ore to the depot within 2 game days of a fresh world", () => {
    const { world, site } = siteWorld("player", 20);
    expect(site.roads.length).toBe(20);
    expect(world.tick).toBe(0);
    harvester(world, "player", site);
    expect(findPath(world, site.depot, site.deposit)!.length).toBe(21);
    const depot = buildingAt(world, site.depot)!;
    while (depot.ore === 0 && world.tick < 2 * TICKS_PER_DAY) tick(world);
    expect(depot.ore).toBeGreaterThan(0);
    expect(world.tick).toBeLessThan(2 * TICKS_PER_DAY);
  });
});

describe("depots and deposits", () => {
  it("refuses a depot on a deposit tile with on_deposit", () => {
    const { world, site } = siteWorld("player", 4);
    expect(apply(world, { type: "stake_claim", op: "player", ...xy(world, site.deposit) }).ok).toBe(true);
    expect(apply(world, { type: "place_road", op: "player", ...xy(world, site.roads[0]!) }).ok).toBe(true);
    ticks(world, 400);
    expectRejected(world, { type: "place_building", op: "player", kind: "depot", ...xy(world, site.deposit) }, "on_deposit");
  });
});

describe("vehicles in the state", () => {
  it("are in the snapshot and the hash with their cargo, depot stock too, and a save from before vehicles loads with none", () => {
    const { world, site } = siteWorld("player", 4);
    harvester(world, "player", site);
    ticks(world, 300);
    const copy = fromSnapshot(toSnapshot(world));
    expect(hashWorld(copy)).toBe(hashWorld(world));
    expect(copy.vehicles).toEqual(world.vehicles);
    expect(copy.nextVehicle).toBe(world.nextVehicle);
    // The copy runs on to the same place.
    ticks(world, 500);
    ticks(copy, 500);
    expect(hashWorld(copy)).toBe(hashWorld(world));
    const other = fromSnapshot(toSnapshot(world));
    other.vehicles[0]!.cargo += 1;
    expect(hashWorld(other)).not.toBe(hashWorld(world));
    const stock = fromSnapshot(toSnapshot(world));
    buildingAt(stock, site.depot)!.ore += 1;
    expect(hashWorld(stock)).not.toBe(hashWorld(world));
    const { vehicles: _v, nextVehicle: _n, ...old } = toSnapshot(make());
    const loaded = fromSnapshot({ ...old, buildings: [{ kind: "depot", tile: 0, op: "player", remaining: 0, staffed: true }] } as unknown as WorldSnapshot);
    expect(loaded.vehicles).toEqual([]);
    expect(loaded.nextVehicle).toBe(1);
    expect(loaded.buildings[0]!.ore).toBe(0);
  });
});

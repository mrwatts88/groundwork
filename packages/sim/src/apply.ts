// The one command API (DESIGN.md 1, 12.2). Every actor, the player included,
// changes the world only through apply(). A command is validated in full
// before anything changes, so a rejected command leaves the world untouched.

import {
  TERRAIN,
  type BuyVehicle,
  type Command,
  type CommandErrorCode,
  type CommandResult,
  type PlaceBuilding,
  type PlaceRoad,
  type SetRoute,
  type StakeClaim,
} from "@groundwork/protocol";
import { attentionCost } from "./attention.ts";
import { BUILDING_SPEC, buildingAt, buildingPrice } from "./buildings.ts";
import { depositProblem, findPath, VEHICLE_SPEC, vehicleById } from "./vehicles.ts";
import {
  inBounds,
  NO_OWNER,
  opIndex,
  partyIndex,
  ROAD_BUILDING,
  ROAD_NONE,
  surveyAt,
  tileIndex,
  type World,
} from "./world.ts";

/** Road cost by terrain, in whole currency units. */
export const ROAD_COST: Readonly<Record<number, number>> = {
  [TERRAIN.flat]: 10,
  [TERRAIN.hills]: 20,
  [TERRAIN.forest]: 15,
  [TERRAIN.rock]: 25,
  [TERRAIN.deposit]: 10,
};

/** Game minutes to build one road tile. */
export const ROAD_BUILD_TICKS = 30;

/** Claim fee to stake one frontier tile, in whole currency units (D-016). */
export const CLAIM_FEE = 200;
/** Claim fee to stake a deposit tile. Ore land costs more. */
export const CLAIM_FEE_DEPOSIT = 600;
/** Game minutes from staking a tile to owning it: 6 game hours (D-016). */
export const SURVEY_TICKS = 360;

/** The claim fee for a tile of this terrain. */
export function claimFee(terrain: number): number {
  return terrain === TERRAIN.deposit ? CLAIM_FEE_DEPOSIT : CLAIM_FEE;
}

function reject(code: CommandErrorCode, message: string): CommandResult {
  return { ok: false, error: { code, message } };
}

function placeRoad(world: World, cmd: PlaceRoad): CommandResult {
  const k = opIndex(world, cmd.op);
  if (k < 0) return reject("unknown_op", `no op ${cmd.op}`);
  if (!inBounds(world, cmd.x, cmd.y)) return reject("out_of_bounds", `(${cmd.x}, ${cmd.y}) is off the map`);
  const i = tileIndex(world, cmd.x, cmd.y);
  const terrain = world.terrain[i]!;
  if (terrain === TERRAIN.water) return reject("on_water", `(${cmd.x}, ${cmd.y}) is water`);
  // Roads go on the Op's own land or on frontier (D-012).
  const owner = world.owner[i]!;
  if (owner !== NO_OWNER && owner !== partyIndex(world, "op", cmd.op)) {
    return reject("not_owner", `(${cmd.x}, ${cmd.y}) belongs to someone else`);
  }
  if (world.road[i] !== ROAD_NONE) return reject("already_road", `(${cmd.x}, ${cmd.y}) already has a road`);
  if (buildingAt(world, i) !== undefined) return reject("occupied", `(${cmd.x}, ${cmd.y}) has a building on it`);
  const cost = ROAD_COST[terrain]!;
  const op = world.ops[k]!;
  if (op.cash < cost) return reject("insufficient_cash", `${cmd.op} has ${op.cash}, the road costs ${cost}`);
  op.cash -= cost;
  world.road[i] = ROAD_BUILDING;
  world.builds.push({ tile: i, remaining: ROAD_BUILD_TICKS });
  return { ok: true };
}

function stakeClaim(world: World, cmd: StakeClaim): CommandResult {
  const k = opIndex(world, cmd.op);
  if (k < 0) return reject("unknown_op", `no op ${cmd.op}`);
  if (!inBounds(world, cmd.x, cmd.y)) return reject("out_of_bounds", `(${cmd.x}, ${cmd.y}) is off the map`);
  const i = tileIndex(world, cmd.x, cmd.y);
  const terrain = world.terrain[i]!;
  if (terrain === TERRAIN.water) return reject("on_water", `(${cmd.x}, ${cmd.y}) is water`);
  if (world.owner[i] !== NO_OWNER) return reject("not_frontier", `(${cmd.x}, ${cmd.y}) is already owned`);
  const survey = surveyAt(world, i);
  if (survey !== undefined) {
    const who = survey.op === cmd.op ? "you are" : "someone else is";
    return reject("being_surveyed", `(${cmd.x}, ${cmd.y}) is being surveyed, ${who} staking it`);
  }
  const fee = claimFee(terrain);
  const op = world.ops[k]!;
  if (op.cash < fee) return reject("insufficient_cash", `${cmd.op} has ${op.cash}, the claim fee is ${fee}`);
  op.cash -= fee;
  world.surveys.push({ tile: i, op: cmd.op, remaining: SURVEY_TICKS });
  return { ok: true };
}

/** True if a road, built or under construction, touches the tile on a side. */
function nextToRoad(world: World, x: number, y: number): boolean {
  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
    if (inBounds(world, nx, ny) && world.road[tileIndex(world, nx, ny)] !== ROAD_NONE) return true;
  }
  return false;
}

function placeBuilding(world: World, cmd: PlaceBuilding): CommandResult {
  const k = opIndex(world, cmd.op);
  if (k < 0) return reject("unknown_op", `no op ${cmd.op}`);
  if (!inBounds(world, cmd.x, cmd.y)) return reject("out_of_bounds", `(${cmd.x}, ${cmd.y}) is off the map`);
  const i = tileIndex(world, cmd.x, cmd.y);
  if (world.terrain[i] === TERRAIN.water) return reject("on_water", `(${cmd.x}, ${cmd.y}) is water`);
  // Buildings go only on the Op's own land, not on frontier (DESIGN.md 6.3).
  if (world.owner[i] !== partyIndex(world, "op", cmd.op)) return reject("not_owner", `${cmd.op} does not own (${cmd.x}, ${cmd.y})`);
  if (world.road[i] !== ROAD_NONE || buildingAt(world, i) !== undefined) {
    return reject("occupied", `(${cmd.x}, ${cmd.y}) is already built on`);
  }
  // A depot on ore would bury the deposit its harvesters mine (D-018).
  if (world.terrain[i] === TERRAIN.deposit) return reject("on_deposit", `(${cmd.x}, ${cmd.y}) is a deposit`);
  if (!nextToRoad(world, cmd.x, cmd.y)) return reject("no_road", `(${cmd.x}, ${cmd.y}) has no road next to it`);
  const price = buildingPrice(cmd.kind);
  const op = world.ops[k]!;
  if (op.cash < price) return reject("insufficient_cash", `${cmd.op} has ${op.cash}, a ${cmd.kind} costs ${price}`);
  op.cash -= price;
  world.buildings.push({ kind: cmd.kind, tile: i, op: cmd.op, remaining: BUILDING_SPEC[cmd.kind].buildTicks, staffed: false, ore: 0 });
  return { ok: true };
}

function buyVehicle(world: World, cmd: BuyVehicle): CommandResult {
  const k = opIndex(world, cmd.op);
  if (k < 0) return reject("unknown_op", `no op ${cmd.op}`);
  if (!inBounds(world, cmd.x, cmd.y)) return reject("out_of_bounds", `(${cmd.x}, ${cmd.y}) is off the map`);
  const i = tileIndex(world, cmd.x, cmd.y);
  const depot = buildingAt(world, i);
  if (depot === undefined || depot.kind !== "depot") return reject("no_depot", `(${cmd.x}, ${cmd.y}) has no depot`);
  if (depot.op !== cmd.op) return reject("not_owner", `the depot at (${cmd.x}, ${cmd.y}) is not ${cmd.op}'s`);
  if (depot.remaining > 0) return reject("not_active", `the depot at (${cmd.x}, ${cmd.y}) is still under construction`);
  const price = VEHICLE_SPEC[cmd.kind].cost;
  const op = world.ops[k]!;
  if (op.cash < price) return reject("insufficient_cash", `${cmd.op} has ${op.cash}, a ${cmd.kind} costs ${price}`);
  op.cash -= price;
  world.vehicles.push({
    id: world.nextVehicle,
    kind: cmd.kind,
    op: cmd.op,
    depot: i,
    tile: i,
    route: -1,
    task: "idle",
    path: [],
    cargo: 0,
    wait: 0,
  });
  world.nextVehicle += 1;
  return { ok: true };
}

function setRoute(world: World, cmd: SetRoute): CommandResult {
  if (opIndex(world, cmd.op) < 0) return reject("unknown_op", `no op ${cmd.op}`);
  const v = vehicleById(world, cmd.vehicle);
  if (v === undefined) return reject("unknown_vehicle", `no vehicle ${cmd.vehicle}`);
  if (v.op !== cmd.op) return reject("not_your_vehicle", `vehicle ${cmd.vehicle} is not ${cmd.op}'s`);
  if (!inBounds(world, cmd.x, cmd.y)) return reject("out_of_bounds", `(${cmd.x}, ${cmd.y}) is off the map`);
  const i = tileIndex(world, cmd.x, cmd.y);
  const problem = depositProblem(world, cmd.op, i);
  if (problem !== null) {
    const why = {
      not_deposit: "is not a deposit",
      not_owner: `is not ${cmd.op}'s land`,
      occupied: "has a building on it",
      exhausted: "has no ore left",
    }[problem];
    return reject(problem, `(${cmd.x}, ${cmd.y}) ${why}`);
  }
  if (findPath(world, v.depot, i) === null) return reject("no_path", `no road joins the depot to (${cmd.x}, ${cmd.y})`);
  const changed = v.route !== i;
  v.route = i;
  // On its way out to, or mining, another deposit, it heads home first and sets off on the new route from there.
  if (changed && (v.task === "outbound" || v.task === "mining")) {
    v.task = "returning";
    v.path = findPath(world, v.tile, v.depot) ?? [];
  }
  return { ok: true };
}

function dispatch(world: World, command: Command): CommandResult {
  switch (command.type) {
    case "place_road":
      return placeRoad(world, command);
    case "stake_claim":
      return stakeClaim(world, command);
    case "place_building":
      return placeBuilding(world, command);
    case "buy_vehicle":
      return buyVehicle(world, command);
    case "set_route":
      return setRoute(world, command);
  }
}

export function apply(world: World, command: Command): CommandResult {
  const cost = attentionCost(command.type);
  const op = world.ops[opIndex(world, command.op)];
  if (op !== undefined && op.attention < cost) {
    return reject(
      "insufficient_attention",
      `${command.op} has ${op.attention} attention left today, ${command.type} costs ${cost}`,
    );
  }
  const result = dispatch(world, command);
  // Handlers validate in full before changing anything, so only a success is charged.
  if (result.ok && op !== undefined) op.attention -= cost;
  return result;
}

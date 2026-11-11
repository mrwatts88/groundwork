// The one command API (DESIGN.md 1, 12.2). Every actor, the player included,
// changes the world only through apply(). A command is validated in full
// before anything changes, so a rejected command leaves the world untouched.

import {
  TERRAIN,
  type Command,
  type CommandErrorCode,
  type CommandResult,
  type PlaceRoad,
  type StakeClaim,
} from "@groundwork/protocol";
import { attentionCost } from "./attention.ts";
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

function dispatch(world: World, command: Command): CommandResult {
  switch (command.type) {
    case "place_road":
      return placeRoad(world, command);
    case "stake_claim":
      return stakeClaim(world, command);
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

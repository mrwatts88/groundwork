// The one command API (DESIGN.md 1, 12.2). Every actor, the player included,
// changes the world only through apply(). A command is validated in full
// before anything changes, so a rejected command leaves the world untouched.

import {
  TERRAIN,
  type Command,
  type CommandErrorCode,
  type CommandResult,
  type PlaceRoad,
} from "@groundwork/protocol";
import { inBounds, opIndex, partyIndex, ROAD_BUILDING, ROAD_NONE, tileIndex, type World } from "./world.ts";

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
  if (world.owner[i] !== partyIndex(world, "op", cmd.op)) return reject("not_owner", `${cmd.op} does not own (${cmd.x}, ${cmd.y})`);
  if (world.road[i] !== ROAD_NONE) return reject("already_road", `(${cmd.x}, ${cmd.y}) already has a road`);
  const cost = ROAD_COST[terrain]!;
  const op = world.ops[k]!;
  if (op.cash < cost) return reject("insufficient_cash", `${cmd.op} has ${op.cash}, the road costs ${cost}`);
  op.cash -= cost;
  world.road[i] = ROAD_BUILDING;
  world.builds.push({ tile: i, remaining: ROAD_BUILD_TICKS });
  return { ok: true };
}

export function apply(world: World, command: Command): CommandResult {
  switch (command.type) {
    case "place_road":
      return placeRoad(world, command);
  }
}

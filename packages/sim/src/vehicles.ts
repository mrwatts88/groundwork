// Vehicles and the harvester route (DESIGN.md 3, 5.1, D-018). An Op buys a
// vehicle at one of its active depots with buy_vehicle, and points it at a
// deposit with set_route. From then on it runs by itself, at no attention
// cost: out along the roads to the deposit, mining ore there, back to the
// depot, unloading into the depot's ore stock, and out again.

import { TERRAIN, type VehicleKind } from "@groundwork/protocol";
import { buildingAt } from "./buildings.ts";
import { partyIndex, ROAD_BUILDING, ROAD_NONE, type Vehicle, type World } from "./world.ts";

export interface VehicleSpec {
  /** Price, whole currency units. */
  readonly cost: number;
  /** Ore it can carry. */
  readonly capacity: number;
  /** Game minutes to drive one tile. */
  readonly ticksPerTile: number;
  /** Game minutes to mine one unit of ore. */
  readonly mineTicks: number;
}

/** The one table of vehicle prices and speeds. */
export const VEHICLE_SPEC: Readonly<Record<VehicleKind, VehicleSpec>> = {
  harvester: { cost: 800, capacity: 10, ticksPerTile: 6, mineTicks: 12 },
};

/** Game minutes a vehicle waits before trying again when it has no way to go. */
export const RETRY_TICKS = 60;

/** The vehicle with this id, if any. */
export function vehicleById(world: World, id: number): Vehicle | undefined {
  return world.vehicles.find((v) => v.id === id);
}

/**
 * The shortest path from one tile to another, along road tiles (built or
 * under construction). Only the start and the goal may be off the road. The
 * search tries neighbours in a fixed order (east, west, south, north), so the
 * same world always gives the same path. Returns the tiles after the start,
 * the goal last, or null when there is no way.
 */
export function findPath(world: World, from: number, to: number): number[] | null {
  if (from === to) return [];
  const { width, height } = world;
  const prev = new Int32Array(width * height).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    const x = at % width;
    const y = (at - x) / width;
    const next = [x + 1 < width ? at + 1 : -1, x > 0 ? at - 1 : -1, y + 1 < height ? at + width : -1, y > 0 ? at - width : -1];
    for (const n of next) {
      if (n < 0 || prev[n] !== -1) continue;
      if (n !== to && world.road[n] === ROAD_NONE) continue;
      prev[n] = at;
      if (n === to) {
        const path: number[] = [];
        for (let t = to; t !== from; t = prev[t]!) path.push(t);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/**
 * Why a harvester of this Op cannot mine this tile, or null if it can: it
 * must be a deposit the Op owns, with ore left and no building on it.
 */
export function depositProblem(world: World, op: string, tile: number): "not_deposit" | "not_owner" | "occupied" | "exhausted" | null {
  if (world.terrain[tile] !== TERRAIN.deposit) return "not_deposit";
  if (world.owner[tile] !== partyIndex(world, "op", op)) return "not_owner";
  if (buildingAt(world, tile) !== undefined) return "occupied";
  if (world.richness[tile] === 0) return "exhausted";
  return null;
}

/** Start a leg towards a tile. With no way there, wait and try again later. */
function setOff(world: World, v: Vehicle, to: number, task: "outbound" | "returning"): void {
  const path = findPath(world, v.tile, to);
  if (path === null) {
    v.wait = RETRY_TICKS;
    return;
  }
  v.task = task;
  v.path = path;
}

/** Drive one tile. A road still under construction holds the vehicle until it is built. */
function drive(world: World, v: Vehicle): void {
  const next = v.path[0]!;
  if (world.road[next] === ROAD_BUILDING) return;
  v.tile = next;
  v.path.shift();
  v.wait = VEHICLE_SPEC[v.kind].ticksPerTile - 1;
}

function act(world: World, v: Vehicle): void {
  const spec = VEHICLE_SPEC[v.kind];
  if (v.path.length > 0) {
    drive(world, v);
    return;
  }
  switch (v.task) {
    case "idle":
      // Out again only while the deposit still has ore for this Op.
      if (v.route >= 0 && depositProblem(world, v.op, v.route) === null) setOff(world, v, v.route, "outbound");
      return;
    case "outbound":
      if (v.tile === v.route) v.task = "mining";
      else setOff(world, v, v.route, "outbound");
      return;
    case "mining":
      if (v.cargo < spec.capacity && depositProblem(world, v.op, v.tile) === null) {
        v.cargo += 1;
        world.richness[v.tile] = world.richness[v.tile]! - 1;
        v.wait = spec.mineTicks - 1;
      } else {
        setOff(world, v, v.depot, "returning");
      }
      return;
    case "returning": {
      if (v.tile !== v.depot) {
        setOff(world, v, v.depot, "returning");
        return;
      }
      // An idle depot has no crew to take the ore, so the vehicle waits.
      const depot = buildingAt(world, v.depot);
      if (depot === undefined || depot.remaining > 0 || !depot.staffed) return;
      depot.ore += v.cargo;
      v.cargo = 0;
      v.task = "idle";
      return;
    }
  }
}

/** Called once per tick after buildings update. Vehicles act in the order they were bought. */
export function updateVehicles(world: World): void {
  for (const v of world.vehicles) {
    if (v.wait > 0) v.wait -= 1;
    else act(world, v);
  }
}

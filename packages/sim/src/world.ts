// World state (DESIGN.md 4.2, 6.1). Plain data with integer fields only, so it
// hashes and replays bit for bit.

import type { OpId } from "@groundwork/protocol";
import type { Rng } from "./rng.ts";

export interface Op {
  readonly id: OpId;
  /** Whole currency units. Money is integer (DESIGN.md 12.3). */
  cash: number;
}

/** A road tile under construction. */
export interface Build {
  readonly tile: number;
  remaining: number;
}

export const ROAD_NONE = 0;
export const ROAD_BUILDING = 1;
export const ROAD_BUILT = 2;

/** Owner value for land no one holds (frontier). Op owners are op index + 1. */
export const NO_OWNER = 0;

export interface World {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** Game minutes since the world began (DESIGN.md 11.1). */
  tick: number;
  readonly rng: Rng;
  /** One TERRAIN value per tile, row major. */
  readonly terrain: Uint8Array;
  /** Deposit richness per tile, 0 where there is no deposit. */
  readonly richness: Uint8Array;
  /** Parcel owner per tile: NO_OWNER or op index + 1. */
  readonly owner: Uint16Array;
  /** ROAD_NONE, ROAD_BUILDING or ROAD_BUILT per tile. */
  readonly road: Uint8Array;
  /** Ops in creation order. Their order is part of the state. */
  readonly ops: Op[];
  /** Construction in the order it was ordered. */
  readonly builds: Build[];
}

export function tileIndex(world: World, x: number, y: number): number {
  return y * world.width + x;
}

export function inBounds(world: World, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function opIndex(world: World, id: OpId): number {
  return world.ops.findIndex((op) => op.id === id);
}

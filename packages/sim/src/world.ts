// World state (DESIGN.md 4.2, 6.1). Plain data with integer fields only, so it
// hashes and replays bit for bit.

import type { OpId, Party, PartyKind, PersonState } from "@groundwork/protocol";
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

/**
 * The world format version. Bump it when a saved world can no longer be
 * loaded by this code. Ring 0 worlds are format 1 and carry no version.
 * Format 3 added named people.
 */
export const WORLD_FORMAT = 3;

/** Owner value for land no one holds: party 0, frontier. */
export const NO_OWNER = 0;

export interface Town {
  readonly id: string;
  readonly name: string;
  /** Tile index of the market. */
  readonly market: number;
}

/** A named person (DESIGN.md 7.1). Their party id is their id. */
export type Person = PersonState;

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
  /** Parcel owner per tile: an index into parties. 0 is frontier. */
  readonly owner: Uint16Array;
  /** ROAD_NONE, ROAD_BUILDING or ROAD_BUILT per tile. */
  readonly road: Uint8Array;
  /** Ops in creation order. Their order is part of the state. */
  readonly ops: Op[];
  /** Construction in the order it was ordered. */
  readonly builds: Build[];
  /**
   * Everyone who can own land, in a fixed order: frontier first, then the
   * Ops, then the town, then named people. Owner values index this list.
   */
  readonly parties: Party[];
  readonly town: Town;
  /** The town's named people, in creation order. Each is also a party. */
  readonly people: Person[];
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

/** The one lookup from an owner value to the party that holds the land. */
export function partyOf(world: World, owner: number): Party {
  const party = world.parties[owner];
  if (party === undefined) throw new Error(`owner ${owner} is not a party`);
  return party;
}

/** The party that owns a tile. */
export function tileOwner(world: World, tile: number): Party {
  return partyOf(world, world.owner[tile]!);
}

/** The owner value a party's tiles carry, or -1 if there is no such party. */
export function partyIndex(world: World, kind: PartyKind, id: string): number {
  return world.parties.findIndex((p) => p.kind === kind && p.id === id);
}

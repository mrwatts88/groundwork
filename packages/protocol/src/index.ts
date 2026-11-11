// Command, event and state types, zod schemas and wire messages (DESIGN.md 12.2).
// Depends on nothing.

export const PROTOCOL_VERSION = 1;

export const PACKAGE_NAMES = ["protocol", "sim", "minds", "server", "client"] as const;

export type PackageName = (typeof PACKAGE_NAMES)[number];

// Terrain kinds (DESIGN.md 4.2). Stored as one byte per tile in the sim.
export const TERRAIN = {
  flat: 0,
  hills: 1,
  water: 2,
  forest: 3,
  rock: 4,
  deposit: 5,
} as const;

export type TerrainName = keyof typeof TERRAIN;
export type Terrain = (typeof TERRAIN)[TerrainName];

export const TERRAIN_NAMES: readonly TerrainName[] = [
  "flat",
  "hills",
  "water",
  "forest",
  "rock",
  "deposit",
];

/** An Operation id. The player Op and every rival Op use the same kind of id. */
export type OpId = string;

/** Lay one road tile on a parcel the Op owns (DESIGN.md 6.3). */
export interface PlaceRoad {
  readonly type: "place_road";
  readonly op: OpId;
  readonly x: number;
  readonly y: number;
}

/** Every command any actor can issue. The one command API takes these (DESIGN.md 12.2). */
export type Command = PlaceRoad;

/** A command as recorded in the command log, stamped with the tick it applies at. */
export interface LoggedCommand {
  readonly tick: number;
  readonly command: Command;
}

export type CommandErrorCode =
  | "unknown_op"
  | "out_of_bounds"
  | "on_water"
  | "not_owner"
  | "already_road"
  | "insufficient_cash";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: CommandError };

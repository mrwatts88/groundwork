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

// ---------------------------------------------------------------------------
// Time (DESIGN.md 11.1). One tick is one game minute. Tick 0 is day 1, 00:00.

export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

export interface GameDate {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function gameDate(tick: number): GameDate {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const ofDay = tick - (day - 1) * TICKS_PER_DAY;
  return { day, hour: Math.floor(ofDay / TICKS_PER_HOUR), minute: ofDay % TICKS_PER_HOUR };
}

export function formatGameDate(tick: number): string {
  const d = gameDate(tick);
  return `Day ${d.day}, ${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;
}

/** present: someone is here at 1x. speedup: someone is here and sped it up. away: no input for a while. */
export type ClockMode = "present" | "speedup" | "away";

export interface ClockStatus {
  readonly mode: ClockMode;
  /** Ticks per base tick interval: 1 to the max speed while present, the away rate while away. */
  readonly rate: number;
  /** The speed the player chose. It returns when they come back. */
  readonly speed: number;
}

// ---------------------------------------------------------------------------
// World state on the wire and in snapshots. Typed arrays travel as plain
// number arrays.

export interface OpState {
  readonly id: OpId;
  readonly cash: number;
}

/**
 * Who can own a parcel (DESIGN.md 4.2, D-012). A tile's owner value is an
 * index into the world's party list. Index 0 is always frontier.
 */
export type PartyKind = "frontier" | "op" | "town" | "person";

export interface Party {
  readonly kind: PartyKind;
  /** The Op id, town id or person id. Frontier's id is "frontier". */
  readonly id: string;
}

/** The one town of Ring 1 (DESIGN.md 4.3). Its land is the tiles the town party owns. */
export interface TownState {
  readonly id: string;
  readonly name: string;
  /** The market tile: where trucks sell. */
  readonly market: number;
}

export interface BuildState {
  readonly tile: number;
  readonly remaining: number;
}

export interface WorldSnapshot {
  /** The world format version (see WORLD_FORMAT in sim). Ring 0 snapshots have none. */
  readonly format: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly tick: number;
  readonly rngState: number;
  readonly terrain: readonly number[];
  readonly richness: readonly number[];
  readonly owner: readonly number[];
  readonly road: readonly number[];
  readonly ops: readonly OpState[];
  readonly builds: readonly BuildState[];
  readonly parties: readonly Party[];
  readonly town: TownState;
}

/** A changed tile: [tile index, new value]. */
export type TileChange = readonly [number, number];

export interface WorldDelta {
  readonly owner: readonly TileChange[];
  readonly road: readonly TileChange[];
  readonly ops: readonly OpState[];
  readonly builds: readonly BuildState[];
}

// ---------------------------------------------------------------------------
// Wire messages (DESIGN.md 12.1). The client sends commands and receives
// state deltas.

export interface CommandMessage {
  readonly type: "command";
  /** Chosen by the client, echoed in the result. */
  readonly id: number;
  readonly command: Command;
}

export interface SetSpeedMessage {
  readonly type: "set_speed";
  readonly speed: number;
}

export type ClientMessage = CommandMessage | SetSpeedMessage;

export interface WelcomeMessage {
  readonly type: "welcome";
  readonly protocol: number;
  readonly date: string;
  readonly clock: ClockStatus;
  readonly state: WorldSnapshot;
}

export interface TickMessage {
  readonly type: "tick";
  readonly tick: number;
  readonly date: string;
  readonly clock: ClockStatus;
  readonly delta: WorldDelta;
}

export interface CommandResultMessage {
  readonly type: "command_result";
  readonly id: number;
  readonly result: CommandResult;
}

export interface ErrorMessage {
  readonly type: "error";
  readonly message: string;
}

export type ServerMessage = WelcomeMessage | TickMessage | CommandResultMessage | ErrorMessage;

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** Check the shape of a command. Game rules are the sim's job, not this one. */
export function parseCommand(v: unknown): Parsed<Command> {
  if (!isRecord(v)) return { ok: false, message: "command must be an object" };
  switch (v["type"]) {
    case "place_road": {
      const { op, x, y } = v;
      if (typeof op !== "string" || op.length === 0) return { ok: false, message: "place_road needs an op id" };
      if (!isInt(x) || !isInt(y)) return { ok: false, message: "place_road needs integer x and y" };
      return { ok: true, value: { type: "place_road", op, x, y } };
    }
    default:
      return { ok: false, message: `unknown command type ${JSON.stringify(v["type"])}` };
  }
}

/** Parse one raw client frame. Never throws. */
export function parseClientMessage(raw: string): Parsed<ClientMessage> {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, message: "message is not JSON" };
  }
  if (!isRecord(v)) return { ok: false, message: "message must be an object" };
  switch (v["type"]) {
    case "command": {
      if (!isInt(v["id"])) return { ok: false, message: "command message needs an integer id" };
      const command = parseCommand(v["command"]);
      if (!command.ok) return command;
      return { ok: true, value: { type: "command", id: v["id"], command: command.value } };
    }
    case "set_speed": {
      if (!isInt(v["speed"])) return { ok: false, message: "set_speed needs an integer speed" };
      return { ok: true, value: { type: "set_speed", speed: v["speed"] } };
    }
    default:
      return { ok: false, message: `unknown message type ${JSON.stringify(v["type"])}` };
  }
}

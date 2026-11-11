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

/** Lay one road tile on the Op's own land or on frontier (DESIGN.md 6.3, D-012). */
export interface PlaceRoad {
  readonly type: "place_road";
  readonly op: OpId;
  readonly x: number;
  readonly y: number;
}

/**
 * Stake one frontier tile (DESIGN.md 5.3). The Op pays a claim fee now and
 * owns the tile once the survey is done.
 */
export interface StakeClaim {
  readonly type: "stake_claim";
  readonly op: OpId;
  readonly x: number;
  readonly y: number;
}

/** Kinds of building an Op can place. Ring 1 has the depot (DESIGN.md 6.3, D-017). */
export const BUILDING_KINDS = ["depot"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

/**
 * Place a building on a dry tile the Op owns, next to a road (DESIGN.md 6.3).
 * The Op pays the build price (a hiring cost included) now. The building is
 * under construction for its build time, then active.
 */
export interface PlaceBuilding {
  readonly type: "place_building";
  readonly op: OpId;
  readonly kind: BuildingKind;
  readonly x: number;
  readonly y: number;
}

/** Every command any actor can issue. The one command API takes these (DESIGN.md 12.2). */
export type Command = PlaceRoad | StakeClaim | PlaceBuilding;

export type CommandType = Command["type"];

/**
 * Every command type, at runtime. The sim's attention cost table is checked
 * against this list, and the line below fails to compile if a type is missing.
 */
export const COMMAND_TYPES = ["place_road", "stake_claim", "place_building"] as const satisfies readonly CommandType[];
type MissingCommandType = Exclude<CommandType, (typeof COMMAND_TYPES)[number]>;
const allCommandTypesListed: [MissingCommandType] extends [never] ? true : never = true;
void allCommandTypesListed;

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
  | "not_frontier"
  | "being_surveyed"
  | "already_road"
  | "no_road"
  | "occupied"
  | "insufficient_cash"
  | "insufficient_attention";

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

/**
 * Attention points every Op starts each game day with (DESIGN.md 6.2, D-015).
 * Here so the client can show N/40. What each command costs lives in the sim.
 */
export const ATTENTION_PER_DAY = 40;

/** Attention as the HUD shows it: left today over the daily budget. */
export function formatAttention(left: number | undefined): string {
  return left === undefined ? "-" : `${left}/${ATTENTION_PER_DAY}`;
}

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
  /** Attention points left today (DESIGN.md 6.2). Refilled at each day boundary. */
  readonly attention: number;
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

/**
 * A named person (DESIGN.md 7.1). Their land is the tiles their party owns.
 * Traits come from a fixed list in the sim. asking is a percent applied to
 * the base price of land when they sell (100 is a fair price).
 */
export interface PersonState {
  /** Also their party id. */
  readonly id: string;
  readonly name: string;
  readonly job: string;
  /** Tile index of their home, on town land. */
  readonly home: number;
  readonly traits: readonly string[];
  readonly asking: number;
}

export interface BuildState {
  readonly tile: number;
  readonly remaining: number;
}

/** A frontier tile an Op has staked. It becomes the Op's when remaining reaches 0. */
export interface SurveyState {
  readonly tile: number;
  readonly op: OpId;
  /** Game minutes until the survey is done. */
  readonly remaining: number;
}

/**
 * A building an Op placed (DESIGN.md 6.3, 5.5). remaining counts down the
 * construction. At 0 it is active. An active building is staffed while its Op
 * pays the daily wage and idle while it cannot.
 */
export interface BuildingState {
  readonly kind: BuildingKind;
  readonly tile: number;
  readonly op: OpId;
  /** Game minutes of construction left. 0 means built. */
  readonly remaining: number;
  /** Whether its crew is paid and working. False while under construction. */
  readonly staffed: boolean;
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
  /** Stakes still being surveyed, in the order they were made. Missing in saves from before R1-05. */
  readonly surveys: readonly SurveyState[];
  /** Buildings Ops placed, in the order they were placed. Missing in saves from before R1-06. */
  readonly buildings: readonly BuildingState[];
  readonly parties: readonly Party[];
  readonly town: TownState;
  /** The town's named people, in creation order. */
  readonly people: readonly PersonState[];
}

/** A changed tile: [tile index, new value]. */
export type TileChange = readonly [number, number];

export interface WorldDelta {
  readonly owner: readonly TileChange[];
  readonly road: readonly TileChange[];
  readonly ops: readonly OpState[];
  readonly builds: readonly BuildState[];
  readonly surveys: readonly SurveyState[];
  readonly buildings: readonly BuildingState[];
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
  /** Display names of Ops other than the player's, by Op id. From server config. */
  readonly opNames: Readonly<Record<OpId, string>>;
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
    case "place_road":
    case "stake_claim": {
      const type = v["type"];
      const { op, x, y } = v;
      if (typeof op !== "string" || op.length === 0) return { ok: false, message: `${type} needs an op id` };
      if (!isInt(x) || !isInt(y)) return { ok: false, message: `${type} needs integer x and y` };
      return { ok: true, value: { type, op, x, y } };
    }
    case "place_building": {
      const { op, kind, x, y } = v;
      if (typeof op !== "string" || op.length === 0) return { ok: false, message: "place_building needs an op id" };
      if (!BUILDING_KINDS.includes(kind as BuildingKind)) {
        return { ok: false, message: `place_building needs a kind, one of ${BUILDING_KINDS.join(", ")}` };
      }
      if (!isInt(x) || !isInt(y)) return { ok: false, message: "place_building needs integer x and y" };
      return { ok: true, value: { type: "place_building", op, kind: kind as BuildingKind, x, y } };
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

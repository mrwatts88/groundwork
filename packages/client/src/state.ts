// The client's copy of the world, built from the welcome snapshot and kept
// current with tick deltas. The server is the authority. The client never
// changes this except from server messages.

import {
  TERRAIN,
  TERRAIN_NAMES,
  type ClockStatus,
  type OpId,
  type OpState,
  type Party,
  type PersonState,
  type TownState,
  type WorldDelta,
  type WorldSnapshot,
} from "@groundwork/protocol";

/** The player's Op id. Matches PLAYER_OP on the server. */
export const PLAYER_OP = "player";

export const ROAD_NONE = 0;
export const ROAD_BUILDING = 1;
export const ROAD_BUILT = 2;

/** Whose land a tile is, from the player's point of view. The ownership overlay colours by this. */
export type OwnerKind = "frontier" | "you" | "rival" | "town" | "person";

/** What the inspector panel shows for a tile. */
export interface TileInfo {
  readonly x: number;
  readonly y: number;
  readonly terrain: string;
  readonly owner: string;
  readonly ownerKind: OwnerKind;
  /** Deposit richness, or undefined where there is no deposit. */
  readonly richness: number | undefined;
  /** A building on the tile, if any: "market" or the home of a named person. */
  readonly building: string | undefined;
}

export class ClientWorld {
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;
  readonly owner: Uint16Array;
  readonly road: Uint8Array;
  readonly richness: Uint8Array;
  ops: readonly OpState[];
  /** Display names of other Ops, by id. */
  readonly opNames: Readonly<Record<OpId, string>>;
  /** Owner values index this list. 0 is frontier. */
  readonly parties: readonly Party[];
  readonly town: TownState;
  readonly people: readonly PersonState[];
  tick: number;
  date: string;
  clock: ClockStatus;

  constructor(state: WorldSnapshot, date: string, clock: ClockStatus, opNames: Readonly<Record<OpId, string>> = {}) {
    this.width = state.width;
    this.height = state.height;
    this.terrain = Uint8Array.from(state.terrain);
    this.owner = Uint16Array.from(state.owner);
    this.road = Uint8Array.from(state.road);
    this.richness = Uint8Array.from(state.richness);
    this.ops = state.ops;
    this.opNames = opNames;
    this.parties = state.parties;
    this.town = state.town;
    this.people = state.people;
    this.tick = state.tick;
    this.date = date;
    this.clock = clock;
  }

  /** Apply a tick delta. Returns the tile indices whose look changed. */
  applyDelta(tick: number, date: string, clock: ClockStatus, delta: WorldDelta): number[] {
    this.tick = tick;
    this.date = date;
    this.clock = clock;
    this.ops = delta.ops;
    const changed: number[] = [];
    for (const [i, v] of delta.owner) {
      this.owner[i] = v;
      changed.push(i);
    }
    for (const [i, v] of delta.road) {
      this.road[i] = v;
      changed.push(i);
    }
    return changed;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** The owner value the player's tiles carry, or -1 if there is no player Op. */
  playerOwner(): number {
    return this.parties.findIndex((p) => p.kind === "op" && p.id === PLAYER_OP);
  }

  /** Whose land a tile is: yours, a rival's, the town's, a person's or nobody's. */
  ownerKind(tile: number): OwnerKind {
    const owner = this.owner[tile]!;
    if (owner === this.playerOwner()) return "you";
    const party = this.parties[owner];
    if (party === undefined || party.kind === "frontier") return "frontier";
    if (party.kind === "op") return "rival";
    return party.kind;
  }

  /** Who holds a tile, in words. */
  ownerName(tile: number): string {
    const owner = this.owner[tile]!;
    if (owner === this.playerOwner()) return "You";
    const party = this.parties[owner];
    if (party === undefined || party.kind === "frontier") return "Nobody";
    if (party.kind === "town") return this.town.name;
    if (party.kind === "person") return this.people.find((p) => p.id === party.id)?.name ?? party.id;
    return this.opNames[party.id] ?? party.id;
  }

  /** The named person whose home is on a tile, if any. */
  homeOf(tile: number): PersonState | undefined {
    return this.people.find((p) => p.home === tile);
  }

  /** Everything the inspector shows for a tile. */
  inspect(x: number, y: number): TileInfo {
    const i = this.index(x, y);
    const terrain = this.terrain[i]!;
    const home = this.homeOf(i);
    return {
      x,
      y,
      terrain: TERRAIN_NAMES[terrain] ?? "unknown",
      owner: this.ownerName(i),
      ownerKind: this.ownerKind(i),
      richness: terrain === TERRAIN.deposit ? this.richness[i] : undefined,
      building: i === this.town.market ? "market" : home !== undefined ? `home of ${home.name}` : undefined,
    };
  }

  /** The middle of the town, in tiles: the centre of its land. */
  townCentre(): { x: number; y: number } {
    const town = this.parties.findIndex((p) => p.kind === "town");
    return this.centreOf(town);
  }

  playerCash(): number | undefined {
    return this.ops.find((op) => op.id === PLAYER_OP)?.cash;
  }

  /** The middle of the player's land, in tiles. Falls back to the map centre. */
  playerHome(): { x: number; y: number } {
    return this.centreOf(this.playerOwner());
  }

  /** The middle of one party's land. Falls back to the map centre. */
  private centreOf(me: number): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    let n = 0;
    if (me >= 0) {
      for (let i = 0; i < this.owner.length; i++) {
        if (this.owner[i] !== me) continue;
        sx += i % this.width;
        sy += Math.floor(i / this.width);
        n++;
      }
    }
    if (n === 0) return { x: this.width / 2, y: this.height / 2 };
    return { x: sx / n, y: sy / n };
  }
}

/** One line for the HUD: speed and clock mode. */
export function formatClock(clock: ClockStatus): string {
  if (clock.mode === "away") return `away (${clock.rate}x)`;
  return `${clock.rate}x ${clock.mode === "speedup" ? "sped up" : "live"}`;
}

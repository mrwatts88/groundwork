// The client's copy of the world, built from the welcome snapshot and kept
// current with tick deltas. The server is the authority. The client never
// changes this except from server messages.

import type { ClockStatus, OpState, Party, TownState, WorldDelta, WorldSnapshot } from "@groundwork/protocol";

/** The player's Op id. Matches PLAYER_OP on the server. */
export const PLAYER_OP = "player";

export const ROAD_NONE = 0;
export const ROAD_BUILDING = 1;
export const ROAD_BUILT = 2;

export class ClientWorld {
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;
  readonly owner: Uint16Array;
  readonly road: Uint8Array;
  ops: readonly OpState[];
  /** Owner values index this list. 0 is frontier. */
  readonly parties: readonly Party[];
  readonly town: TownState;
  tick: number;
  date: string;
  clock: ClockStatus;

  constructor(state: WorldSnapshot, date: string, clock: ClockStatus) {
    this.width = state.width;
    this.height = state.height;
    this.terrain = Uint8Array.from(state.terrain);
    this.owner = Uint16Array.from(state.owner);
    this.road = Uint8Array.from(state.road);
    this.ops = state.ops;
    this.parties = state.parties;
    this.town = state.town;
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

  /** Who holds a tile, in words. */
  ownerName(tile: number): string {
    const owner = this.owner[tile]!;
    if (owner === this.playerOwner()) return "you";
    const party = this.parties[owner];
    if (party === undefined || party.kind === "frontier") return "nobody";
    if (party.kind === "town") return this.town.name;
    return party.id;
  }

  playerCash(): number | undefined {
    return this.ops.find((op) => op.id === PLAYER_OP)?.cash;
  }

  /** The middle of the player's land, in tiles. Falls back to the map centre. */
  playerHome(): { x: number; y: number } {
    const me = this.playerOwner();
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

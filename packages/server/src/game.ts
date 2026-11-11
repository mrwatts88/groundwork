// The authoritative world on the server: load or create it, replay the log to
// where it stopped, apply commands, tick, persist and produce deltas.

import type { Command, CommandResult, TileChange, WorldDelta } from "@groundwork/protocol";
import { apply, copyVehicle, createWorld, fromSnapshot, run, tick, toSnapshot, type World } from "@groundwork/sim";
import type { Store } from "./store.ts";

export const PLAYER_OP = "player";
/** Ring 1 has one rival Op (DESIGN.md 8). */
export const RIVAL_OP = "rival";
export const OPS = [PLAYER_OP, RIVAL_OP] as const;

export interface GameOptions {
  readonly seed: number;
  readonly mapSize: number;
  readonly snapshotEveryTicks: number;
}

export class Game {
  readonly world: World;
  private readonly store: Store;
  private readonly snapshotEveryTicks: number;
  private sentOwner: Uint16Array;
  private sentRoad: Uint8Array;

  constructor(store: Store, options: GameOptions) {
    this.store = store;
    this.snapshotEveryTicks = options.snapshotEveryTicks;
    this.world = Game.load(store, options);
    this.sentOwner = this.world.owner.slice();
    this.sentRoad = this.world.road.slice();
  }

  /** Latest snapshot, then the command log since it, up to the tick reached. */
  private static load(store: Store, options: GameOptions): World {
    const snapshot = store.latestSnapshot();
    if (snapshot === undefined) {
      const world = createWorld({
        seed: options.seed,
        width: options.mapSize,
        height: options.mapSize,
        ops: OPS,
      });
      store.saveSnapshot(toSnapshot(world));
      return world;
    }
    const world = fromSnapshot(snapshot);
    const log = store.commandsSince(world.tick);
    const reached = store.tick() ?? world.tick;
    run(world, log, reached - world.tick);
    // Commands accepted at the tick reached, before that tick ran.
    for (const entry of log) if (entry.tick === world.tick) apply(world, entry.command);
    return world;
  }

  /** Apply a command now. It is stamped with the current tick, which is where a replay puts it. */
  command(command: Command): CommandResult {
    const result = apply(this.world, command);
    if (result.ok) this.store.appendCommand(this.world.tick, command);
    return result;
  }

  step(): void {
    tick(this.world);
    if (this.world.tick % this.snapshotEveryTicks === 0) this.store.saveSnapshot(toSnapshot(this.world));
    else this.store.setTick(this.world.tick);
  }

  /** What changed since the last delta. */
  delta(): WorldDelta {
    return {
      owner: diff(this.sentOwner, this.world.owner),
      road: diff(this.sentRoad, this.world.road),
      ops: this.world.ops.map((op) => ({ id: op.id, cash: op.cash, attention: op.attention })),
      builds: this.world.builds.map((b) => ({ tile: b.tile, remaining: b.remaining })),
      surveys: this.world.surveys.map((s) => ({ tile: s.tile, op: s.op, remaining: s.remaining })),
      buildings: this.world.buildings.map((b) => ({
        kind: b.kind,
        tile: b.tile,
        op: b.op,
        remaining: b.remaining,
        staffed: b.staffed,
        ore: b.ore,
      })),
      vehicles: this.world.vehicles.map(copyVehicle),
    };
  }
}

function diff(sent: Uint8Array | Uint16Array, now: Uint8Array | Uint16Array): TileChange[] {
  const out: TileChange[] = [];
  for (let i = 0; i < now.length; i++) {
    if (sent[i] !== now[i]) {
      out.push([i, now[i]!]);
      sent[i] = now[i]!;
    }
  }
  return out;
}

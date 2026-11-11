// A scripted world and command log for determinism tests and the hash CLI
// (DESIGN.md 17). The log mixes valid roads, stakes and depots with commands
// the sim must reject.

import { TERRAIN, type LoggedCommand } from "@groundwork/protocol";
import { createWorld } from "./mapgen.ts";
import { createRng, nextInt } from "./rng.ts";
import { partyIndex, type World } from "./world.ts";

export const SCENARIO_SEED = 20261111;
export const SCENARIO_SIZE = 128;
export const SCENARIO_TICKS = 10_000;
export const SCENARIO_OPS = ["player", "rival"] as const;

export function scenarioWorld(seed: number = SCENARIO_SEED): World {
  return createWorld({ seed, width: SCENARIO_SIZE, height: SCENARIO_SIZE, ops: SCENARIO_OPS });
}

/** A command log derived only from the starting world, sorted by tick. */
/** The skip-th dry tile a party owns whose right neighbour it also owns, or -1. */
function firstOwnedPair(world: World, party: number, skip: number): number {
  const ok = (i: number) => world.owner[i] === party && world.terrain[i] !== TERRAIN.water;
  for (let i = 0; i + 1 < world.terrain.length; i++) {
    if ((i + 1) % world.width === 0 || !ok(i) || !ok(i + 1)) continue;
    if (skip-- === 0) return i;
  }
  return -1;
}

export function scenarioLog(world: World, ticks: number = SCENARIO_TICKS): LoggedCommand[] {
  const rng = createRng(world.seed ^ 0x5eed);
  const log: LoggedCommand[] = [];
  let water = -1;
  for (let i = 0; i < world.terrain.length && water < 0; i++) if (world.terrain[i] === TERRAIN.water) water = i;
  for (let k = 0; k < world.ops.length; k++) {
    const op = world.ops[k]!.id;
    const party = partyIndex(world, "op", op);
    for (let i = 0; i < world.owner.length; i++) {
      if (world.owner[i] !== party) continue;
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x, y } });
      // Every tile also gets a second attempt, rejected if the first one landed.
      log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x, y } });
      // The other op tries the same parcel and is refused.
      const other = world.ops[(k + 1) % world.ops.length]!.id;
      log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op: other, x, y } });
      // Some tiles get a depot. It lands only if the tile is still free of a
      // road and one is laid beside it first, so many are refused.
      if (nextInt(rng, 6) === 0) {
        log.push({ tick: nextInt(rng, ticks), command: { type: "place_building", op, kind: "depot", x, y } });
      }
    }
    // Early on, a road and a depot beside it, so depots are built, staffed
    // and pay wages over the run.
    for (let n = 0; n < 3; n++) {
      const t = nextInt(rng, ticks / 4);
      const at = firstOwnedPair(world, party, n * 7);
      if (at < 0) break;
      const x = at % world.width;
      const y = Math.floor(at / world.width);
      log.push({ tick: t, command: { type: "place_road", op, x: x + 1, y } });
      log.push({ tick: t, command: { type: "place_building", op, kind: "depot", x, y } });
    }
    log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x: -1, y: 0 } });
    log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x: world.width, y: 3 } });
    // Town land is not the Op's, so a road there is refused.
    const market = world.town.market;
    log.push({
      tick: nextInt(rng, ticks),
      command: { type: "place_road", op, x: market % world.width, y: Math.floor(market / world.width) },
    });
    // Stakes and roads on random tiles: frontier is accepted, the rest refused,
    // and both Ops sometimes reach for the same tile.
    for (let n = 0; n < 40; n++) {
      const x = nextInt(rng, world.width);
      const y = nextInt(rng, world.height);
      log.push({ tick: nextInt(rng, ticks), command: { type: "stake_claim", op, x, y } });
      const other = world.ops[(k + 1) % world.ops.length]!.id;
      log.push({ tick: nextInt(rng, ticks), command: { type: "stake_claim", op: other, x, y } });
      log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x, y } });
    }
    if (water >= 0) {
      const x = water % world.width;
      const y = Math.floor(water / world.width);
      log.push({ tick: nextInt(rng, ticks), command: { type: "place_road", op, x, y } });
    }
  }
  // Stable sort keeps generation order within a tick.
  return log
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => a.entry.tick - b.entry.tick || a.order - b.order)
    .map(({ entry }) => entry);
}

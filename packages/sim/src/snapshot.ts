// World <-> plain data, for SQLite snapshots and the initial state sent to a
// client (DESIGN.md 11.2). Pure: no I/O here, the server does the storing.

import type { WorldSnapshot } from "@groundwork/protocol";
import type { World } from "./world.ts";

export function toSnapshot(world: World): WorldSnapshot {
  return {
    seed: world.seed,
    width: world.width,
    height: world.height,
    tick: world.tick,
    rngState: world.rng.state,
    terrain: Array.from(world.terrain),
    richness: Array.from(world.richness),
    owner: Array.from(world.owner),
    road: Array.from(world.road),
    ops: world.ops.map((op) => ({ id: op.id, cash: op.cash })),
    builds: world.builds.map((b) => ({ tile: b.tile, remaining: b.remaining })),
  };
}

export function fromSnapshot(s: WorldSnapshot): World {
  const tiles = s.width * s.height;
  for (const [name, arr] of [
    ["terrain", s.terrain],
    ["richness", s.richness],
    ["owner", s.owner],
    ["road", s.road],
  ] as const) {
    if (arr.length !== tiles) throw new Error(`snapshot ${name} has ${arr.length} tiles, expected ${tiles}`);
  }
  return {
    seed: s.seed,
    width: s.width,
    height: s.height,
    tick: s.tick,
    rng: { state: s.rngState },
    terrain: Uint8Array.from(s.terrain),
    richness: Uint8Array.from(s.richness),
    owner: Uint16Array.from(s.owner),
    road: Uint8Array.from(s.road),
    ops: s.ops.map((op) => ({ id: op.id, cash: op.cash })),
    builds: s.builds.map((b) => ({ tile: b.tile, remaining: b.remaining })),
  };
}

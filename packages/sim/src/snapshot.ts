// World <-> plain data, for SQLite snapshots and the initial state sent to a
// client (DESIGN.md 11.2). Pure: no I/O here, the server does the storing.

import type { PersonState, WorldSnapshot } from "@groundwork/protocol";
import { ATTENTION_PER_DAY } from "./attention.ts";
import { WORLD_FORMAT, type Person, type World } from "./world.ts";

function copyPerson(p: PersonState): Person {
  return { id: p.id, name: p.name, job: p.job, home: p.home, traits: [...p.traits], asking: p.asking };
}

export function toSnapshot(world: World): WorldSnapshot {
  return {
    format: WORLD_FORMAT,
    seed: world.seed,
    width: world.width,
    height: world.height,
    tick: world.tick,
    rngState: world.rng.state,
    terrain: Array.from(world.terrain),
    richness: Array.from(world.richness),
    owner: Array.from(world.owner),
    road: Array.from(world.road),
    ops: world.ops.map((op) => ({ id: op.id, cash: op.cash, attention: op.attention })),
    builds: world.builds.map((b) => ({ tile: b.tile, remaining: b.remaining })),
    parties: world.parties.map((p) => ({ kind: p.kind, id: p.id })),
    town: { id: world.town.id, name: world.town.name, market: world.town.market },
    people: world.people.map(copyPerson),
  };
}

export function fromSnapshot(s: WorldSnapshot): World {
  if (s.format !== WORLD_FORMAT) throw new Error(`snapshot is world format ${s.format ?? 1}, expected ${WORLD_FORMAT}`);
  const tiles = s.width * s.height;
  for (const [name, arr] of [
    ["terrain", s.terrain],
    ["richness", s.richness],
    ["owner", s.owner],
    ["road", s.road],
  ] as const) {
    if (arr.length !== tiles) throw new Error(`snapshot ${name} has ${arr.length} tiles, expected ${tiles}`);
  }
  for (const owner of s.owner) {
    if (!Number.isInteger(owner) || owner < 0 || owner >= s.parties.length) {
      throw new Error(`snapshot owner ${owner} is not one of ${s.parties.length} parties`);
    }
  }
  for (const person of s.people) {
    if (!s.parties.some((p) => p.kind === "person" && p.id === person.id)) {
      throw new Error(`snapshot person ${person.id} is not a party`);
    }
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
    // Format 3 saves from before attention existed load with a full day's budget.
    ops: s.ops.map((op) => ({ id: op.id, cash: op.cash, attention: op.attention ?? ATTENTION_PER_DAY })),
    builds: s.builds.map((b) => ({ tile: b.tile, remaining: b.remaining })),
    parties: s.parties.map((p) => ({ kind: p.kind, id: p.id })),
    town: { id: s.town.id, name: s.town.name, market: s.town.market },
    people: s.people.map(copyPerson),
  };
}

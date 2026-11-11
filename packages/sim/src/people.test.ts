// Named people (DESIGN.md 7.1, 4.3, 5.3, D-014): six per town, each an owner
// party with a home on town land, a job, traits from the fixed list and an
// asking-price factor. Three own land outside the town, one near a deposit.

import { TERRAIN } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { hashWorld } from "./hash.ts";
import { createWorld, TOWN_ID } from "./mapgen.ts";
import {
  ASKING_MAX,
  ASKING_MIN,
  DEPOSIT_REACH,
  LANDOWNERS,
  PEOPLE_PER_TOWN,
  PERSONALITY_TRAITS,
} from "./people.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";
import { partyIndex, ROAD_NONE, type World } from "./world.ts";

const SEEDS = [1, 2, 3, 7, 1234, 99999, 424242, 20261111];
const make = (seed: number, size = 128): World =>
  createWorld({ seed, width: size, height: size, ops: ["player", "rival"] });

function tilesOf(world: World, owner: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < world.owner.length; i++) if (world.owner[i] === owner) out.push(i);
  return out;
}

function nearDeposit(world: World, tiles: readonly number[], reach: number): boolean {
  const w = world.width;
  for (let d = 0; d < world.terrain.length; d++) {
    if (world.terrain[d] !== TERRAIN.deposit) continue;
    for (const i of tiles) {
      if (Math.abs((i % w) - (d % w)) + Math.abs(Math.floor(i / w) - Math.floor(d / w)) <= reach) return true;
    }
  }
  return false;
}

describe("named people", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: six named people, each an owner party with a job, a town home, traits and an asking factor`, () => {
      const world = make(seed);
      expect(world.people).toHaveLength(PEOPLE_PER_TOWN);
      const townParty = partyIndex(world, "town", TOWN_ID);
      const homes = new Set<number>();
      for (const person of world.people) {
        expect(person.name).toMatch(/^\S+ \S+$/);
        expect(person.job.length).toBeGreaterThan(0);
        expect(world.owner[person.home], `${person.name}'s home`).toBe(townParty);
        expect(world.road[person.home]).toBe(ROAD_NONE);
        expect(person.home).not.toBe(world.town.market);
        homes.add(person.home);
        expect(person.traits.length).toBeGreaterThan(0);
        expect(new Set(person.traits).size).toBe(person.traits.length);
        for (const trait of person.traits) expect(PERSONALITY_TRAITS).toContain(trait);
        expect(Number.isInteger(person.asking)).toBe(true);
        expect(person.asking).toBeGreaterThanOrEqual(ASKING_MIN);
        expect(person.asking).toBeLessThanOrEqual(ASKING_MAX);
        const party = partyIndex(world, "person", person.id);
        expect(party, `${person.name} is a party`).toBeGreaterThan(0);
        // People come after the town in the party list (D-013).
        expect(party).toBeGreaterThan(townParty);
      }
      expect(homes.size).toBe(PEOPLE_PER_TOWN);
      expect(new Set(world.people.map((p) => p.name)).size).toBe(PEOPLE_PER_TOWN);
      expect(world.parties.filter((p) => p.kind === "person")).toHaveLength(PEOPLE_PER_TOWN);
    });

    it(`seed ${seed}: three landowners hold at least 24 tiles outside the town, one within ${DEPOSIT_REACH} tiles of a deposit`, () => {
      const world = make(seed);
      const townParty = partyIndex(world, "town", TOWN_ID);
      const landowners = world.people
        .map((p) => tilesOf(world, partyIndex(world, "person", p.id)))
        .filter((tiles) => tiles.length > 0);
      expect(landowners.length).toBeGreaterThanOrEqual(LANDOWNERS);
      const all = landowners.flat();
      expect(all.length).toBeGreaterThanOrEqual(24);
      for (const i of all) {
        expect(world.owner[i]).not.toBe(townParty);
        expect(world.terrain[i]).not.toBe(TERRAIN.water);
      }
      expect(landowners.some((tiles) => nearDeposit(world, tiles, DEPOSIT_REACH))).toBe(true);
    });
  }

  it("fits six people and three parcels on the 64x64 test map", () => {
    const world = make(1, 64);
    expect(world.people).toHaveLength(PEOPLE_PER_TOWN);
    const owned = world.people.filter((p) => tilesOf(world, partyIndex(world, "person", p.id)).length > 0);
    expect(owned.length).toBeGreaterThanOrEqual(LANDOWNERS);
  });

  it("gives the same people for the same seed and different names for different seeds", () => {
    expect(make(1234).people).toEqual(make(1234).people);
    expect(hashWorld(make(1234))).toBe(hashWorld(make(1234)));
    const names = (seed: number): string[] => make(seed).people.map((p) => p.name);
    expect(names(1234)).not.toEqual(names(1235));
    expect(names(1)).not.toEqual(names(2));
  });

  it("carries people in the snapshot, through JSON, and back to the same hash", () => {
    const world = make(20261111);
    const s = JSON.parse(JSON.stringify(toSnapshot(world)));
    expect(s.people).toEqual(world.people);
    const back = fromSnapshot(s);
    expect(back.people).toEqual(world.people);
    expect(hashWorld(back)).toBe(hashWorld(world));
  });

  it("changes the state hash when one person's parcel or profile changes", () => {
    const world = make(1234);
    const before = hashWorld(world);
    const party = partyIndex(world, "person", world.people[0]!.id);
    const tile = tilesOf(world, party)[0]!;
    world.owner[tile] = 0;
    expect(hashWorld(world)).not.toBe(before);
    world.owner[tile] = party;
    expect(hashWorld(world)).toBe(before);

    const s = toSnapshot(world);
    const pricier = fromSnapshot({ ...s, people: s.people.map((p, k) => (k === 0 ? { ...p, asking: p.asking + 1 } : p)) });
    expect(hashWorld(pricier)).not.toBe(before);
  });

  it("refuses a snapshot whose person is not a party", () => {
    const s = toSnapshot(make(1234));
    const stranger = { ...s.people[0]!, id: "nobody" };
    expect(() => fromSnapshot({ ...s, people: [...s.people, stranger] })).toThrow(/not a party/);
  });
});

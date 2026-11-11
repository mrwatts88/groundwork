// Named people (DESIGN.md 7.1, 4.3, 5.3, D-014). Six per town, each with a
// name, a job, a home on town land, a personality and an asking-price factor.
// The first three own land outside the town: one parcel within reach of a
// deposit, two near the town. Everything comes from the world RNG.

import { TERRAIN } from "@groundwork/protocol";
import { nextInt } from "./rng.ts";
import { NO_OWNER, ROAD_NONE, type Person, type World } from "./world.ts";

/** Named people per town in Ring 1 (DESIGN.md 7.1). */
export const PEOPLE_PER_TOWN = 6;
/** How many of them start with land outside the town. */
export const LANDOWNERS = 3;
/** A landowner's parcel is a square this many tiles on a side. */
export const PARCEL_SIZE = 4;
/** The first landowner's parcel has a tile within this many tiles (Manhattan) of a deposit. */
export const DEPOSIT_REACH = 10;
/** The other parcels start within this many tiles of the town block. */
const NEAR_TOWN = 14;
/** Parcels keep this many tiles clear of the town, like the Op claims. */
const PARCEL_CLEARANCE = 3;
/** Traits per person. */
const TRAITS_EACH = 2;
/** The asking-price factor is a percent in this range. */
export const ASKING_MIN = 80;
export const ASKING_MAX = 180;

/** The fixed personality trait list. A Mind reads these as its profile. */
export const PERSONALITY_TRAITS = [
  "cautious",
  "greedy",
  "friendly",
  "proud",
  "stubborn",
  "generous",
  "shrewd",
  "sentimental",
  "ambitious",
  "suspicious",
  "chatty",
  "loyal",
] as const;

const JOBS = [
  "farmer",
  "rancher",
  "shopkeeper",
  "mechanic",
  "teacher",
  "nurse",
  "surveyor",
  "baker",
  "carpenter",
  "clerk",
  "well driller",
  "radio operator",
] as const;

const FIRST_NAMES = [
  "Ada", "Bram", "Cora", "Dell", "Edie", "Finn", "Greta", "Hal",
  "Iris", "Jonah", "Kit", "Lena", "Moss", "Nora", "Otto", "Pearl",
  "Quinn", "Rosa", "Silas", "Tess", "Ulla", "Vic", "Wren", "Yusuf",
] as const;

const LAST_NAMES = [
  "Abbott", "Brennan", "Castillo", "Dunmore", "Ellery", "Fairweather", "Garza", "Holloway",
  "Ibarra", "Jansen", "Kowalski", "Lindqvist", "Marsh", "Novak", "Okafor", "Pryce",
  "Quill", "Ruiz", "Sato", "Thorne", "Underhill", "Vance", "Whitlock", "Yates",
] as const;

/** Draw k distinct entries from a list. */
function drawDistinct<T>(world: World, list: readonly T[], k: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  for (let n = 0; n < k; n++) out.push(pool.splice(nextInt(world.rng, pool.length), 1)[0]!);
  return out;
}

/** A parcel fits: on the map, dry, unowned and clear of the town. */
function parcelFree(world: World, townParty: number, x0: number, y0: number): boolean {
  const { width, height } = world;
  if (x0 < 0 || y0 < 0 || x0 + PARCEL_SIZE > width || y0 + PARCEL_SIZE > height) return false;
  for (let y = y0; y < y0 + PARCEL_SIZE; y++) {
    for (let x = x0; x < x0 + PARCEL_SIZE; x++) {
      const i = y * width + x;
      if (world.terrain[i] === TERRAIN.water || world.owner[i] !== NO_OWNER) return false;
    }
  }
  const c = PARCEL_CLEARANCE;
  for (let y = Math.max(0, y0 - c); y < Math.min(height, y0 + PARCEL_SIZE + c); y++) {
    for (let x = Math.max(0, x0 - c); x < Math.min(width, x0 + PARCEL_SIZE + c); x++) {
      if (world.owner[y * width + x] === townParty) return false;
    }
  }
  return true;
}

/** Manhattan distance from a tile to the nearest tile of a parcel. */
function parcelDistance(x0: number, y0: number, x: number, y: number): number {
  const dx = x < x0 ? x0 - x : x > x0 + PARCEL_SIZE - 1 ? x - (x0 + PARCEL_SIZE - 1) : 0;
  const dy = y < y0 ? y0 - y : y > y0 + PARCEL_SIZE - 1 ? y - (y0 + PARCEL_SIZE - 1) : 0;
  return dx + dy;
}

function grant(world: World, party: number, x0: number, y0: number): void {
  for (let y = y0; y < y0 + PARCEL_SIZE; y++) {
    for (let x = x0; x < x0 + PARCEL_SIZE; x++) world.owner[y * world.width + x] = party;
  }
}

/** Try random spots in [xa, xb] x [ya, yb] for a parcel. Returns the top-left tile or -1. */
function findParcel(
  world: World,
  townParty: number,
  xa: number,
  xb: number,
  ya: number,
  yb: number,
  tries: number,
  ok: (x0: number, y0: number) => boolean = () => true,
): number {
  const xs = Math.max(0, xa);
  const ys = Math.max(0, ya);
  const xspan = Math.min(world.width - PARCEL_SIZE, xb) - xs + 1;
  const yspan = Math.min(world.height - PARCEL_SIZE, yb) - ys + 1;
  if (xspan <= 0 || yspan <= 0) return -1;
  for (let n = 0; n < tries; n++) {
    const x0 = xs + nextInt(world.rng, xspan);
    const y0 = ys + nextInt(world.rng, yspan);
    if (parcelFree(world, townParty, x0, y0) && ok(x0, y0)) return y0 * world.width + x0;
  }
  return -1;
}

/** A parcel with a tile within DEPOSIT_REACH of a deposit, trying deposits nearest the town first. */
function parcelNearDeposit(world: World, townParty: number, cx: number, cy: number): number {
  const deposits: number[] = [];
  for (let i = 0; i < world.terrain.length; i++) if (world.terrain[i] === TERRAIN.deposit) deposits.push(i);
  const w = world.width;
  const dist = (i: number): number => Math.abs((i % w) - cx) + Math.abs(Math.floor(i / w) - cy);
  deposits.sort((a, b) => dist(a) - dist(b) || a - b);
  for (const d of deposits) {
    const dx = d % w;
    const dy = Math.floor(d / w);
    const r = DEPOSIT_REACH;
    const found = findParcel(world, townParty, dx - r - PARCEL_SIZE + 1, dx + r, dy - r - PARCEL_SIZE + 1, dy + r, 40,
      (x0, y0) => parcelDistance(x0, y0, dx, dy) <= r);
    if (found >= 0) return found;
  }
  return -1;
}

/**
 * Create the town's named people, add them to the parties and give the first
 * LANDOWNERS of them their parcels. Runs after the town and the Op claims.
 */
export function placePeople(world: World): void {
  const { width } = world;
  const townParty = world.parties.findIndex((p) => p.kind === "town" && p.id === world.town.id);
  const townTiles: number[] = [];
  for (let i = 0; i < world.owner.length; i++) if (world.owner[i] === townParty) townTiles.push(i);
  const homeSpots = townTiles.filter((i) => world.road[i] === ROAD_NONE && i !== world.town.market);
  if (homeSpots.length < PEOPLE_PER_TOWN) throw new Error("no room for homes in the town");

  const firsts = drawDistinct(world, FIRST_NAMES, PEOPLE_PER_TOWN);
  const lasts = drawDistinct(world, LAST_NAMES, PEOPLE_PER_TOWN);
  const jobs = drawDistinct(world, JOBS, PEOPLE_PER_TOWN);
  const homes = drawDistinct(world, homeSpots, PEOPLE_PER_TOWN);
  for (let k = 0; k < PEOPLE_PER_TOWN; k++) {
    const person: Person = {
      id: `${world.town.id}-${k + 1}`,
      name: `${firsts[k]} ${lasts[k]}`,
      job: jobs[k]!,
      home: homes[k]!,
      traits: drawDistinct(world, PERSONALITY_TRAITS, TRAITS_EACH),
      asking: ASKING_MIN + nextInt(world.rng, ASKING_MAX - ASKING_MIN + 1),
    };
    world.people.push(person);
    world.parties.push({ kind: "person", id: person.id });
  }

  const txs = townTiles.map((i) => i % width);
  const tys = townTiles.map((i) => Math.floor(i / width));
  const tx0 = Math.min(...txs);
  const tx1 = Math.max(...txs);
  const ty0 = Math.min(...tys);
  const ty1 = Math.max(...tys);
  const cx = Math.floor((tx0 + tx1) / 2);
  const cy = Math.floor((ty0 + ty1) / 2);
  for (let k = 0; k < LANDOWNERS; k++) {
    const party = world.parties.findIndex((p) => p.kind === "person" && p.id === world.people[k]!.id);
    let at =
      k === 0
        ? parcelNearDeposit(world, townParty, cx, cy)
        : findParcel(world, townParty, tx0 - NEAR_TOWN, tx1 + NEAR_TOWN, ty0 - NEAR_TOWN, ty1 + NEAR_TOWN, 2_000);
    if (at < 0) at = findParcel(world, townParty, 0, world.width, 0, world.height, 10_000);
    if (at < 0) throw new Error(`no room for ${world.people[k]!.name}'s land`);
    grant(world, party, at % width, Math.floor(at / width));
  }
}

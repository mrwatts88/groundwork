// Seeded map generation (DESIGN.md 4.2, 4.3). Integer value noise for
// elevation and moisture, then deposits scattered in the frontier, richer
// farther out, then one town on good land near water, then a starting claim
// for each Op. Integer math only, so every platform agrees.

import { TERRAIN, type OpId, type Party } from "@groundwork/protocol";
import { createRng, nextInt, type Rng } from "./rng.ts";
import { NO_OWNER, ROAD_BUILT, type Op, type World } from "./world.ts";

export interface WorldOptions {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly ops: readonly OpId[];
}

export const STARTING_CASH = 10_000;
export const CLAIM_SIZE = 6;
/** The town starts as a square block this many tiles on a side. */
export const TOWN_SIZE = 7;
/** Every town tile has water within this many tiles (Chebyshev distance). */
export const TOWN_WATER_RANGE = 6;
/** Starting claims keep this many tiles clear of the town, so it has room to grow. */
export const TOWN_CLEARANCE = 3;
export const TOWN_ID = "town";

const TOWN_NAMES = [
  "Harlow",
  "Millbrook",
  "Redwater",
  "Fenmore",
  "Larkspur",
  "Copper Bend",
  "Ashby",
  "Kestrel Ford",
] as const;

/** One octave of value noise in 0..255: a random lattice, bilinear blend. */
function octave(rng: Rng, width: number, height: number, cell: number, out: Uint32Array, weight: number): void {
  const gw = Math.floor(width / cell) + 2;
  const gh = Math.floor(height / cell) + 2;
  const lattice = new Uint8Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = nextInt(rng, 256);
  const area = cell * cell;
  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / cell);
    const fy = y - gy * cell;
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(x / cell);
      const fx = x - gx * cell;
      const v00 = lattice[gy * gw + gx]!;
      const v10 = lattice[gy * gw + gx + 1]!;
      const v01 = lattice[(gy + 1) * gw + gx]!;
      const v11 = lattice[(gy + 1) * gw + gx + 1]!;
      const v =
        v00 * (cell - fx) * (cell - fy) + v10 * fx * (cell - fy) + v01 * (cell - fx) * fy + v11 * fx * fy;
      const i = y * width + x;
      out[i] = out[i]! + Math.floor(v / area) * weight;
    }
  }
}

/** Fractal value noise in 0..255. */
function noise(rng: Rng, width: number, height: number): Uint8Array {
  const sum = new Uint32Array(width * height);
  octave(rng, width, height, 32, sum, 4);
  octave(rng, width, height, 16, sum, 2);
  octave(rng, width, height, 8, sum, 1);
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(sum[i]! / 7);
  return out;
}

const WATER_BELOW = 105;
const HILLS_FROM = 150;
const ROCK_FROM = 172;
const FOREST_MOISTURE = 150;

function terrainFor(elevation: number, moisture: number): number {
  if (elevation < WATER_BELOW) return TERRAIN.water;
  if (elevation >= ROCK_FROM) return TERRAIN.rock;
  if (elevation >= HILLS_FROM) return TERRAIN.hills;
  return moisture >= FOREST_MOISTURE ? TERRAIN.forest : TERRAIN.flat;
}

function scatterDeposits(world: World): void {
  const { width, height, rng, terrain, richness } = world;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxDist = cx + cy;
  const attempts = Math.floor((width * height) / 128);
  for (let n = 0; n < attempts; n++) {
    const x = nextInt(rng, width);
    const y = nextInt(rng, height);
    const i = y * width + x;
    if (terrain[i] === TERRAIN.water) continue;
    const dist = Math.abs(x - cx) + Math.abs(y - cy);
    // Fewer deposits near the middle, where towns will go.
    if (nextInt(rng, maxDist) >= dist) continue;
    terrain[i] = TERRAIN.deposit;
    richness[i] = 40 + Math.floor((dist * 215) / maxDist);
  }
}

/** Prefix sums of water tiles, so "is there water near here" is O(1). */
function waterSums(world: World): Int32Array {
  const { width, height, terrain } = world;
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const water = terrain[y * width + x] === TERRAIN.water ? 1 : 0;
      sums[(y + 1) * (width + 1) + x + 1] =
        water + sums[y * (width + 1) + x + 1]! + sums[(y + 1) * (width + 1) + x]! - sums[y * (width + 1) + x]!;
    }
  }
  return sums;
}

function waterNear(world: World, sums: Int32Array, x: number, y: number, range: number): boolean {
  const w1 = world.width + 1;
  const x0 = Math.max(0, x - range);
  const y0 = Math.max(0, y - range);
  const x1 = Math.min(world.width, x + range + 1);
  const y1 = Math.min(world.height, y + range + 1);
  return sums[y1 * w1 + x1]! - sums[y0 * w1 + x1]! - sums[y1 * w1 + x0]! + sums[y0 * w1 + x0]! > 0;
}

/** Good town land: dry, not a deposit, and every tile near water. */
function townSiteOk(world: World, sums: Int32Array, x0: number, y0: number): boolean {
  for (let y = y0; y < y0 + TOWN_SIZE; y++) {
    for (let x = x0; x < x0 + TOWN_SIZE; x++) {
      const t = world.terrain[y * world.width + x];
      if (t === TERRAIN.water || t === TERRAIN.deposit) return false;
      if (!waterNear(world, sums, x, y, TOWN_WATER_RANGE)) return false;
    }
  }
  return true;
}

/**
 * Place the town on the good site nearest the middle of the map, give it the
 * block, lay its roads (a cross through the middle) and put the market beside
 * the crossing. Returns the market tile.
 */
function placeTown(world: World, townParty: number): number {
  const { width, height } = world;
  if (width < TOWN_SIZE || height < TOWN_SIZE) throw new Error(`no room for a town on ${width}x${height}`);
  const sums = waterSums(world);
  const half = Math.floor(TOWN_SIZE / 2);
  const mx = Math.floor(width / 2);
  const my = Math.floor(height / 2);
  let best = -1;
  let bestDist = Infinity;
  for (let y0 = 0; y0 + TOWN_SIZE <= height; y0++) {
    for (let x0 = 0; x0 + TOWN_SIZE <= width; x0++) {
      const dist = Math.abs(x0 + half - mx) + Math.abs(y0 + half - my);
      if (dist >= bestDist || !townSiteOk(world, sums, x0, y0)) continue;
      best = y0 * width + x0;
      bestDist = dist;
    }
  }
  if (best < 0) throw new Error("no site for a town: no dry block near water");
  const x0 = best % width;
  const y0 = Math.floor(best / width);
  for (let y = y0; y < y0 + TOWN_SIZE; y++) {
    for (let x = x0; x < x0 + TOWN_SIZE; x++) {
      const i = y * width + x;
      world.owner[i] = townParty;
      if (x === x0 + half || y === y0 + half) world.road[i] = ROAD_BUILT;
    }
  }
  return (y0 + half + 1) * width + x0 + half + 1;
}

function claimFree(world: World, x0: number, y0: number): boolean {
  for (let y = y0; y < y0 + CLAIM_SIZE; y++) {
    for (let x = x0; x < x0 + CLAIM_SIZE; x++) {
      const i = y * world.width + x;
      if (world.terrain[i] === TERRAIN.water || world.owner[i] !== NO_OWNER) return false;
    }
  }
  // Keep clear of the town.
  const townParty = world.parties.findIndex((p) => p.kind === "town");
  const c = TOWN_CLEARANCE;
  for (let y = Math.max(0, y0 - c); y < Math.min(world.height, y0 + CLAIM_SIZE + c); y++) {
    for (let x = Math.max(0, x0 - c); x < Math.min(world.width, x0 + CLAIM_SIZE + c); x++) {
      if (world.owner[y * world.width + x] === townParty) return false;
    }
  }
  return true;
}

/** Give each Op a square starting claim of dry land, chosen by the RNG. */
function placeClaims(world: World): void {
  for (let k = 0; k < world.ops.length; k++) {
    const party = world.parties.findIndex((p) => p.kind === "op" && p.id === world.ops[k]!.id);
    let placed = false;
    for (let attempt = 0; attempt < 10_000 && !placed; attempt++) {
      const x0 = nextInt(world.rng, world.width - CLAIM_SIZE + 1);
      const y0 = nextInt(world.rng, world.height - CLAIM_SIZE + 1);
      if (!claimFree(world, x0, y0)) continue;
      for (let y = y0; y < y0 + CLAIM_SIZE; y++) {
        for (let x = x0; x < x0 + CLAIM_SIZE; x++) world.owner[y * world.width + x] = party;
      }
      placed = true;
    }
    if (!placed) throw new Error(`no room for a starting claim for ${world.ops[k]!.id}`);
  }
}

export function createWorld(options: WorldOptions): World {
  const { seed, width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < CLAIM_SIZE || height < CLAIM_SIZE) {
    throw new Error(`bad map size ${width}x${height}`);
  }
  if (new Set(options.ops).size !== options.ops.length) throw new Error("duplicate op ids");
  const rng = createRng(seed);
  const elevation = noise(rng, width, height);
  const moisture = noise(rng, width, height);
  const terrain = new Uint8Array(width * height);
  for (let i = 0; i < terrain.length; i++) terrain[i] = terrainFor(elevation[i]!, moisture[i]!);
  const ops: Op[] = options.ops.map((id) => ({ id, cash: STARTING_CASH }));
  const parties: Party[] = [
    { kind: "frontier", id: "frontier" },
    ...ops.map((op): Party => ({ kind: "op", id: op.id })),
    { kind: "town", id: TOWN_ID },
  ];
  const townName = TOWN_NAMES[nextInt(rng, TOWN_NAMES.length)]!;
  const world: World = {
    seed: seed >>> 0,
    width,
    height,
    tick: 0,
    rng,
    terrain,
    richness: new Uint8Array(width * height),
    owner: new Uint16Array(width * height),
    road: new Uint8Array(width * height),
    ops,
    builds: [],
    parties,
    // The market tile is set once the town is placed.
    town: { id: TOWN_ID, name: townName, market: -1 },
  };
  scatterDeposits(world);
  const market = placeTown(world, parties.length - 1);
  const placed: World = { ...world, town: { ...world.town, market } };
  placeClaims(placed);
  return placed;
}

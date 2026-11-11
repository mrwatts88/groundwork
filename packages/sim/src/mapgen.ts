// Seeded map generation (DESIGN.md 4.2). Integer value noise for elevation and
// moisture, then deposits scattered in the frontier, richer farther out, then a
// starting claim for each Op. Integer math only, so every platform agrees.

import { TERRAIN, type OpId } from "@groundwork/protocol";
import { createRng, nextInt, type Rng } from "./rng.ts";
import { NO_OWNER, type Op, type World } from "./world.ts";

export interface WorldOptions {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly ops: readonly OpId[];
}

export const STARTING_CASH = 10_000;
export const CLAIM_SIZE = 6;

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

function claimFree(world: World, x0: number, y0: number): boolean {
  for (let y = y0; y < y0 + CLAIM_SIZE; y++) {
    for (let x = x0; x < x0 + CLAIM_SIZE; x++) {
      const i = y * world.width + x;
      if (world.terrain[i] === TERRAIN.water || world.owner[i] !== NO_OWNER) return false;
    }
  }
  return true;
}

/** Give each Op a square starting claim of dry land, chosen by the RNG. */
function placeClaims(world: World): void {
  for (let k = 0; k < world.ops.length; k++) {
    let placed = false;
    for (let attempt = 0; attempt < 10_000 && !placed; attempt++) {
      const x0 = nextInt(world.rng, world.width - CLAIM_SIZE + 1);
      const y0 = nextInt(world.rng, world.height - CLAIM_SIZE + 1);
      if (!claimFree(world, x0, y0)) continue;
      for (let y = y0; y < y0 + CLAIM_SIZE; y++) {
        for (let x = x0; x < x0 + CLAIM_SIZE; x++) world.owner[y * world.width + x] = k + 1;
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
  };
  scatterDeposits(world);
  placeClaims(world);
  return world;
}

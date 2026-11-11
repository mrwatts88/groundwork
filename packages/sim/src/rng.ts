// The one source of randomness in the sim (DESIGN.md 12.3).
// Mulberry32: a 32-bit state, integer math only. The state lives in the world,
// so it is part of the state hash and a replay reproduces every draw.

export interface Rng {
  state: number;
}

/** Spread a user seed so nearby seeds start far apart. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
  s = (s ^ (s >>> 16)) >>> 0;
  return { state: s };
}

/** Next unsigned 32-bit integer. */
export function nextU32(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [0, n). n must be a positive integer below 2^21. */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor((nextU32(rng) * n) / 4294967296);
}

// State hash (DESIGN.md 12.3, 17). Two FNV-1a 32-bit lanes over a fixed field
// order, printed as 16 hex digits. Every field of World goes in, so any
// divergence shows.

import type { World } from "./world.ts";

class Hasher {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9;

  byte(v: number): void {
    this.a = Math.imul(this.a ^ (v & 0xff), 0x01000193);
    this.b = Math.imul(this.b ^ (v & 0xff), 0x01000193) ^ (this.b >>> 15);
  }

  u32(v: number): void {
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  /** Signed integer that fits in 53 bits: two 32-bit halves. */
  int(v: number): void {
    this.u32(v >>> 0);
    this.u32(Math.floor(v / 4294967296) >>> 0);
  }

  str(s: string): void {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
  }

  bytes(arr: Uint8Array | Uint16Array): void {
    this.u32(arr.length);
    for (let i = 0; i < arr.length; i++) this.u32(arr[i]!);
  }

  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, "0") + (this.b >>> 0).toString(16).padStart(8, "0");
  }
}

export function hashWorld(world: World): string {
  const h = new Hasher();
  h.u32(world.seed);
  h.u32(world.width);
  h.u32(world.height);
  h.int(world.tick);
  h.u32(world.rng.state);
  h.bytes(world.terrain);
  h.bytes(world.richness);
  h.bytes(world.owner);
  h.bytes(world.road);
  h.u32(world.ops.length);
  for (const op of world.ops) {
    h.str(op.id);
    h.int(op.cash);
  }
  h.u32(world.builds.length);
  for (const build of world.builds) {
    h.u32(build.tile);
    h.int(build.remaining);
  }
  return h.hex();
}

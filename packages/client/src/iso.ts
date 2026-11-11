// Isometric 2:1 projection (DESIGN.md 15): a tile is a 64 x 32 px diamond.
// World pixels have tile (0, 0) with its top corner at the origin. The camera
// maps world pixels to screen pixels with a scale and an offset.

export const TILE_W = 64;
export const TILE_H = 32;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The top corner of a tile's diamond, in world pixels. */
export function tileTop(tx: number, ty: number): Point {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

/** The centre of a tile's diamond, in world pixels. */
export function tileCenter(tx: number, ty: number): Point {
  const t = tileTop(tx, ty);
  return { x: t.x, y: t.y + HALF_H };
}

/** The tile under a world pixel. May be off the map. */
export function worldToTile(px: number, py: number): Point {
  const u = px / HALF_W;
  const v = py / HALF_H;
  return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) };
}

/** The four corners of a tile's diamond, as a flat list for a polygon. */
export function diamond(tx: number, ty: number): number[] {
  const t = tileTop(tx, ty);
  return [t.x, t.y, t.x + HALF_W, t.y + HALF_H, t.x, t.y + TILE_H, t.x - HALF_W, t.y + HALF_H];
}

export const MIN_SCALE = 0.125;
export const MAX_SCALE = 3;

export class Camera {
  /** Screen pixels per world pixel. */
  scale = 1;
  /** Screen position of the world origin. */
  x = 0;
  y = 0;

  toScreen(p: Point): Point {
    return { x: p.x * this.scale + this.x, y: p.y * this.scale + this.y };
  }

  toWorld(p: Point): Point {
    return { x: (p.x - this.x) / this.scale, y: (p.y - this.y) / this.scale };
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Zoom by a factor, keeping the world point under the screen point still. */
  zoomAt(screen: Point, factor: number): void {
    const before = this.toWorld(screen);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    this.x = screen.x - before.x * this.scale;
    this.y = screen.y - before.y * this.scale;
  }

  /** Put a world point at the centre of a screen of this size. */
  centerOn(world: Point, screenW: number, screenH: number, scale = this.scale): void {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    this.x = screenW / 2 - world.x * this.scale;
    this.y = screenH / 2 - world.y * this.scale;
  }
}

// PixiJS isometric renderer (DESIGN.md 15). Placeholder art is flat-shaded
// shapes drawn in code. The map is drawn in square chunks of tiles, each one
// Graphics, so a change redraws one chunk, and chunks off screen are culled.

import { Container, Graphics } from "pixi.js";
import { TERRAIN } from "@groundwork/protocol";
import { Camera, diamond, TILE_H, TILE_W, tileTop, worldToTile } from "./iso.ts";
import { ROAD_BUILDING, ROAD_BUILT, ROAD_NONE, type ClientWorld } from "./state.ts";

export const CHUNK = 16;

/** Base colour per terrain. Every terrain reads differently at a glance. */
export const TERRAIN_COLOR: Readonly<Record<number, number>> = {
  [TERRAIN.flat]: 0x8fbf5a,
  [TERRAIN.hills]: 0xb5a36a,
  [TERRAIN.water]: 0x3f7fc4,
  [TERRAIN.forest]: 0x3f7a3a,
  [TERRAIN.rock]: 0x8c8c8c,
  [TERRAIN.deposit]: 0xc9772e,
};

const PLAYER_BORDER = 0xffd23f;
const RIVAL_BORDER = 0xe0533d;
const TOWN_BORDER = 0xf4f1e8;
/** Land a named person owns. */
const PERSON_BORDER = 0x6fc3df;
const ROAD_BUILT_COLOR = 0x4a4038;
const ROAD_BUILDING_COLOR = 0xd9c39a;

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

/** A small deterministic per-tile variation, so flat ground is not one flat colour. */
function jitter(x: number, y: number): number {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return 0.94 + (h % 13) / 100;
}

export class MapRenderer {
  readonly root = new Container();
  private readonly chunks: Graphics[] = [];
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly hover = new Graphics();
  private readonly dirty = new Set<number>();

  constructor(private readonly world: ClientWorld) {
    this.chunksX = Math.ceil(world.width / CHUNK);
    this.chunksY = Math.ceil(world.height / CHUNK);
    // Draw back to front: chunks with a smaller cx + cy sit further back.
    const order: number[] = [];
    for (let cy = 0; cy < this.chunksY; cy++) for (let cx = 0; cx < this.chunksX; cx++) order.push(cy * this.chunksX + cx);
    for (let c = 0; c < order.length; c++) this.chunks.push(new Graphics());
    order.sort((a, b) => (a % this.chunksX) + Math.floor(a / this.chunksX) - ((b % this.chunksX) + Math.floor(b / this.chunksX)));
    for (const c of order) this.root.addChild(this.chunks[c]!);
    for (let c = 0; c < this.chunks.length; c++) this.drawChunk(c);
    this.root.addChild(this.hover);
  }

  /** Mark tiles as changed. They are redrawn on the next frame. */
  invalidate(tiles: readonly number[]): void {
    for (const i of tiles) {
      const x = i % this.world.width;
      const y = Math.floor(i / this.world.width);
      // A tile's border depends on its neighbours, so neighbours' chunks redraw too.
      for (const [nx, ny] of [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (!this.world.inBounds(nx, ny)) continue;
        this.dirty.add(Math.floor(ny / CHUNK) * this.chunksX + Math.floor(nx / CHUNK));
      }
    }
  }

  /** Per frame: apply the camera, redraw changed chunks and cull the rest. */
  update(camera: Camera, screenW: number, screenH: number): void {
    for (const c of this.dirty) this.drawChunk(c);
    this.dirty.clear();
    this.root.position.set(camera.x, camera.y);
    this.root.scale.set(camera.scale);
    const tl = camera.toWorld({ x: 0, y: 0 });
    const br = camera.toWorld({ x: screenW, y: screenH });
    for (let c = 0; c < this.chunks.length; c++) {
      const b = this.chunkBounds(c);
      this.chunks[c]!.visible = b.maxX >= tl.x && b.minX <= br.x && b.maxY >= tl.y && b.minY <= br.y;
    }
  }

  /** Outline the tile under the pointer. ok picks the colour in road mode. */
  setHover(tile: { x: number; y: number } | undefined, mode: "inspect" | "road", ok: boolean): void {
    this.hover.clear();
    if (tile === undefined || !this.world.inBounds(tile.x, tile.y)) return;
    const color = mode === "road" ? (ok ? 0x6dff6d : 0xff5a5a) : 0xffffff;
    this.hover.poly(diamond(tile.x, tile.y), true).stroke({ width: 2, color, alpha: 0.95 });
  }

  tileAt(camera: Camera, screenX: number, screenY: number): { x: number; y: number } {
    const w = camera.toWorld({ x: screenX, y: screenY });
    return worldToTile(w.x, w.y);
  }

  private chunkBounds(c: number): { minX: number; maxX: number; minY: number; maxY: number } {
    const cx = c % this.chunksX;
    const cy = Math.floor(c / this.chunksX);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(this.world.width, x0 + CHUNK);
    const y1 = Math.min(this.world.height, y0 + CHUNK);
    // Corners of the chunk's diamond: top (x0,y0), right (x1,y0), bottom (x1,y1), left (x0,y1).
    const top = tileTop(x0, y0);
    const right = tileTop(x1, y0);
    const bottom = tileTop(x1, y1);
    const left = tileTop(x0, y1);
    // Trees and boulders poke up above their tile a little.
    return { minX: left.x - TILE_W, maxX: right.x + TILE_W, minY: top.y - TILE_H, maxY: bottom.y + TILE_H };
  }

  private drawChunk(c: number): void {
    const g = this.chunks[c]!;
    g.clear();
    const cx = c % this.chunksX;
    const cy = Math.floor(c / this.chunksX);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(this.world.width, x0 + CHUNK);
    const y1 = Math.min(this.world.height, y0 + CHUNK);
    // Back to front inside the chunk, so tall shapes overlap the right way.
    for (let s = x0 + y0; s <= x1 + y1 - 2; s++) {
      for (let y = y0; y < y1; y++) {
        const x = s - y;
        if (x < x0 || x >= x1) continue;
        this.drawTile(g, x, y);
      }
    }
  }

  private drawTile(g: Graphics, x: number, y: number): void {
    const w = this.world;
    const i = w.index(x, y);
    const terrain = w.terrain[i]!;
    const base = TERRAIN_COLOR[terrain] ?? 0xff00ff;
    const t = tileTop(x, y);
    const cxp = t.x;
    const cyp = t.y + TILE_H / 2;
    g.poly(diamond(x, y), true).fill(shade(base, jitter(x, y)));

    switch (terrain) {
      case TERRAIN.water:
        g.moveTo(cxp - 12, cyp - 2).lineTo(cxp - 4, cyp - 4).lineTo(cxp + 4, cyp - 2).stroke({ width: 1.5, color: 0x9cc8f0, alpha: 0.6 });
        break;
      case TERRAIN.hills:
        g.poly([cxp - 18, cyp + 6, cxp - 4, cyp - 8, cxp + 10, cyp + 6], true).fill(shade(base, 1.15));
        g.poly([cxp - 4, cyp - 8, cxp + 10, cyp + 6, cxp + 18, cyp + 6], true).fill(shade(base, 0.8));
        break;
      case TERRAIN.forest:
        for (const [ox, oy] of [[-10, 2], [8, 0], [0, 8]] as const) {
          g.rect(cxp + ox - 1, cyp + oy - 2, 2, 5).fill(0x5a3b1e);
          g.poly([cxp + ox - 7, cyp + oy, cxp + ox, cyp + oy - 18, cxp + ox + 7, cyp + oy], true).fill(0x2b5e2a);
        }
        break;
      case TERRAIN.rock:
        g.poly([cxp - 12, cyp + 6, cxp - 8, cyp - 6, cxp + 4, cyp - 10, cxp + 12, cyp + 4], true).fill(0xa7a7a7);
        g.poly([cxp + 4, cyp - 10, cxp + 12, cyp + 4, cxp - 12, cyp + 6], true).fill(0x6e6e6e);
        break;
      case TERRAIN.deposit:
        for (const [ox, oy] of [[-8, 0], [6, -3], [1, 6]] as const) {
          g.circle(cxp + ox, cyp + oy, 3.5).fill(0xffd27a);
        }
        break;
    }

    const road = w.road[i]!;
    if (road !== ROAD_NONE) {
      const inset = [cxp, t.y + 4, cxp + 24, cyp, cxp, t.y + TILE_H - 4, cxp - 24, cyp];
      if (road === ROAD_BUILT) {
        g.poly(inset, true).fill(ROAD_BUILT_COLOR);
        g.moveTo(cxp - 10, cyp).lineTo(cxp + 10, cyp).stroke({ width: 1.5, color: 0xe8d9a8, alpha: 0.8 });
      } else if (road === ROAD_BUILDING) {
        g.poly(inset, true).fill({ color: ROAD_BUILDING_COLOR, alpha: 0.9 });
        g.poly(inset, true).stroke({ width: 1.5, color: ROAD_BUILT_COLOR });
      }
    }

    const owner = w.owner[i]!;
    if (owner !== 0) {
      const kind = w.parties[owner]?.kind;
      const color =
        owner === w.playerOwner()
          ? PLAYER_BORDER
          : kind === "town"
            ? TOWN_BORDER
            : kind === "person"
              ? PERSON_BORDER
              : RIVAL_BORDER;
      const d = diamond(x, y);
      // Edges T-R, R-B, B-L, L-T border tiles (x, y-1), (x+1, y), (x, y+1), (x-1, y).
      const edges: readonly (readonly [number, number, number, number])[] = [
        [0, 1, x, y - 1],
        [1, 2, x + 1, y],
        [2, 3, x, y + 1],
        [3, 0, x - 1, y],
      ];
      for (const [a, b, nx, ny] of edges) {
        const same = w.inBounds(nx, ny) && w.owner[w.index(nx, ny)] === owner;
        if (same) continue;
        g.moveTo(d[a * 2]!, d[a * 2 + 1]!).lineTo(d[b * 2]!, d[b * 2 + 1]!).stroke({ width: 2.5, color });
      }
    }
  }
}

// PixiJS isometric renderer (DESIGN.md 15). Placeholder art is flat-shaded
// shapes drawn in code. The map is drawn in square chunks of tiles, each one
// Graphics, so a change redraws one chunk, and chunks off screen are culled.

import { Container, Graphics } from "pixi.js";
import { TERRAIN } from "@groundwork/protocol";
import { Camera, diamond, TILE_H, TILE_W, tileTop, worldToTile } from "./iso.ts";
import { ROAD_BUILDING, ROAD_BUILT, ROAD_NONE, type ClientWorld, type OwnerKind } from "./state.ts";

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
/** Ownership overlay fill per kind of owner. Frontier gets none. */
export const OVERLAY_COLOR: Readonly<Record<Exclude<OwnerKind, "frontier">, number>> = {
  you: 0xffd23f,
  rival: 0xe0533d,
  town: 0xf4f1e8,
  person: 0x3fa7e0,
};
const OVERLAY_ALPHA = 0.55;

/** Placeholder buildings (DESIGN.md 15): each type has its own silhouette and colours. */
const HOUSE_WALL = 0xe8d2a6;
const HOUSE_ROOF = 0xa8432f;
const MARKET_WALL = 0xd9d4c4;
const MARKET_AWNING = 0x2f8f83;
const MARKET_STRIPE = 0xf6f1e0;
const MARKET_FLAG = 0xf0b429;
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
  private readonly selection = new Graphics();
  private readonly dirty = new Set<number>();
  private overlay = false;

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
    this.root.addChild(this.selection);
    this.root.addChild(this.hover);
  }

  get overlayOn(): boolean {
    return this.overlay;
  }

  /** Turn the ownership overlay on or off. Every chunk redraws. */
  setOverlay(on: boolean): void {
    if (on === this.overlay) return;
    this.overlay = on;
    for (let c = 0; c < this.chunks.length; c++) this.dirty.add(c);
  }

  /** Outline the tile the inspector is showing. */
  setSelected(tile: { x: number; y: number } | undefined): void {
    this.selection.clear();
    if (tile === undefined || !this.world.inBounds(tile.x, tile.y)) return;
    this.selection.poly(diamond(tile.x, tile.y), true).stroke({ width: 3, color: 0x7df9ff, alpha: 0.95 });
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

    if (this.overlay) {
      const kind = w.ownerKind(i);
      if (kind !== "frontier") g.poly(diamond(x, y), true).fill({ color: OVERLAY_COLOR[kind], alpha: OVERLAY_ALPHA });
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

    if (i === w.town.market) drawMarket(g, cxp, cyp);
    else if (w.homeOf(i) !== undefined) drawHouse(g, cxp, cyp);
  }
}

/** The two visible walls of an isometric box standing on a tile centred at (cx, cy). */
function walls(g: Graphics, cx: number, cy: number, hw: number, hh: number, h: number, color: number): void {
  g.poly([cx - hw, cy, cx, cy + hh, cx, cy + hh - h, cx - hw, cy - h], true).fill(shade(color, 0.85));
  g.poly([cx, cy + hh, cx + hw, cy, cx + hw, cy - h, cx, cy + hh - h], true).fill(shade(color, 0.65));
}

/** A house: a small tall box with a pitched roof. */
function drawHouse(g: Graphics, cx: number, cy: number): void {
  const hw = 14;
  const hh = 7;
  const h = 14;
  const ridge = 12;
  walls(g, cx, cy, hw, hh, h, HOUSE_WALL);
  const top = cy - h;
  // Roof corners: left, top, right, bottom of the box's top face. The ridge runs from the
  // middle of the left-top edge to the middle of the right-bottom edge, raised.
  const L = [cx - hw, top] as const;
  const T = [cx, top - hh] as const;
  const R = [cx + hw, top] as const;
  const B = [cx, top + hh] as const;
  const p1 = [(L[0] + T[0]) / 2, (L[1] + T[1]) / 2 - ridge] as const;
  const p2 = [(R[0] + B[0]) / 2, (R[1] + B[1]) / 2 - ridge] as const;
  g.poly([T[0], T[1], R[0], R[1], p2[0], p2[1], p1[0], p1[1]], true).fill(shade(HOUSE_ROOF, 0.75));
  g.poly([R[0], R[1], B[0], B[1], p2[0], p2[1]], true).fill(shade(HOUSE_WALL, 0.65));
  g.poly([L[0], L[1], B[0], B[1], p2[0], p2[1], p1[0], p1[1]], true).fill(HOUSE_ROOF);
  // A door on the left wall.
  g.poly([cx - 8, cy + 3, cx - 4, cy + 5, cx - 4, cy - 3, cx - 8, cy - 5], true).fill(0x5a3b1e);
}

/** The market: a wide low hall with a striped awning roof and a flag. */
function drawMarket(g: Graphics, cx: number, cy: number): void {
  const hw = 26;
  const hh = 13;
  const h = 9;
  walls(g, cx, cy, hw, hh, h, MARKET_WALL);
  const top = cy - h;
  g.poly([cx, top - hh, cx + hw, top, cx, top + hh, cx - hw, top], true).fill(MARKET_AWNING);
  // Stripes across the awning, parallel to the left-top edge.
  for (const f of [0.2, 0.45, 0.7]) {
    const ax = cx - hw + hw * f;
    const ay = top + hh * f;
    g.moveTo(ax, ay).lineTo(ax + hw, ay - hh).stroke({ width: 3, color: MARKET_STRIPE, alpha: 0.9 });
  }
  // A flag on a pole at the back corner.
  g.moveTo(cx, top - hh).lineTo(cx, top - hh - 22).stroke({ width: 2, color: 0x3b3128 });
  g.poly([cx, top - hh - 22, cx + 12, top - hh - 18, cx, top - hh - 14], true).fill(MARKET_FLAG);
}

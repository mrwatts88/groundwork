import { describe, expect, it } from "vitest";
import { Camera, MAX_SCALE, MIN_SCALE, TILE_H, TILE_W, tileCenter, tileTop, worldToTile } from "./iso.ts";

describe("isometric projection", () => {
  it("uses 2:1 tiles of 64 x 32 px", () => {
    expect(TILE_W).toBe(64);
    expect(TILE_H).toBe(32);
    expect(tileTop(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileTop(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileTop(0, 1)).toEqual({ x: -32, y: 16 });
  });

  it("maps every tile centre and points inside the diamond back to the same tile", () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const c = tileCenter(x, y);
        expect(worldToTile(c.x, c.y)).toEqual({ x, y });
        expect(worldToTile(c.x + 20, c.y)).toEqual({ x, y });
        expect(worldToTile(c.x - 20, c.y)).toEqual({ x, y });
        expect(worldToTile(c.x, c.y - 10)).toEqual({ x, y });
        expect(worldToTile(c.x, c.y + 10)).toEqual({ x, y });
      }
    }
  });
});

describe("camera", () => {
  it("round-trips screen and world points", () => {
    const cam = new Camera();
    cam.scale = 0.75;
    cam.pan(120, -40);
    const w = { x: 333, y: -77 };
    const back = cam.toWorld(cam.toScreen(w));
    expect(back.x).toBeCloseTo(w.x);
    expect(back.y).toBeCloseTo(w.y);
  });

  it("zooms about the pointer and clamps the scale", () => {
    const cam = new Camera();
    cam.pan(50, 60);
    const p = { x: 400, y: 300 };
    const under = cam.toWorld(p);
    cam.zoomAt(p, 2);
    expect(cam.scale).toBe(2);
    const still = cam.toWorld(p);
    expect(still.x).toBeCloseTo(under.x);
    expect(still.y).toBeCloseTo(under.y);
    cam.zoomAt(p, 100);
    expect(cam.scale).toBe(MAX_SCALE);
    cam.zoomAt(p, 0.0001);
    expect(cam.scale).toBe(MIN_SCALE);
  });

  it("centres a world point on the screen", () => {
    const cam = new Camera();
    cam.centerOn({ x: 500, y: 200 }, 800, 600, 0.5);
    expect(cam.toScreen({ x: 500, y: 200 })).toEqual({ x: 400, y: 300 });
  });
});

// The Game's tick delta carries buildings (DESIGN.md 12.1, D-017).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TERRAIN } from "@groundwork/protocol";
import { BUILDING_SPEC, harvesterSite, hashWorld, partyIndex, ROAD_NONE, WORLD_FORMAT } from "@groundwork/sim";
import { Game, PLAYER_OP } from "./game.ts";
import { Store } from "./store.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});

describe("Game delta", () => {
  it("sends every building with its construction and staffing in each tick delta, and keeps it across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "groundwork-game-"));
    const store = new Store(dir, WORLD_FORMAT);
    cleanup.push(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const game = new Game(store, { seed: 5, mapSize: 64, snapshotEveryTicks: 50 });
    const w = game.world;
    const me = partyIndex(w, "op", PLAYER_OP);
    const ok = (i: number) => w.owner[i] === me && w.terrain[i] !== TERRAIN.water && w.road[i] === ROAD_NONE;
    const i = w.owner.findIndex((_, k) => (k + 1) % w.width !== 0 && ok(k) && ok(k + 1));
    const x = i % w.width;
    const y = Math.floor(i / w.width);
    expect(game.command({ type: "place_road", op: PLAYER_OP, x: x + 1, y }).ok).toBe(true);
    expect(game.command({ type: "place_building", op: PLAYER_OP, kind: "depot", x, y })).toEqual({ ok: true });
    game.step();
    const depot = { kind: "depot", tile: i, op: PLAYER_OP };
    expect(game.delta().buildings).toEqual([{ ...depot, remaining: BUILDING_SPEC.depot.buildTicks - 1, staffed: false, ore: 0 }]);
    for (let t = 1; t < BUILDING_SPEC.depot.buildTicks; t++) game.step();
    expect(game.delta().buildings).toEqual([{ ...depot, remaining: 0, staffed: true, ore: 0 }]);
    // A restart replays the place_building command from the log.
    const again = new Game(store, { seed: 5, mapSize: 64, snapshotEveryTicks: 50 });
    expect(again.delta().buildings).toEqual([{ ...depot, remaining: 0, staffed: true, ore: 0 }]);
  });

  it("sends vehicles with their cargo and the depot's ore in each tick delta, and replays them across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "groundwork-game-"));
    const store = new Store(dir, WORLD_FORMAT);
    cleanup.push(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const game = new Game(store, { seed: 5, mapSize: 64, snapshotEveryTicks: 50 });
    const w = game.world;
    const site = harvesterSite(w, PLAYER_OP, 3);
    expect(site).not.toBeNull();
    const at = (i: number) => ({ x: i % w.width, y: Math.floor(i / w.width) });
    if (w.owner[site!.deposit] !== partyIndex(w, "op", PLAYER_OP)) {
      expect(game.command({ type: "stake_claim", op: PLAYER_OP, ...at(site!.deposit) }).ok).toBe(true);
    }
    for (const r of site!.roads) expect(game.command({ type: "place_road", op: PLAYER_OP, ...at(r) }).ok).toBe(true);
    expect(game.command({ type: "place_building", op: PLAYER_OP, kind: "depot", ...at(site!.depot) }).ok).toBe(true);
    for (let t = 0; t < BUILDING_SPEC.depot.buildTicks; t++) game.step();
    expect(game.command({ type: "buy_vehicle", op: PLAYER_OP, kind: "harvester", ...at(site!.depot) })).toEqual({ ok: true });
    expect(game.command({ type: "set_route", op: PLAYER_OP, vehicle: 1, ...at(site!.deposit) })).toEqual({ ok: true });
    for (let t = 0; t < 600; t++) game.step();
    const delta = game.delta();
    expect(delta.vehicles).toEqual(w.vehicles);
    expect(delta.vehicles.length).toBe(1);
    expect(delta.buildings[0]!.ore).toBeGreaterThan(0);
    // A restart replays buy_vehicle and set_route from the log to the same world.
    const again = new Game(store, { seed: 5, mapSize: 64, snapshotEveryTicks: 50 });
    expect(hashWorld(again.world)).toBe(hashWorld(w));
    expect(again.delta().vehicles).toEqual(delta.vehicles);
  });
});

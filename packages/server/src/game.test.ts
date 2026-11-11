// The Game's tick delta carries buildings (DESIGN.md 12.1, D-017).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TERRAIN } from "@groundwork/protocol";
import { BUILDING_SPEC, partyIndex, ROAD_NONE, WORLD_FORMAT } from "@groundwork/sim";
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
    expect(game.delta().buildings).toEqual([{ ...depot, remaining: BUILDING_SPEC.depot.buildTicks - 1, staffed: false }]);
    for (let t = 1; t < BUILDING_SPEC.depot.buildTicks; t++) game.step();
    expect(game.delta().buildings).toEqual([{ ...depot, remaining: 0, staffed: true }]);
    // A restart replays the place_building command from the log.
    const again = new Game(store, { seed: 5, mapSize: 64, snapshotEveryTicks: 50 });
    expect(again.delta().buildings).toEqual([{ ...depot, remaining: 0, staffed: true }]);
  });
});

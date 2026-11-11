import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@groundwork/protocol";
import { ClientWorld, formatClock, ROAD_BUILDING } from "./state.ts";

function snapshot(): WorldSnapshot {
  // 4 x 4. The player (op index 0, owner 1) holds the 2 x 2 square at (1, 1).
  const owner = new Array<number>(16).fill(0);
  for (const i of [5, 6, 9, 10]) owner[i] = 1;
  owner[15] = 2;
  return {
    seed: 1,
    width: 4,
    height: 4,
    tick: 10,
    rngState: 0,
    terrain: new Array<number>(16).fill(0),
    richness: new Array<number>(16).fill(0),
    owner,
    road: new Array<number>(16).fill(0),
    ops: [
      { id: "player", cash: 10_000 },
      { id: "rival", cash: 5_000 },
    ],
    builds: [],
  };
}

describe("ClientWorld", () => {
  it("finds the player's land, cash and home", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect(w.playerOwner()).toBe(1);
    expect(w.playerCash()).toBe(10_000);
    expect(w.playerHome()).toEqual({ x: 1.5, y: 1.5 });
  });

  it("applies a tick delta and reports the changed tiles", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    const changed = w.applyDelta(
      11,
      "Day 1, 00:11",
      { mode: "speedup", rate: 4, speed: 4 },
      { owner: [], road: [[5, ROAD_BUILDING]], ops: [{ id: "player", cash: 9_990 }, { id: "rival", cash: 5_000 }], builds: [] },
    );
    expect(changed).toEqual([5]);
    expect(w.road[5]).toBe(ROAD_BUILDING);
    expect(w.tick).toBe(11);
    expect(w.date).toBe("Day 1, 00:11");
    expect(w.playerCash()).toBe(9_990);
  });
});

describe("formatClock", () => {
  it("names the speed and the mode", () => {
    expect(formatClock({ mode: "present", rate: 1, speed: 1 })).toBe("1x live");
    expect(formatClock({ mode: "speedup", rate: 4, speed: 4 })).toBe("4x sped up");
    expect(formatClock({ mode: "away", rate: 0.25, speed: 2 })).toBe("away (0.25x)");
  });
});

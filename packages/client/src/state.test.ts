import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@groundwork/protocol";
import { ClientWorld, formatClock, ROAD_BUILDING } from "./state.ts";

function snapshot(): WorldSnapshot {
  // 4 x 4. The player (op index 0, owner 1) holds the 2 x 2 square at (1, 1).
  const owner = new Array<number>(16).fill(0);
  for (const i of [5, 6, 9, 10]) owner[i] = 1;
  owner[15] = 2;
  owner[12] = 3;
  owner[3] = 4;
  return {
    format: 3,
    seed: 1,
    width: 4,
    height: 4,
    tick: 10,
    rngState: 0,
    terrain: [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    richness: [0, 0, 0, 0, 0, 0, 0, 180, 0, 0, 0, 0, 0, 0, 0, 0],
    owner,
    road: new Array<number>(16).fill(0),
    ops: [
      { id: "player", cash: 10_000, attention: 40 },
      { id: "rival", cash: 5_000, attention: 40 },
    ],
    builds: [],
    parties: [
      { kind: "frontier", id: "frontier" },
      { kind: "op", id: "player" },
      { kind: "op", id: "rival" },
      { kind: "town", id: "town" },
      { kind: "person", id: "town-1" },
    ],
    town: { id: "town", name: "Harlow", market: 12 },
    people: [{ id: "town-1", name: "Ada Marsh", job: "farmer", home: 12, traits: ["proud", "loyal"], asking: 120 }],
  };
}

describe("ClientWorld", () => {
  it("finds the player's land, cash and home", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect(w.playerOwner()).toBe(1);
    expect(w.playerCash()).toBe(10_000);
    expect(w.playerAttention()).toBe(40);
    expect(w.playerHome()).toEqual({ x: 1.5, y: 1.5 });
  });

  it("names who holds a tile", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect(w.ownerName(0)).toBe("Nobody");
    expect(w.ownerName(5)).toBe("You");
    expect(w.ownerName(15)).toBe("rival");
    const named = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 }, { rival: "Redrock Mining" });
    expect(named.ownerName(15)).toBe("Redrock Mining");
    expect(w.ownerName(12)).toBe("Harlow");
    expect(w.ownerName(3)).toBe("Ada Marsh");
  });

  it("sorts land by whose it is, for the ownership overlay", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect([0, 5, 15, 12, 3].map((i) => w.ownerKind(i))).toEqual(["frontier", "you", "rival", "town", "person"]);
  });

  it("describes a tile for the inspector", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect(w.inspect(3, 1)).toMatchObject({ terrain: "deposit", richness: 180, owner: "Nobody" });
    expect(w.inspect(0, 3)).toMatchObject({ terrain: "flat", richness: undefined, owner: "Harlow", building: "market" });
    expect(w.inspect(3, 0).owner).toBe("Ada Marsh");
  });

  it("finds the middle of the town", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    expect(w.townCentre()).toEqual({ x: 0, y: 3 });
  });

  it("applies a tick delta and reports the changed tiles", () => {
    const w = new ClientWorld(snapshot(), "Day 1, 00:10", { mode: "present", rate: 1, speed: 1 });
    const changed = w.applyDelta(
      11,
      "Day 1, 00:11",
      { mode: "speedup", rate: 4, speed: 4 },
      { owner: [], road: [[5, ROAD_BUILDING]], ops: [{ id: "player", cash: 9_990, attention: 39 }, { id: "rival", cash: 5_000, attention: 40 }], builds: [] },
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

import { describe, expect, it } from "vitest";
import { hashWorld } from "./hash.ts";
import { run } from "./replay.ts";
import { scenarioLog, scenarioWorld } from "./scenario.ts";
import { fromSnapshot, toSnapshot } from "./snapshot.ts";

describe("snapshot", () => {
  it("round-trips a world to the same hash, through JSON", () => {
    const world = scenarioWorld();
    const log = scenarioLog(world, 2000);
    run(world, log, 1000);
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(world))));
    expect(hashWorld(back)).toBe(hashWorld(world));
  });

  it("a restored world continues exactly like the original", () => {
    const a = scenarioWorld();
    const log = scenarioLog(a, 2000);
    run(a, log, 700);
    const b = fromSnapshot(toSnapshot(a));
    run(a, log, 1300);
    run(b, log, 1300);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });

  it("rejects a snapshot with the wrong tile count", () => {
    const s = toSnapshot(scenarioWorld());
    expect(() => fromSnapshot({ ...s, road: s.road.slice(1) })).toThrow(/road/);
  });
});

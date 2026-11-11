import { describe, expect, it } from "vitest";
import { hashWorld } from "./hash.ts";
import { run } from "./replay.ts";
import { SCENARIO_SIZE, SCENARIO_TICKS, scenarioLog, scenarioWorld } from "./scenario.ts";

function runScenario(): { hash: string; applied: number; rejected: number; tick: number } {
  const world = scenarioWorld();
  const log = scenarioLog(world);
  const report = run(world, log, SCENARIO_TICKS);
  return { hash: hashWorld(world), tick: world.tick, ...report };
}

describe("determinism", () => {
  it(`advances a ${SCENARIO_SIZE}x${SCENARIO_SIZE} world ${SCENARIO_TICKS} ticks with a command log twice to the same hash`, () => {
    const first = runScenario();
    const second = runScenario();
    expect(first.tick).toBe(SCENARIO_TICKS);
    expect(first.applied).toBeGreaterThan(0);
    expect(first.rejected).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("changes the hash when the command log changes", () => {
    const a = scenarioWorld();
    const logA = scenarioLog(a);
    run(a, logA, SCENARIO_TICKS);
    const b = scenarioWorld();
    // Drop every command for one tile, so that tile never gets a road.
    const gone = logA.find(
      (e) => e.command.x >= 0 && e.command.x < SCENARIO_SIZE && a.owner[e.command.y * SCENARIO_SIZE + e.command.x] !== 0,
    )!.command;
    const logB = scenarioLog(b).filter((e) => e.command.x !== gone.x || e.command.y !== gone.y);
    expect(logB.length).toBeLessThan(logA.length);
    run(b, logB, SCENARIO_TICKS);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });

  it("reaches the same hash when a run is split in two", () => {
    const whole = scenarioWorld();
    const log = scenarioLog(whole);
    run(whole, log, SCENARIO_TICKS);
    const split = scenarioWorld();
    run(split, log, 4321);
    run(split, log, SCENARIO_TICKS - 4321);
    expect(hashWorld(split)).toBe(hashWorld(whole));
  });
});

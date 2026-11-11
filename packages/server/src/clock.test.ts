import { describe, expect, it } from "vitest";
import { Clock } from "./clock.ts";
import { DEFAULT_CONFIG } from "./config.ts";

const MIN = 60_000;

describe("clock", () => {
  it("runs at 1 game day per real hour while present", () => {
    const clock = new Clock(DEFAULT_CONFIG, 0);
    clock.input(0);
    expect(clock.status(0)).toEqual({ mode: "present", rate: 1, speed: 1 });
    expect(clock.interval(0) * 1440).toBe(60 * MIN);
  });

  it("speeds up to the max and no further", () => {
    const clock = new Clock(DEFAULT_CONFIG, 0);
    expect(clock.setSpeed(4, 0)).toBe(true);
    expect(clock.status(0)).toEqual({ mode: "speedup", rate: 4, speed: 4 });
    clock.setSpeed(10, 0);
    expect(clock.status(0).rate).toBe(4);
    clock.setSpeed(0, 0);
    expect(clock.status(0)).toEqual({ mode: "present", rate: 1, speed: 1 });
  });

  it("goes away after 15 idle minutes, at 1 game day per 4 real hours, and back on input", () => {
    const clock = new Clock(DEFAULT_CONFIG, 0);
    clock.setSpeed(2, 0);
    expect(clock.mode(15 * MIN - 1)).toBe("speedup");
    expect(clock.status(15 * MIN)).toEqual({ mode: "away", rate: 0.25, speed: 2 });
    expect(clock.interval(15 * MIN) * 1440).toBe(4 * 60 * MIN);
    expect(clock.input(20 * MIN)).toBe(true);
    expect(clock.status(20 * MIN)).toEqual({ mode: "speedup", rate: 2, speed: 2 });
  });

  it("starts away until someone shows up", () => {
    const clock = new Clock(DEFAULT_CONFIG, 1000);
    expect(clock.mode(1000)).toBe("away");
    expect(clock.untilAway(1000)).toBe(0);
  });
});

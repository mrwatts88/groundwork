import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "./config.ts";

describe("config", () => {
  it("defaults match DESIGN.md 11.1 and 11.2", () => {
    const c = loadConfig({});
    expect(c).toEqual(DEFAULT_CONFIG);
    // 1 game day (1440 ticks) per real hour.
    expect(c.tickMs * 1440).toBe(60 * 60 * 1000);
    expect(c.maxSpeed).toBe(4);
    expect(c.awayAfterMs).toBe(15 * 60 * 1000);
    expect(c.awayRate).toBe(0.25);
    // A snapshot every game day.
    expect(c.snapshotEveryTicks).toBe(1440);
  });

  it("reads clock rates and the data dir from the environment", () => {
    const c = loadConfig({
      GROUNDWORK_DATA_DIR: "/srv/groundwork",
      GROUNDWORK_TICK_MS: "100",
      GROUNDWORK_MAX_SPEED: "8",
      GROUNDWORK_AWAY_AFTER_MS: "5000",
      GROUNDWORK_AWAY_RATE: "0.5",
      GROUNDWORK_PORT: "9000",
    });
    expect(c.dataDir).toBe("/srv/groundwork");
    expect(c.tickMs).toBe(100);
    expect(c.maxSpeed).toBe(8);
    expect(c.awayAfterMs).toBe(5000);
    expect(c.awayRate).toBe(0.5);
    expect(c.port).toBe(9000);
  });

  it("rejects nonsense", () => {
    expect(() => loadConfig({ GROUNDWORK_TICK_MS: "fast" })).toThrow(/GROUNDWORK_TICK_MS/);
    expect(() => loadConfig({ GROUNDWORK_AWAY_RATE: "0" })).toThrow(/awayRate/);
  });
});

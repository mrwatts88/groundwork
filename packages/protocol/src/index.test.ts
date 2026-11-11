import { describe, expect, it } from "vitest";
import { PACKAGE_NAMES, PROTOCOL_VERSION } from "./index.ts";

describe("protocol", () => {
  it("has a positive integer version", () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  it("names the five packages", () => {
    expect(PACKAGE_NAMES).toEqual(["protocol", "sim", "minds", "server", "client"]);
  });
});

import { PROTOCOL_VERSION } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { PACKAGE, SIM_PROTOCOL_VERSION } from "./index.ts";

describe("sim", () => {
  it("resolves the protocol package through the workspace", () => {
    expect(PACKAGE).toBe("sim");
    expect(SIM_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});

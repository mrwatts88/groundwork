import { PROTOCOL_VERSION } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { MINDS_PROTOCOL_VERSION, PACKAGE } from "./index.ts";

describe("minds", () => {
  it("resolves the protocol package through the workspace", () => {
    expect(PACKAGE).toBe("minds");
    expect(MINDS_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});

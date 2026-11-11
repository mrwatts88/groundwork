import { PROTOCOL_VERSION } from "@groundwork/protocol";
import { describe, expect, it } from "vitest";
import { CLIENT_PROTOCOL_VERSION, PACKAGE } from "./index.ts";

describe("client", () => {
  it("resolves the protocol package through the workspace", () => {
    expect(PACKAGE).toBe("client");
    expect(CLIENT_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});

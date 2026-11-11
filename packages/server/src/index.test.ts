import { describe, expect, it } from "vitest";
import { PACKAGE, protocolVersionsAgree } from "./index.ts";

describe("server", () => {
  it("resolves sim, minds and protocol through the workspace", () => {
    expect(PACKAGE).toBe("server");
    expect(protocolVersionsAgree()).toBe(true);
  });
});

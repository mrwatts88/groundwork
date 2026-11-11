import { describe, expect, it } from "vitest";
import { FakeBackend, promptHash } from "./fake.ts";
import { parseMindReply } from "./reply.ts";
import { MindError, type MindRequest } from "./types.ts";

const req: MindRequest = {
  agent: "rival-1",
  tier: "deliberation",
  priority: "normal",
  persona: "You run a quarry.",
  prompt: "Cash 500. Your land is at 10,10. What now?",
};

const recorded = { commands: [{ type: "place_road", op: "rival-1", x: 10, y: 11 }], notes: ["road to the deposit"] };

describe("fake backend", () => {
  it("hashes the prompt stably and distinguishes prompts", () => {
    expect(promptHash(req)).toBe(promptHash({ ...req, agent: "other" } as MindRequest));
    expect(promptHash(req)).not.toBe(promptHash({ ...req, prompt: req.prompt + " " }));
    expect(promptHash(req)).not.toBe(promptHash({ ...req, tier: "conversation" }));
    expect(promptHash(req)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replays a recorded reply by prompt hash and returns schema-valid output", async () => {
    const fake = new FakeBackend({ recordings: { [promptHash(req)]: recorded } });
    const { reply, usage } = await fake.call(req);
    expect(reply).toEqual(recorded);
    expect(parseMindReply(reply).ok).toBe(true);
    expect(usage.model).toBe("fake");
    expect(fake.calls).toEqual([req]);
  });

  it("records at run time too", async () => {
    const fake = new FakeBackend();
    fake.record(req, { commands: [], notes: [] });
    expect((await fake.call(req)).reply).toEqual({ commands: [], notes: [] });
  });

  it("answers through scripted rules when nothing is recorded", async () => {
    const fake = new FakeBackend({
      rules: [() => undefined, (r) => ({ commands: [], notes: [`hello ${r.agent}`] })],
    });
    expect((await fake.call(req)).reply.notes).toEqual(["hello rival-1"]);
  });

  it("fails with no_recording for an unknown prompt", async () => {
    const fake = new FakeBackend();
    await expect(fake.call(req)).rejects.toMatchObject({ name: "MindError", code: "no_recording" });
  });

  it("rejects a recorded reply that breaks the schema", async () => {
    const fake = new FakeBackend({ recordings: { [promptHash(req)]: { commands: [{ type: "build_castle" }], notes: [] } } });
    const err = await fake.call(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MindError);
    expect((err as MindError).code).toBe("schema_invalid");
  });
});

describe("reply schema", () => {
  it("accepts a valid reply and rejects bad shapes", () => {
    expect(parseMindReply(recorded).ok).toBe(true);
    expect(parseMindReply({ commands: [] }).ok).toBe(false);
    expect(parseMindReply({ commands: [], notes: [3] }).ok).toBe(false);
    expect(parseMindReply({ commands: [], notes: [], extra: 1 }).ok).toBe(false);
    expect(parseMindReply({ commands: [{ type: "place_road", op: "a", x: 1.5, y: 0 }], notes: [] }).ok).toBe(false);
    expect(parseMindReply({ commands: [{ type: "place_road", op: "a", x: 1, y: 0, z: 2 }], notes: [] }).ok).toBe(false);
    expect(parseMindReply([]).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { formatGameDate, gameDate, parseClientMessage, TICKS_PER_DAY } from "./index.ts";

describe("game date", () => {
  it("starts at day 1, midnight, and counts minutes", () => {
    expect(gameDate(0)).toEqual({ day: 1, hour: 0, minute: 0 });
    expect(formatGameDate(61)).toBe("Day 1, 01:01");
    expect(formatGameDate(TICKS_PER_DAY)).toBe("Day 2, 00:00");
    expect(formatGameDate(TICKS_PER_DAY * 3 - 1)).toBe("Day 3, 23:59");
  });
});

describe("parseClientMessage", () => {
  it("accepts a place_road command", () => {
    const raw = JSON.stringify({ type: "command", id: 7, command: { type: "place_road", op: "player", x: 3, y: 4 } });
    expect(parseClientMessage(raw)).toEqual({
      ok: true,
      value: { type: "command", id: 7, command: { type: "place_road", op: "player", x: 3, y: 4 } },
    });
  });

  it("accepts a place_building command for a known kind and refuses an unknown one", () => {
    const command = { type: "place_building", op: "player", kind: "depot", x: 3, y: 4 };
    expect(parseClientMessage(JSON.stringify({ type: "command", id: 2, command }))).toEqual({
      ok: true,
      value: { type: "command", id: 2, command },
    });
    const castle = { ...command, kind: "castle" };
    expect(parseClientMessage(JSON.stringify({ type: "command", id: 3, command: castle })).ok).toBe(false);
    const noKind = { type: "place_building", op: "player", x: 3, y: 4 };
    expect(parseClientMessage(JSON.stringify({ type: "command", id: 4, command: noKind })).ok).toBe(false);
  });

  it("accepts set_speed", () => {
    expect(parseClientMessage('{"type":"set_speed","speed":4}')).toEqual({
      ok: true,
      value: { type: "set_speed", speed: 4 },
    });
  });

  it("rejects malformed frames without throwing", () => {
    expect(parseClientMessage("not json").ok).toBe(false);
    expect(parseClientMessage("[]").ok).toBe(false);
    expect(parseClientMessage('{"type":"nope"}').ok).toBe(false);
    expect(parseClientMessage('{"type":"command","id":1,"command":{"type":"place_road","op":"p","x":1.5,"y":2}}').ok).toBe(
      false,
    );
    expect(parseClientMessage('{"type":"command","id":1,"command":{"type":"demolish"}}').ok).toBe(false);
  });
});

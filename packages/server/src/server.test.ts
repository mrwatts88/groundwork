// Integration: a real server on a free port with a fast clock, a real
// WebSocket client and a real SQLite file in a temp dir.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TERRAIN, type ServerMessage, type WorldSnapshot } from "@groundwork/protocol";
import { ROAD_BUILDING, ROAD_NONE } from "@groundwork/sim";
import { WebSocket } from "ws";
import { loadConfig, type ServerConfig } from "./config.ts";
import { PLAYER_OP } from "./game.ts";
import { startServer, type Health, type RunningServer } from "./server.ts";

const dirs: string[] = [];
const servers: RunningServer[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await s.close().catch(() => undefined);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "groundwork-server-"));
  dirs.push(d);
  return d;
}

function testConfig(dataDir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return loadConfig({}, { port: 0, host: "127.0.0.1", dataDir, mapSize: 64, tickMs: 20, ...overrides });
}

async function start(config: ServerConfig): Promise<RunningServer> {
  const s = await startServer(config);
  servers.push(s);
  return s;
}

/** A client that buffers every message so a test can wait for the one it wants. */
class Client {
  readonly ws: WebSocket;
  private readonly inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on("message", (data) => {
      this.inbox.push(JSON.parse(String(data)) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  async next<T extends ServerMessage>(match: (m: ServerMessage) => m is T, timeoutMs = 3000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(match);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as T;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("timed out waiting for a message");
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** Drop everything received so far. */
  clear(): void {
    this.inbox.length = 0;
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { type: "welcome" }> => m.type === "welcome";
const isTick = (m: ServerMessage): m is Extract<ServerMessage, { type: "tick" }> => m.type === "tick";
const isResult = (m: ServerMessage): m is Extract<ServerMessage, { type: "command_result" }> =>
  m.type === "command_result";
const isError = (m: ServerMessage): m is Extract<ServerMessage, { type: "error" }> => m.type === "error";

async function getHealth(port: number): Promise<Health> {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/json");
  return (await res.json()) as Health;
}

/** A tile the player owns with no road and no water. */
function buildableTile(state: WorldSnapshot): { x: number; y: number; i: number } {
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] === 1 && state.road[i] === ROAD_NONE && state.terrain[i] !== TERRAIN.water) {
      return { x: i % state.width, y: Math.floor(i / state.width), i };
    }
  }
  throw new Error("no buildable tile");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("server", () => {
  it("sends the initial state and tick updates, applies place_road, rejects bad commands, and resumes after restart", async () => {
    const dir = tempDir();
    const server = await start(testConfig(dir));
    const client = new Client(server.port);

    const welcome = await client.next(isWelcome);
    expect(welcome.state.width).toBe(64);
    expect(welcome.state.ops.map((o) => o.id)).toEqual([PLAYER_OP]);
    const first = await client.next(isTick);
    const second = await client.next(isTick);
    expect(second.tick).toBe(first.tick + 1);
    expect(second.clock.mode).toBe("present");

    // A valid road shows up in the next state.
    const tile = buildableTile(welcome.state);
    client.send({ type: "command", id: 1, command: { type: "place_road", op: PLAYER_OP, x: tile.x, y: tile.y } });
    const ok = await client.next(isResult);
    expect(ok).toEqual({ type: "command_result", id: 1, result: { ok: true } });
    const after = await client.next(isTick);
    expect(after.delta.road).toContainEqual([tile.i, ROAD_BUILDING]);
    expect(after.delta.builds.some((b) => b.tile === tile.i)).toBe(true);

    // A command the sim rejects returns an error result.
    client.send({ type: "command", id: 2, command: { type: "place_road", op: PLAYER_OP, x: tile.x, y: tile.y } });
    const dup = await client.next(isResult);
    expect(dup.id).toBe(2);
    expect(dup.result.ok).toBe(false);
    if (!dup.result.ok) expect(dup.result.error.code).toBe("already_road");
    client.send({ type: "command", id: 3, command: { type: "place_road", op: PLAYER_OP, x: -1, y: 0 } });
    const off = await client.next(isResult);
    expect(off.result.ok === false && off.result.error.code).toBe("out_of_bounds");

    // A malformed message returns an error message.
    client.send({ type: "command", id: 4, command: { type: "teleport" } });
    expect((await client.next(isError)).message).toMatch(/unknown command type/);
    client.ws.send("not json");
    expect((await client.next(isError)).message).toMatch(/not JSON/);

    await client.next(isTick);
    const stoppedTick = server.health().tick;
    const stoppedHash = server.hash();
    client.close();
    await server.close();
    servers.length = 0;

    // Same data dir: the road is there and the tick count carries on.
    const again = await start(testConfig(dir));
    expect(again.health().tick).toBe(stoppedTick);
    expect(again.hash()).toBe(stoppedHash);
    const client2 = new Client(again.port);
    const welcome2 = await client2.next(isWelcome);
    expect(welcome2.state.tick).toBe(stoppedTick);
    expect(welcome2.state.road[tile.i]).not.toBe(ROAD_NONE);
    const next = await client2.next(isTick);
    expect(next.tick).toBe(stoppedTick + 1);
    client2.close();
  });

  it("resumes across a snapshot boundary with commands on both sides", async () => {
    const dir = tempDir();
    const config = testConfig(dir, { tickMs: 5, snapshotEveryTicks: 10 });
    const server = await start(config);
    const client = new Client(server.port);
    const welcome = await client.next(isWelcome);
    const owned: { x: number; y: number }[] = [];
    for (let i = 0; i < welcome.state.owner.length && owned.length < 3; i++) {
      if (welcome.state.owner[i] === 1 && welcome.state.terrain[i] !== TERRAIN.water) {
        owned.push({ x: i % welcome.state.width, y: Math.floor(i / welcome.state.width) });
      }
    }
    for (const [id, t] of owned.entries()) {
      client.send({ type: "command", id, command: { type: "place_road", op: PLAYER_OP, ...t } });
      await client.next(isResult);
      // Wait several ticks so commands straddle snapshots.
      for (let k = 0; k < 7; k++) await client.next(isTick);
    }
    const stoppedTick = server.health().tick;
    expect(stoppedTick).toBeGreaterThan(20);
    const stoppedHash = server.hash();
    client.close();
    await server.close();
    servers.length = 0;

    const again = await start(config);
    expect(again.health().tick).toBe(stoppedTick);
    expect(again.hash()).toBe(stoppedHash);
  });

  it("GET /health returns tick, game date, clock mode and client count", async () => {
    const server = await start(testConfig(tempDir()));
    const before = await getHealth(server.port);
    expect(before.ok).toBe(true);
    expect(before.clients).toBe(0);
    expect(before.clock.mode).toBe("away");
    const client = new Client(server.port);
    await client.next(isWelcome);
    await client.next(isTick);
    const h = await getHealth(server.port);
    expect(h.clients).toBe(1);
    expect(h.clock.mode).toBe("present");
    expect(Number.isInteger(h.tick)).toBe(true);
    expect(h.tick).toBeGreaterThan(0);
    expect(h.date).toMatch(/^Day \d+, \d\d:\d\d$/);
    const missing = await fetch(`http://127.0.0.1:${server.port}/nope`);
    expect(missing.status).toBe(404);
    client.close();
  });

  it("switches to away after the idle time with no input, and back on input", async () => {
    const server = await start(testConfig(tempDir(), { tickMs: 10, awayAfterMs: 250, awayRate: 0.25 }));
    const client = new Client(server.port);
    await client.next(isWelcome);
    expect((await client.next(isTick)).clock.mode).toBe("present");
    expect((await getHealth(server.port)).clock.mode).toBe("present");

    await sleep(350);
    const h = await getHealth(server.port);
    expect(h.clock).toEqual({ mode: "away", rate: 0.25, speed: 1 });
    client.clear();
    const awayTick = await client.next(isTick);
    expect(awayTick.clock.mode).toBe("away");

    // Any input brings it back, here a speed-up.
    client.send({ type: "set_speed", speed: 4 });
    await sleep(30);
    expect((await getHealth(server.port)).clock).toEqual({ mode: "speedup", rate: 4, speed: 4 });
    client.clear();
    expect((await client.next(isTick)).clock.mode).toBe("speedup");
    client.close();
  });

  it("runs faster when sped up", async () => {
    const server = await start(testConfig(tempDir(), { tickMs: 40 }));
    const client = new Client(server.port);
    await client.next(isWelcome);
    await client.next(isTick);
    const t0 = server.health().tick;
    await sleep(400);
    const slow = server.health().tick - t0;
    client.send({ type: "set_speed", speed: 4 });
    await sleep(30);
    const t1 = server.health().tick;
    await sleep(400);
    const fast = server.health().tick - t1;
    expect(fast).toBeGreaterThan(slow * 2);
    client.close();
  });
});

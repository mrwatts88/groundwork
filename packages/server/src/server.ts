// HTTP plus WebSocket front of the world (DESIGN.md 12.1). The client sends
// commands and receives state deltas. GET /health reports the clock, the town
// and the Ops. Every
// other GET serves the built client, so one port does everything.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  formatGameDate,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClockStatus,
  type ServerMessage,
} from "@groundwork/protocol";
import { hashWorld, toSnapshot, WORLD_FORMAT } from "@groundwork/sim";
import { WebSocket, WebSocketServer } from "ws";
import { Clock } from "./clock.ts";
import type { ServerConfig } from "./config.ts";
import { Game } from "./game.ts";
import { serveStatic } from "./static.ts";
import { Store } from "./store.ts";

export interface Health {
  readonly ok: true;
  readonly tick: number;
  readonly date: string;
  readonly clock: ClockStatus;
  readonly clients: number;
  /** The town's name. */
  readonly town: string;
  /** Every Op id, in world order. */
  readonly ops: readonly string[];
}

export interface RunningServer {
  readonly port: number;
  readonly game: Game;
  /** The name an old-format db file was kept under at startup, if one was found. */
  readonly archived: string | undefined;
  health(): Health;
  hash(): string;
  close(): Promise<void>;
}

export async function startServer(config: ServerConfig, now: () => number = Date.now): Promise<RunningServer> {
  const store = new Store(config.dataDir, WORLD_FORMAT);
  const game = new Game(store, config);
  const clock = new Clock(config, now());
  const clients = new Set<WebSocket>();
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const send = (ws: WebSocket, msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const health = (): Health => ({
    ok: true,
    tick: game.world.tick,
    date: formatGameDate(game.world.tick),
    clock: clock.status(now()),
    clients: clients.size,
    town: game.world.town.name,
    ops: game.world.ops.map((op) => op.id),
  });

  // Ticks are scheduled one at a time, so a rate change takes effect at once.
  // A timer also fires when away mode starts, so the slower rate begins on time.
  const schedule = (): void => {
    if (closed) return;
    if (timer !== undefined) clearTimeout(timer);
    const t = now();
    const untilAway = clock.untilAway(t);
    const delay = untilAway > 0 ? Math.min(clock.interval(t), untilAway) : clock.interval(t);
    const tickDue = untilAway === 0 || clock.interval(t) <= untilAway;
    timer = setTimeout(() => {
      timer = undefined;
      if (tickDue) step();
      else schedule();
    }, delay);
  };

  const step = (): void => {
    game.step();
    const clockStatus = clock.status(now());
    const msg: ServerMessage = {
      type: "tick",
      tick: game.world.tick,
      date: formatGameDate(game.world.tick),
      clock: clockStatus,
      delta: game.delta(),
    };
    const frame = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    schedule();
  };

  const touch = (): void => {
    if (clock.input(now())) schedule();
  };

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(health()));
      return;
    }
    const notFound = (): void => {
      if (res.headersSent) return;
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        res.end("The client is not built. Run: pnpm --filter @groundwork/client build\n");
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
    };
    if ((req.method === "GET" || req.method === "HEAD") && req.url !== undefined) {
      serveStatic(config.clientDir, req.url, res).then(
        (served) => {
          if (!served) notFound();
        },
        () => notFound(),
      );
      return;
    }
    notFound();
  });

  const wss = new WebSocketServer({ server: http, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    touch();
    send(ws, {
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      date: formatGameDate(game.world.tick),
      clock: clock.status(now()),
      state: toSnapshot(game.world),
    });
    ws.on("message", (data) => {
      touch();
      const parsed = parseClientMessage(String(data));
      if (!parsed.ok) {
        send(ws, { type: "error", message: parsed.message });
        return;
      }
      const msg = parsed.value;
      switch (msg.type) {
        case "command":
          send(ws, { type: "command_result", id: msg.id, result: game.command(msg.command) });
          break;
        case "set_speed":
          if (clock.setSpeed(msg.speed, now())) schedule();
          break;
      }
    });
    ws.on("close", () => clients.delete(ws));
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(config.port, config.host, () => resolve());
  });
  schedule();

  return {
    port: (http.address() as AddressInfo).port,
    game,
    archived: store.archived,
    health,
    hash: () => hashWorld(game.world),
    close: async () => {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const ws of clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      store.close();
    },
  };
}

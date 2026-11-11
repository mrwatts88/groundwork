# Developer guide

## Install

You need Node 22 or newer and pnpm 10 (`brew install pnpm` on the Mac).

```
pnpm install
```

## Checks

| Command | What it does |
|---|---|
| `make check-fast` | Plan lint, script syntax, typecheck of every package, unit tests. Runs at the start of every session. |
| `make check` | `check-fast` plus the slow suites: cross-process determinism and the client smoke test. |
| `pnpm build` | Builds the client into `packages/client/dist`, which the server serves at `/`. |
| `pnpm --filter @groundwork/client smoke` | Builds the client and runs the Playwright smoke test. Screenshots land in `test-results/smoke/`. |
| `pnpm -s typecheck` | Runs `tsc` in each package, one after another. |
| `pnpm -s test` | Runs every unit test with Vitest from the repo root. |
| `pnpm exec vitest` | Vitest in watch mode while you work. |

If `node_modules` is missing, `make check-fast` runs `pnpm install` first.

## Workspace layout

A pnpm workspace with five packages under `packages/` (DESIGN.md 12.2).

| Package | Holds | Depends on |
|---|---|---|
| `protocol` | Command, event and state types, schemas, wire messages | nothing |
| `sim` | World state, tick, the command API, economy, reflex AI | protocol |
| `minds` | Mind interface, prompts, backends, budget governor, memory | protocol |
| `server` | Clock, WebSocket, persistence, Mind scheduling, presence | sim, minds, protocol |
| `client` | Vite, PixiJS isometric renderer, DOM UI | protocol |

Packages import each other by name (`@groundwork/sim`) through `workspace:*`
dependencies. Each package exports its TypeScript source directly from
`src/index.ts`, so there is no build step between packages.

## TypeScript

Every package `tsconfig.json` extends `tsconfig.base.json` at the root. The
base turns on `strict`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Imports inside a package use the `.ts`
extension. `sim` and `client` get no Node types, so Node APIs fail to
typecheck there.

## Tests

Unit tests live next to the code as `src/**/*.test.ts`. The root
`vitest.config.ts` finds them in every package. Automated tests use the fake
Mind backend and never call a real model.

## Running the server

```
pnpm --filter @groundwork/server start
```

It serves the built client at `/`, `GET /health` and a WebSocket at `/ws`, all
on port 8787. Run `pnpm build` first, or `/` answers with a note saying to. pnpm runs the
script from `packages/server`, so the world lives in
`packages/server/data/groundwork.db`. Set `GROUNDWORK_DATA_DIR` to put it
somewhere else. The store is SQLite through `node:sqlite`, so there is nothing
native to build. `data/` is gitignored. Stop the server with Ctrl-C and start
it again. It picks up at the tick where it stopped.

Every setting comes from an environment variable. The defaults match
DESIGN.md 11.1 and 11.2.

| Variable | Default | Meaning |
|---|---|---|
| `GROUNDWORK_PORT` | 8787 | HTTP and WebSocket port |
| `GROUNDWORK_HOST` | 0.0.0.0 | Address to listen on |
| `GROUNDWORK_DATA_DIR` | data | Where the SQLite file lives |
| `GROUNDWORK_SEED` | 1 | Map seed for a new world |
| `GROUNDWORK_MAP_SIZE` | 128 | Map width and height for a new world |
| `GROUNDWORK_TICK_MS` | 2500 | Real ms per game minute at 1x (1 game day per real hour) |
| `GROUNDWORK_MAX_SPEED` | 4 | Highest speed-up while someone is present |
| `GROUNDWORK_AWAY_AFTER_MS` | 900000 | Idle time before the away clock (15 minutes) |
| `GROUNDWORK_AWAY_RATE` | 0.25 | Clock rate while away (1 game day per 4 real hours) |
| `GROUNDWORK_SNAPSHOT_EVERY_TICKS` | 1440 | Ticks between snapshots (1 game day) |
| `GROUNDWORK_CLIENT_DIR` | packages/client/dist | The built client served at `/` |

### Clock

The clock is in one of three modes. `present` runs at 1x. `speedup` runs at
the speed the player set, up to the max. `away` starts when no client has sent
anything for the idle time, and runs at the away rate. Connecting or sending
any message counts as input and ends away mode at once. A fresh server starts
away until someone connects.

### Persistence

SQLite holds the latest snapshot, the command log since it, and the tick
reached. A snapshot is written every game day and replaces the older snapshot
and log. On start the server loads the snapshot and replays the log up to the
tick reached, so a restart resumes exactly.

### Wire messages

Types live in `packages/protocol`. The client sends `command` (with an id
that comes back in the result) and `set_speed`. The server sends `welcome`
with the full world on connect, a `tick` with the delta every tick,
`command_result` for every command, and `error` for a message it cannot
parse. Every accepted command is stamped with the current tick, which is
where a replay applies it.

## The client

`packages/client` is Vite plus PixiJS (DESIGN.md 15). It opens a WebSocket to
`/ws` on the host that served the page, builds its copy of the world from
`welcome` and keeps it current from each `tick` delta. It never changes the
world itself. It sends commands and the server decides.

| File | Holds |
|---|---|
| `src/iso.ts` | The 2:1 projection (64 x 32 px tiles) and the camera |
| `src/state.ts` | The client copy of the world, built from server messages |
| `src/render.ts` | The Pixi map: 16 x 16 tile chunks, redrawn on change, culled off screen |
| `src/net.ts` | The WebSocket link, with reconnect |
| `src/main.ts` | Input, the HUD and wiring |

Placeholder art is flat shapes drawn in code. Your land has a yellow border,
rival land a red one. A road under construction is a pale diamond, a finished
road a dark one.

Controls: drag or the arrow keys pan, the wheel or `+`/`-` zoom, Home centres
on your land, `R` or the Road button toggles road mode, Esc leaves it. In road
mode a click orders a road on that tile. Outside road mode a click shows what
the tile is in the HUD. The HUD shows the game date, the clock (speed and
mode), speed buttons and cash.

For live reload while working on the client, run the server on 8787 and
`pnpm --filter @groundwork/client dev`. Vite proxies `/ws` and `/health` to it.

`window.groundwork` exposes the client state, the camera and
`tileToClient(x, y)` for the smoke test and for poking at in the console.

### Smoke test

`packages/client/e2e/smoke.spec.ts` starts a fresh test server on port 8791
(`packages/server/scripts/test-server.ts`, data in `test-results/smoke-data`)
that serves the built client. It checks the HUD date and clock speed, zooms
and pans, saves `test-results/smoke/1-map.png`, places a road on the
player's land with a click and checks it on screen (`3-road.png`) and on the
server. Install the browser once with `pnpm exec playwright install chromium`.

## Adding things

How to add a building, a good, a command and an agent type is written here as
each of those systems lands.

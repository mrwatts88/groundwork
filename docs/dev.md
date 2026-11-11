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
| `make check` | `check-fast` plus the slow suites (determinism, scenario, soak, client smoke) once they exist. |
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

It serves `GET /health` and a WebSocket at `/ws` on port 8787. The world lives
in `data/groundwork.db` under the directory you start it from (SQLite through
`node:sqlite`, so nothing native to build). Stop it with Ctrl-C and start it
again. It picks up at the tick where it stopped.

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

## Adding things

How to add a building, a good, a command and an agent type is written here as
each of those systems lands.

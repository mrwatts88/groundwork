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
| `pnpm --filter @groundwork/minds smoke` | One real `claude -p` call as the NPC Ada Fenwick. Writes a `mind_usage` row to the world SQLite. Spends real budget, so it is not in any check. Run it on the Fedora box. |
| `tests/rings/ring0.sh` | The Ring 0 end-to-end check, run from the Mac: `make check`, determinism, `/health` on `laptop.local:7400` and the live mind smoke over ssh. Spends one real call. |

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
it again. It picks up at the tick where it stopped. `GET /health` reports the
tick, the game date, the clock, the town's name and the Op ids.

The store records a world format version (`WORLD_FORMAT` in
`packages/sim/src/world.ts`). If the db file holds an older format, the server
keeps it as `groundwork.format-<N>.db` in the same folder and starts a fresh
world. A Ring 0 file has no version and counts as format 1. Format 2 had the
town and the rival. Format 3 added the town's named people.

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
| `GROUNDWORK_RIVAL_NAME` | Redrock Mining | The rival Op's name, sent to the client in `welcome` |

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
with the full world and the names of the other Ops (`opNames`) on connect, a `tick` with the delta every tick,
`command_result` for every command, and `error` for a message it cannot
parse. Every accepted command is stamped with the current tick, which is
where a replay applies it.

## Deploy

The world server runs on the Fedora box as a systemd user service
(DESIGN.md 18). Linger is on, so it runs with no one logged in. From the Mac:

```
scripts/deploy.sh
```

It pushes `main`, pulls it on the Fedora box (`ssh laptop`, set
`GROUNDWORK_HOST_ALIAS=laptop-ts` away from home), then runs
`scripts/deploy-remote.sh` there. That installs, builds the client, links the
units from `deploy/` into `~/.config/systemd/user`, enables them, restarts the
server and prints its health JSON. Only committed work is deployed.

| Thing | Where |
|---|---|
| The game | `http://laptop.local:7400` |
| Health | `curl -s http://laptop.local:7400/health` |
| The world | `~/.local/share/groundwork/groundwork.db` on the Fedora box |
| Secrets and overrides | `~/.config/groundwork/env` on the Fedora box, optional, never in the repo |
| Backups | `~/groundwork-backups/`, one copy a night at about 03:30, the newest 14 kept |

With no one connected the clock runs away, one tick every 10 real seconds, so
two health reads 12 seconds apart show the tick going up.

Useful commands on the Fedora box:

```
systemctl --user status groundwork
journalctl --user -u groundwork -f
systemctl --user restart groundwork
systemctl --user start groundwork-backup.service
systemctl --user list-timers
```

A restart saves the tick on the way down and resumes from it. The backup uses
SQLite's online backup, so it is safe while the server runs. To restore, stop
the service, copy a backup over `groundwork.db`, delete any
`groundwork.db-wal` and `groundwork.db-shm` next to it and start the service.

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
rival land a red one, town land a light one and land a named person owns a
light blue one. A road under construction is a pale diamond, a finished road a
dark one.

The town has six named people, each with a home in town, a job and a
personality. Three of them own a small parcel outside the town, and one of
those parcels lies near a deposit. Each home is drawn as a house (light walls,
red pitched roof) and the market tile as a wide low hall with a striped teal
roof and a flag. Every building type gets its own shape and colours in
`render.ts`.

Click a tile and the inspector panel (`#inspector`) shows its terrain, the
owner by name (You, the rival's name, the town's name or the person's name),
deposit richness and any building on it. `ClientWorld.inspect` builds what it
shows. The HUD message repeats the terrain and owner.

The ownership overlay (`O` or the Owners button) fills each tile by
`ClientWorld.ownerKind`: yours yellow, the rival's red, the town's white,
named people's blue. A legend shows while it is on.

Controls: drag or the arrow keys pan, the wheel or `+`/`-` zoom, Home centres
on your land, `T` centres on the town, `O` toggles the ownership overlay, `R`
or the Road button toggles road mode, Esc leaves it and closes the
inspector. In road mode a click orders a road on that tile. Outside road mode a click shows what
the tile is in the HUD. The HUD shows the game date, the clock (speed and
mode), speed buttons, cash and attention left today as N/40
(`#hud-attention`).

For live reload while working on the client, run the server on 8787 and
`pnpm --filter @groundwork/client dev`. Vite proxies `/ws` and `/health` to it.

`window.groundwork` exposes the client state, the camera, the overlay state,
`centreOn(x, y, scale)` and `tileToClient(x, y)` for the smoke test and for
poking at in the console.

### Smoke test

`packages/client/e2e/smoke.spec.ts` starts a fresh test server on port 8791
(`packages/server/scripts/test-server.ts`, data in `test-results/smoke-data`)
that serves the built client. It checks the HUD date and clock speed, zooms
and pans, saves `test-results/smoke/1-map.png`, places a road on the
player's land with a click and checks it on screen (`3-road.png`) and on the
server, and that `#hud-attention` drops by 1. A second test presses T and saves the town (`4-town.png`), saves the
whole map with the ownership overlay off and on (`5-overlay-off.png`,
`6-overlay-on.png`), then clicks a town tile, the market, a person's tile, a
deposit, a rival tile and one of yours and reads `#inspector` from the DOM
(`7-inspector-town.png`, `8-inspector-deposit.png`). Install the browser once with `pnpm exec playwright install chromium`.

## The minds

`packages/minds` holds the Mind skeleton (DESIGN.md 13). Nothing schedules it
yet. `new Mind({ backend, governor, recorder }).think(request)` asks the
governor first, then the backend, records one usage row per backend call and
returns `ok` with a reply, `deferred` (try again later), `refused` (fall back
to reflex) or `error` with a typed `MindError`.

| File | Holds |
|---|---|
| `src/reply.ts` | The reply schema (commands plus notes) as JSON schema, and its validator |
| `src/types.ts` | `MindRequest`, `MindBackend`, `UsageRow`, `MindError` and its codes |
| `src/fake.ts` | The fake backend: recorded replies by prompt hash, or scripted rules |
| `src/claude.ts` | The `claude -p` backend: the exact flags, an empty temp working dir per call |
| `src/governor.ts` | Calls per real hour and day, the conversation rate limit, interval stretch |
| `src/mind.ts` | `Mind` and an in-memory usage recorder |

The `claude -p` backend takes the absolute binary path and the model per tier
from config. Its process runner is injected, so tests stub it. No test runs
the real `claude`. Tests use `FakeBackend`. To record a reply for a prompt,
call `fake.record(request, reply)` or pass `recordings` keyed by
`promptHash(request)`.

## Adding things

How to add a building, a good, a command and an agent type is written here as
each of those systems lands.

### A command

1. Add its type to `Command` and its name to `COMMAND_TYPES` in
   `packages/protocol/src/index.ts` (typecheck fails until both match), and
   a case to `parseCommand`.
2. Give it a cost in `ATTENTION_COST` in `packages/sim/src/attention.ts`.
   Routine automation costs 0. The table's type and
   `attention.test.ts` both fail without an entry.
3. Add its handler to `dispatch` in `packages/sim/src/apply.ts`. Validate in
   full before changing anything. `apply()` checks and charges attention for
   every command, and charges only on success.

### Attention

Each Op has `attention`, refilled to `ATTENTION_PER_DAY` (40, in protocol)
by `tick()` at every day boundary (`refillAttention`). A command that costs
more than the Op has left is rejected with `insufficient_attention`.

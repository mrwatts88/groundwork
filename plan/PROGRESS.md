# Progress

Append-only. One entry per session: date, item, Did, Verified, Learned, Next.

## 2026-11-11, setup session (design interview)

- **Did:** interviewed Matt over five rounds and wrote DESIGN.md: a persistent
  isometric building game in the browser where the player is one builder
  operation among AI peers. No combat, no mayor role. Copied the Ark build
  process (PROCESS.md, /next, /wrap, /plan-ring, /ring-review, verifier,
  plan.py, hooks) and wrote the Ring 0 plan.
- **Decisions:** D-001 to D-008 in DESIGN.md section 24. Matt's late call:
  run NPC minds through `claude -p` on the Fedora box instead of the API.
- **Verified:** a lean `claude -p` call on the Fedora box with
  `--system-prompt`, `--setting-sources ''`, `--strict-mcp-config`,
  `--tools ''` and `--json-schema` returned `structured_output` in 2.5 s with
  about 1.2k tokens. `plan.py lint` passes.
- **Learned:** without those flags, a headless call carries about 74k tokens of
  Claude Code context. `claude` lives at `~/.local/bin/claude` on the Fedora
  box and is not on the non-interactive PATH. The Fedora box has Node 22 but no
  pnpm or corepack. Linger is on, so systemd user services survive logout.
- **Next:** R0-03 workspace scaffold. Matt: R0-01.

## 2026-11-11, setup session (continued)

- **Did:** added /autopilot (main session stands in for Matt, builders and the verifier run as subagents). Matt activated the wider allowlist. Matt approved the GitHub repo and chose public (R0-01 done, D-009). R0-02 now checks PUBLIC and scans history for secrets before the first push.
- **Learned:** subagents cannot spawn subagents, so the autopilot main session runs the verifier between builder and wrap. The auto-mode classifier blocks agents editing .claude/settings.json. Changes go in scripts/agent/claude-settings.json for Matt to copy.
- **Next:** /autopilot from a fresh session in ~/code/groundwork, starting with R0-02.

## 2026-11-11, R0-03 workspace scaffold

- **Did:** pnpm workspace with protocol, sim, minds, server and client packages. Each tsconfig extends `tsconfig.base.json` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes). A root `vitest.config.ts` runs every `packages/*/src/**/*.test.ts`. The Makefile `ts-check` step prints the typecheck and Vitest runs, and installs first if `node_modules` is missing. Added README.md and docs/dev.md.
- **Verified:** verifier PASS R0-03. typecheck and 6 tests across 5 packages pass. A type error in sim makes `make check-fast` exit 2.
- **Learned:** `pnpm add` now pulls TypeScript 7 and Vitest 5. `@types/node` defaults to 26, so it is pinned to 22 to match the runtime. Packages export TS source with no build step. That is fine for Vite and Vitest, but the server will need a build or a TS loader before it runs under plain Node on the Fedora box (R0 deploy item). No push yet, because R0-02 (the remote) is waiting on Matt.
- **Next:** R0-04 sim core. Matt: R0-02.

## 2026-11-11, R0-04 sim core

- **Did:** seeded Mulberry32 RNG with its state in the world, integer value-noise mapgen (six terrain kinds, deposits richer farther out, a 6x6 starting claim per Op), tick (1 game minute, finishes road builds), `apply(world, command)` with `place_road` and typed errors, FNV state hash, `run(world, log, ticks)`, and a scripted scenario. Protocol has the Command, CommandResult and Terrain types. `pnpm test:slow` runs `scripts/check-determinism.sh`, which compares two node processes.
- **Verified:** verifier PASS R0-04. 10000 ticks give the same hash twice, and two processes print hash=659408debd1ae3d5. Invalid roads leave the hash unchanged. The purity scan catches a planted Date. check-fast is green with 25 tests.
- **Learned:** Node 22 runs the sim TS directly with `--experimental-strip-types`, so use const objects, not enums. The scenario log is redundant (each tile is tried twice), so dropping one entry does not change the hash. Tests that need a changed outcome must remove every command for a tile. Push pending R0-02.
- **Next:** R0-07 minds skeleton. Matt: R0-02.

## 2026-11-11, R0-05 server

- **Did:** server package with a clock (present 1x, speed-up to 4x, away at 0.25x after 15 idle minutes), HTTP `GET /health`, a WebSocket at `/ws` (welcome with the full state, a tick delta every tick, command results, errors for bad frames), and SQLite through `node:sqlite` (a snapshot every game day, the command log since, the tick reached). On start it replays the log to the tick reached. Config comes from GROUNDWORK_* variables. Protocol gained the wire types, game date and a hand-written client message parser. Sim gained toSnapshot and fromSnapshot. D-010 records node:sqlite, ws and the parsers in place of zod for now.
- **Verified:** verifier PASS R0-05. A real server and ws client: the road shows up in the next delta, bad commands get errors, a restart keeps the same tick and hash (also across snapshot boundaries), and the away mode switches off and back on. A manual SIGTERM at tick 23 resumed at tick 23. check-fast is green with 44 tests.
- **Learned:** Node 22.23 has `node:sqlite` on the Mac and on the Fedora box. It prints an ExperimentalWarning, so the start script passes `--no-warnings`. Without `--preserve-symlinks`, workspace packages resolve outside node_modules, so `--experimental-strip-types` runs the server's TS straight from source with no build step. A command accepted between ticks is stamped with the current tick, which matches `run()` replay order. Commands at the reached tick must be applied after `run()`. Push pending R0-02.
- **Next:** R0-07 minds skeleton. Matt: R0-02.

## 2026-11-11, R0-06 client

- **Did:** client package with Vite 8 and PixiJS 8: isometric 2:1 projection and camera, a client copy of the world built from welcome and tick deltas, a renderer that draws placeholder terrain in 16x16 chunks (redrawn on change, culled off screen), drag and arrow pan, wheel and +/- zoom, Home to centre on your land, road mode that sends `place_road`, and a DOM HUD with date, clock speed and mode, speed buttons and cash. The server serves the built client at `/` (`static.ts`, `GROUNDWORK_CLIENT_DIR`). There is a Playwright smoke test on a fresh test server on port 8791, and `make check` runs it.
- **Verified:** verifier PASS R0-06. Smoke 2 of 2: map screenshot shows six terrain kinds, a click places a road seen in the screenshot (pixel diff) and on the server, and the HUD date and speed are read from the DOM. `/`, `/health` and `/ws` share one port. check-fast is green with 55 tests.
- **Learned:** Playwright 1.65 needed a fresh `pnpm exec playwright install chromium`, and headless Chromium renders Pixi WebGL fine. For a pixel-diff check, park the pointer away from the tile, or the hover outline changes the clip. `window.groundwork` gives tests tile-to-screen coordinates without guessing. Push pending R0-02.
- **Next:** R0-07 minds skeleton. Matt: R0-02.

## 2026-11-11, R0-07 minds skeleton

- **Did:** minds package with the Mind interface and typed MindError, a reply schema (commands plus notes) as JSON schema and a validator built on `parseCommand`, a FakeBackend (recordings by sha256 prompt hash, or scripted rules), a ClaudeCliBackend (the exact 13.4 flags, absolute binary and models per tier from config, an empty temp working dir per call, an injected process runner), a BudgetGovernor (120 deliberation calls per real hour, optional daily cap, its own conversation rate limit, low priority refused from 80 percent, interval stretch) and `Mind.think`, which writes one usage row per backend call through an injected recorder. docs/dev.md has a minds section.
- **Verified:** verifier PASS R0-07. 81 tests pass with claude off the PATH. No test spawns claude. check-fast is green.
- **Learned:** on the Mac, `claude` sits in the nvm node bin dir next to `node`, so "claude off the PATH" needs a scratch bin dir with only node and pnpm symlinked. Avoid TS parameter properties in packages the server imports, because `--experimental-strip-types` cannot erase them. Push pending R0-02.
- **Next:** nothing agent-actionable until Matt does R0-02.

## 2026-11-11, R0-02 publish the repo

- **Did:** scanned the full history before the first push, created the public repo mrwatts88/groundwork with `gh repo create --public --source . --push`, and pushed main. Added D-011: Matt keeps his personal email as commit author and committer in the public history.
- **Verified:** verifier PASS R0-02 on the third run. Visibility PUBLIC, HEAD equals origin main, clean tree. No keys or tokens anywhere, no email in file content. The first two runs failed on the email in commit metadata: first because no decision recorded it, then because the verifier could not see Matt's consent. Quoting his question-dialog answers word for word cleared it.
- **Learned:** the autopilot permission classifier blocks creating a public repo even with an approved human item, so any public step needs Matt at the keyboard. Record an exception to an acceptance check as a DESIGN.md decision before the action, and hand the verifier the human's exact words, or it fails the item.
- **Next:** R0-08 Fedora box prep.

## 2026-11-11, R0-08 Fedora box prep

- **Did:** installed pnpm 10.14.0 without sudo with `npm install -g pnpm@10.14.0 --prefix ~/.local` on the Fedora box, and cloned the public repo to `~/code/groundwork` there over https.
- **Verified:** verifier PASS R0-08. pnpm 10.14.0, clone HEAD equals origin/main, and the lean 13.4 `claude -p` call from an empty dir returned structured_output with about 1.1k input plus cache tokens.
- **Learned:** with `--system-prompt` set, almost all input tokens land as cache_creation, not input_tokens. Count all three fields when checking cost. `npm --prefix ~/.local` puts tools in `~/.local/bin` without sudo.
- **Next:** R0-09 deploy script and systemd user service.

## 2026-11-11, R0-09 deploy

- **Did:** `scripts/deploy.sh` (Mac: push, then ssh to pull and run `scripts/deploy-remote.sh`, which installs, builds, links the units from `deploy/` into `~/.config/systemd/user`, enables them, restarts and prints health). `groundwork.service` on port 7400 with data in `~/.local/share/groundwork`, an optional env file at `~/.config/groundwork/env` and MemoryMax 1G. `groundwork-backup.service` and `.timer` run `scripts/backup.sh` nightly (sqlite3 `.backup`, keep 14). docs/dev.md has a Deploy section.
- **Verified:** verifier PASS R0-09. Deploy printed health. The tick rose over 10s from the Mac. A restart resumed at the same tick. The service is enabled and the timer is listed. A backup was written, and retention left 14.
- **Learned:** with no client the clock is away at one tick per 10 real seconds, so a 10 second health check passes with little margin. Use 12 seconds. Port 7400 was reachable from the Mac with no firewall change. Non-interactive ssh has XDG_RUNTIME_DIR, so `systemctl --user` works over ssh.
- **Next:** R0-10 live mind smoke on the Fedora box.

## 2026-11-11, R0-10 live mind smoke

- **Did:** `SqliteUsageRecorder` in `packages/minds/src/sqlite.ts` writes a `mind_usage` table into the world's groundwork.db. `packages/minds/scripts/smoke.ts` (`pnpm --filter @groundwork/minds smoke`) makes one real `claude -p` call as Ada Fenwick through Mind, the governor and that recorder.
- **Verified:** verifier PASS R0-10. Schema-valid place_road reply, usage row with 1607 tokens on haiku and ok 1, and the script stays out of every check.
- **Learned:** a lean deliberation call costs about 1.6k tokens and 6 seconds on haiku. `/usr/bin/node` is on the non-interactive ssh PATH, so only pnpm and claude need absolute paths. The recorder sets busy_timeout so it can share the db with the running server.
- **Next:** R0-11 ring 0 end-to-end check.

## 2026-11-11, R0-11 ring 0 end-to-end check

- **Did:** `tests/rings/ring0.sh` runs make check, determinism, `/health` on laptop.local:7400 and the live minds smoke over ssh. Row in docs/dev.md.
- **Verified:** verifier PASS R0-11. Script ended ring0: ok, shellcheck clean on the Fedora box.
- **Learned:** shellcheck is not on the Mac. Lint a script with `ssh -o BatchMode=yes laptop "shellcheck -S warning -" < file`. The Fedora clone only updates on deploy, so the smoke there runs the deployed code.
- **Next:** R0-review.

## 2026-11-11, R0-review Ring 0 review

- **Did:** ran make check-fast, make check and tests/rings/ring0.sh, and checked every Ring 0 done-when line and the section 1 invariants. Fixed the one gap: README "How to play" still said the server was not deployed. Tagged `ring-0` on a502f25, pushed main and the tag, and deployed with health ok.
- **Verified:** verifier PASS R0-review. ring0.sh ended ring0: ok. Determinism hash 659408debd1ae3d5 matched in both processes. A service restart resumed at the same tick. Playwright on laptop.local:7400 drew the map with no errors. One live claude-cli call on haiku was schema-valid. No Math.random or Date in the sim, and tests never call a real model.
- **Learned:** the item's acceptance asks for the ring-N tag, but the ring-review skill tags only after PASS. Under autopilot the builder tagged locally before READY and pushed after PASS.
- **Process:** proposal for Matt: in the ring-review skill, tag before the verifier runs and push the tag only on PASS (delete it on FAIL). Also, shellcheck is missing on the Mac, so `make check-fast` only syntax-checks scripts there. Installing it (`brew install shellcheck`) would close that gap.
- **Next:** R1-plan. R0-look waits on Matt and does not gate it.

## 2026-11-11, R1-plan Ring 1 planning

- **Did:** broke Ring 1 into R1-01 to R1-20, then R1-review, R1-playtest (Matt, does not gate) and R2-plan. The order is breadth first: world shape, people, client view, attention, staking, depot, harvester, market and trucks with a cash ledger, client vehicles, town growth, rival reflex, rival leader Mind, land offers, offers inbox, conversation Mind, chat panel, live smoke per agent type, deploy, docs, ring1.sh. DESIGN.md 23.2 now has a Ring 1 done-when list. D-012 sets the ore loop (harvester to depot, truck to market, roads on frontier, owners as parties, reflex actors through apply() and not logged, Minds act only as themselves, fresh world on the box).
- **Verified:** verifier PASS R1-plan on the second run. The first run failed because R1-playtest had no effort. That run also flagged a missing check on the rival reflex's information limits, so R1-11 and R1-review now cover invariant 2.
- **Learned:** plan-ring wants effort on every item, human ones too. Ring 0's human items lack it, so do not copy them. Plan order is build order, because `plan.py next` sorts only by in_progress.
- **Next:** R1-01. Matt: R0-look (does not block).

## 2026-11-11, R1-01 world shape for Ring 1

- **Did:** tile owner values now index `world.parties` (frontier, Ops, town, people) with `partyOf` and `tileOwner` as the one lookup. createWorld places a 7x7 town nearest the map centre: dry, no deposits, water within 6 tiles of every tile, a road cross and a market. Then 6x6 claims for player and rival, 3 tiles clear of the town. Snapshots and the hash carry the format, the parties and the town. The store records `world_format` and renames an older db to `groundwork.format-<N>.db`. `/health` has the town and the Op ids. D-013 was added.
- **Verified:** verifier PASS R1-01. world.test.ts covers 8 seeds. The server tests cover Ring 0 db migration and /health. Determinism hash 4224adb46ea86fc0 matched in both processes, the smoke passed, and check-fast ran 100 tests.
- **Learned:** owner values used to be "op index + 1", and apply, scenario, the determinism test and the client all assumed that. Going through partyIndex removed the assumption. A determinism test that picks "an owned tile" has to pick an Op tile now, because town tiles are owned too. Close the sqlite handle before renaming a WAL db, so the -wal file is checkpointed.
- **Next:** R1-02 named people.

## 2026-11-11, R1-02 named people

- **Did:** `packages/sim/src/people.ts` gives the town 6 named people from the world RNG, each a person party after the town, with a name, a job, a home on a town tile off the roads, two traits from a fixed list of 12 and an asking factor of 80 to 180 percent. The first three own a 4x4 dry parcel kept 3 tiles clear of the town, the first within 10 tiles of a deposit. People travel in the snapshot, the welcome state and the hash. The client names a person's land on click and draws it with a light blue border. WORLD_FORMAT is 3. D-014 was added.
- **Verified:** verifier PASS R1-02 on the second run. The first run failed only on the docs rule: the new border and owner names had no player-facing line in docs/dev.md. people.test.ts covers 8 seeds and the 64x64 map. Determinism hash 6e80b98b432ae1ab matched in both processes, the smoke passed 2 of 2, and check-fast ran 121 tests.
- **Learned:** people are placed after the Op claims, so the claims draw from the RNG in the same order as before and keep their spots. Any change a player can see (a border colour, HUD text) needs its line in docs/dev.md in the same item, or the verifier fails it.
- **Next:** R1-03 client town, land overlay and inspector panel.

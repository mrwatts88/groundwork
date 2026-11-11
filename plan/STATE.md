# State

Rewritten at the end of every session. Under 40 lines.

**Ring:** 0, foundation.
**Works now:** the design (DESIGN.md) and the build process (PROCESS.md,
skills, hooks, plan) are in place. The repo is public at
https://github.com/mrwatts88/groundwork and `main` is pushed (R0-02). A pnpm
workspace with five packages (protocol, sim, minds, server, client), strict
TypeScript and Vitest is in place. `make check-fast` typechecks every package
and runs the unit tests. The sim core is in (R0-04): a seeded 128x128
map, a seeded RNG, a tick, `apply(world, command)` with `place_road`, and a state
hash. `make slow` checks that two processes reach the same hash. The server
is in (R0-05): `pnpm --filter @groundwork/server start` serves `/health` and a
WebSocket at `/ws`, runs the present, speed-up and away clock, and keeps a
daily SQLite snapshot plus the command log, so a restart resumes exactly.
The client is in (R0-06): `pnpm build`, then start the server and open
`http://localhost:8787` to see the isometric map, pan and zoom, lay roads on
your land and watch the date and clock speed in the HUD. `make check` runs
the Playwright smoke test. A lean headless `claude -p` NPC call was proven on the Fedora box
(DESIGN.md 13.4). The Fedora box is prepped (R0-08): pnpm 10.14.0 in `~/.local/bin` and a clone at `~/code/groundwork`. The minds skeleton is in (R0-07): a Mind with a fake
backend, a `claude -p` backend, schema-checked replies, a budget governor
(120 calls per hour) and a usage row per call in the `mind_usage` table. A live smoke (R0-10) proved one real call on the box. Nothing schedules minds yet. `tests/rings/ring0.sh` (R0-11) runs the whole Ring 0 check from the Mac.
The world server runs on the Fedora box (R0-09) as the `groundwork` systemd
user service at `http://laptop.local:7400`. Deploy with `scripts/deploy.sh`
from the Mac. Backups go to `~/groundwork-backups/` nightly, keeping 14.

**Next (agent):** R0-review, the Ring 0 review (high effort). It runs `tests/rings/ring0.sh`.
**Waiting on Matt:** nothing. R0-look comes after R0-review. **In progress, blocked:** nothing.
**Notes for the next session:** development is on the Mac
(`cd ~/code/groundwork && claude`, then `/next`). The world server runs on
the Fedora box. The world lives in `~/.local/share/groundwork` there. On the Fedora box, `claude` and `pnpm` live in
`~/.local/bin`, which non-interactive ssh does not have on its PATH. Use
absolute paths. Packages export their `src/index.ts` directly and imports
inside a package use the `.ts` extension. The server runs its TS directly
with `node --experimental-strip-types`. The toolchain is TypeScript 7 and
Vitest 5. Sim test files typecheck under `packages/sim/tsconfig.test.json`,
which has node types. The src tsconfig has none, which keeps node out of the sim.
Client e2e and config files typecheck under `packages/client/tsconfig.node.json`.

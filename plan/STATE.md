# State

Rewritten at the end of every session. Under 40 lines.

**Ring:** 0, foundation.

**Works now:** the design (DESIGN.md) and the build process (PROCESS.md,
skills, hooks, plan) are in place. The repo is local on the Mac. A pnpm
workspace with five packages (protocol, sim, minds, server, client), strict
TypeScript and Vitest is in place. `make check-fast` typechecks every package
and runs the unit tests. The sim core is in (R0-04): a seeded 128x128
map, a seeded RNG, a tick, `apply(world, command)` with `place_road`, and a state
hash. `make slow` checks that two processes reach the same hash. The server
is in (R0-05): `pnpm --filter @groundwork/server start` serves `/health` and a
WebSocket at `/ws`, runs the present, speed-up and away clock, and keeps a
daily SQLite snapshot plus the command log, so a restart resumes exactly.
Nothing is visible yet. A lean headless `claude -p` NPC call was proven on the Fedora box
(DESIGN.md 13.4).

**In progress:** nothing.

**Next (agent):** R0-07 minds skeleton, then whatever `plan.py next` lists.

**Waiting on Matt:** R0-02 publish the public repo. Until it lands there is no
`origin` remote and nothing has been pushed. Commits from R0-03 on are local.

**Blocked:** nothing.

**Notes for the next session:** development is on the Mac
(`cd ~/code/groundwork && claude`, then `/next`). The world server will run on
the Fedora box. On the Fedora box, `claude` and later `pnpm` live in
`~/.local/bin`, which non-interactive ssh does not have on its PATH. Use
absolute paths. Packages export their `src/index.ts` directly and imports
inside a package use the `.ts` extension. The server runs its TS directly
with `node --experimental-strip-types`. The toolchain is TypeScript 7 and
Vitest 5. Sim test files typecheck under `packages/sim/tsconfig.test.json`,
which has node types. The src tsconfig has none, which keeps node out of the sim.

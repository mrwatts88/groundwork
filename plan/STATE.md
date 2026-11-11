# State

Rewritten at the end of every session. Under 40 lines.

**Ring:** 1, first playable. Planned: R1-01 to R1-20, then R1-review.
**What Matt can play now:** same as Ring 0. Open `http://laptop.local:7400`
(`http://laptop-ts:7400` away from home), pan, zoom, press Home and lay roads
with R. There is no economy yet.
**At the end of Ring 1 Matt will be able to:** stake a deposit, lay roads to
it and to the town, build a depot, run a harvester and a truck, sell ore to
the town and watch it grow. A rival Op does the same, steered by a Mind. He
can talk to the town's six named people and buy land from an offer card in
chat. Every Op gets 40 attention points a day. The Ring 0 world on the Fedora
box is replaced by a fresh one, and its db file is kept (D-012).
**What Matt will need to do in Ring 1:** only R1-playtest, after the review.
**Works now (for the agent):** pnpm workspace (protocol, sim, minds, server,
client), strict TypeScript, Vitest. `make check-fast` runs plan lint,
typecheck and unit tests. `make check` adds determinism and the Playwright
smoke. The sim has `apply(world, command)` with `place_road` only. The server
runs the clock, SQLite snapshots and the command log, and resumes exactly.
Minds have fake and `claude -p` backends and a governor. Nothing schedules
them yet. The service runs on the Fedora box on port 7400.

**Next (agent):** R1-01, world shape (parties, town, rival, format version).
**Waiting on Matt:** R0-look. Open the world, place a few roads, and add notes
on the look to plan/PLAYTEST.md. It blocks nothing.
**In progress, blocked:** nothing.
**Notes for the next session:** the Ring 1 rules are DESIGN.md 23.2 done-when
and decision D-012. Plan order is build order. Development is on the Mac. On
the Fedora box, `claude` and `pnpm` live in `~/.local/bin`, off the
non-interactive PATH, so use absolute paths. Packages export `src/index.ts`
and imports inside a package use the `.ts` extension. The server runs TS with
`node --experimental-strip-types`, so no enums or parameter properties.
Sim tests typecheck under `packages/sim/tsconfig.test.json`, client e2e under
`packages/client/tsconfig.node.json`. shellcheck runs only on the Fedora box.

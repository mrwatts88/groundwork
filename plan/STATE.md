# State

Rewritten at the end of every session. Under 40 lines.
**Ring:** 1, first playable. Planned: R1-01 to R1-20, then R1-review.
**What Matt can play now:** open `http://laptop.local:7400`
(`http://laptop-ts:7400` away from home), pan, zoom, press Home and lay roads
with R. The town has a light border, the rival's claim a red one, and three
parcels owned by named people a light blue one. Clicking a tile names its
owner. Older worlds are kept as groundwork.format-<N>.db. No economy yet.
**At the end of Ring 1 Matt will be able to:** run the ore loop (stake, roads,
depot, harvester, truck, sell to a growing town) against a Mind-led rival,
chat with six named people and buy land in chat, on 40 attention a day.
**What Matt will need to do in Ring 1:** only R1-playtest, after the review.
**Works now (for the agent):** pnpm workspace (protocol, sim, minds, server,
client), strict TypeScript, Vitest. `make check-fast` runs plan lint,
typecheck and unit tests. `make check` adds determinism and the Playwright
smoke. The sim has `apply(world, command)` with `place_road` only. Tile
owners index a party list (frontier, Ops, town, people) via `partyOf`. The
world has one town with roads and a market, 6x6 claims for player and rival
(D-013), and 6 named people with homes, jobs, traits and asking factors, three
owning a 4x4 parcel, one near a deposit (D-014). WORLD_FORMAT is 3. The server
runs the clock, SQLite snapshots and the command log, and resumes exactly.
Minds have fake and `claude -p` backends and a governor, not yet scheduled.
`/health` has the town name and the Op ids. Service: Fedora box, port 7400.
**Next (agent):** R1-03, client town, land overlay and inspector panel.
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
New party kinds go at the end of `world.parties`, since owner values index it.
Bump WORLD_FORMAT when an old save can no longer load.

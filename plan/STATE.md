# State

Rewritten at the end of every session. Under 40 lines.
**Ring:** 1, first playable. Planned: R1-01 to R1-20, then R1-review.
**What Matt can play now:** open `http://laptop.local:7400`
(`http://laptop-ts:7400` away from home). Pan, zoom, Home. The sidebar has
Road (R), Stake (C: claim fee, 6 hour survey) and Depot (B: $1,500, 8 hour
build, $100 a day wage, idle if unpaid). T centres on the town, O colours land
by owner, a click opens the inspector. The HUD shows attention as N/40.
Harvesters run in the sim but get browser buttons only in R1-09. No ore trade yet.
**At the end of Ring 1 Matt will be able to:** run the ore loop (stake, roads,
depot, harvester, truck, sell to a growing town) against a Mind-led rival,
chat with six named people and buy land in chat, on 40 attention a day.
**What Matt will need to do in Ring 1:** only R1-playtest, after the review.
**Works now (for the agent):** pnpm workspace (protocol, sim, minds, server,
client), strict TypeScript, Vitest. `make check-fast` runs plan lint,
typecheck and unit tests. `make check` adds determinism and the Playwright
smoke. `apply(world, command)` has `place_road`, `stake_claim` (D-016),
`place_building` (`BUILDING_SPEC`, D-017), `buy_vehicle` and `set_route`
(`VEHICLE_SPEC`, `findPath`, depot `ore` stock, D-018), charging attention
from `ATTENTION_COST` (D-015). Tile owners index a party list via `partyOf`.
One town with a market, 6x6 claims (D-013), 6 named people (D-014).
WORLD_FORMAT is 3. The server runs the clock, SQLite snapshots and the command
log, and resumes exactly. Minds have fake and `claude -p` backends and a
governor, not yet scheduled. Rival name is config (`opNames`). Port 7400.
**Next (agent):** R1-08 market, trucks and the cash ledger (a truck is a
`VEHICLE_KINDS` row plus a case in `act()`), then R1-13. **Blocked:** nothing.
**Waiting on Matt:** R0-look. Open the world and add notes to plan/PLAYTEST.md.
**Notes for the next session:** Ring 1 rules are DESIGN.md 23.2 and D-012.
Plan order is build order. On the Fedora box, `claude` and `pnpm` live in
`~/.local/bin`, off the non-interactive PATH. Packages export `src/index.ts`,
imports inside a package use `.ts`. The server runs TS with
`--experimental-strip-types`, so no enums or parameter properties. shellcheck
runs only on the Fedora box. New party kinds go at the end of `world.parties`.
Bump WORLD_FORMAT when an old save can no longer load. A new command needs
`COMMAND_TYPES` and an `ATTENTION_COST` entry (docs/dev.md "A command").
Playwright has a fast-clock server on 8792 (25 ms ticks) for timed checks.
`harvesterSite()` in sim scenario.ts finds a deposit, road line and depot site.

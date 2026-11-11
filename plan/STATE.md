# State

Rewritten at the end of every session. Under 40 lines.

**Ring:** 1, first playable. Ring 0 is done, reviewed and tagged `ring-0`.
**What Matt can play now:** open `http://laptop.local:7400` in a browser on
the home network (`http://laptop-ts:7400` away from home). You see an
isometric 128x128 map with water, grass and desert, and your plot outlined.
Drag or use the arrow keys to pan, scroll to zoom, press Home to find your land
and R to lay roads on it. The HUD shows the date, the clock speed and your
cash. The world keeps running on the Fedora box when nobody is watching. There
is no economy yet.
**Works now (for the agent):** a pnpm workspace with five packages (protocol,
sim, minds, server, client), strict TypeScript and Vitest. `make check-fast`
runs plan lint, typecheck and the unit tests. `make check` adds determinism
and the Playwright smoke. The sim is seeded and deterministic, with
`apply(world, command)` and only `place_road` so far. The server runs the sim
on the present, speed-up and away clock, keeps a daily SQLite snapshot plus
the command log, and resumes exactly after a restart. The minds package has
a Mind with a fake backend, a `claude -p` backend, schema-checked replies, a
budget governor (120 calls per hour) and a `mind_usage` row per call. Nothing
schedules minds yet. `tests/rings/ring0.sh` runs the whole Ring 0 check.
The server runs as the `groundwork` systemd user service on the Fedora box,
port 7400. Deploy with `scripts/deploy.sh` from the Mac. Backups go to
`~/groundwork-backups/` nightly, keeping 14.

**Next (agent):** R1-plan, plan Ring 1 (high effort).
**Waiting on Matt:** R0-look. Open the world, place a few roads, and add notes
on the look to plan/PLAYTEST.md. It does not block R1-plan.
**In progress, blocked:** nothing.
**Notes for the next session:** development is on the Mac. The world lives in
`~/.local/share/groundwork` on the Fedora box. There, `claude` and `pnpm`
live in `~/.local/bin`, which non-interactive ssh does not have on its PATH,
so use absolute paths. Packages export `src/index.ts` directly and imports
inside a package use the `.ts` extension. The server runs its TS with
`node --experimental-strip-types`. TypeScript 7 and Vitest 5. Sim tests
typecheck under `packages/sim/tsconfig.test.json`, client e2e under
`packages/client/tsconfig.node.json`. shellcheck runs only on the Fedora box.

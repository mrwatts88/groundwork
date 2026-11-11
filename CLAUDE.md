# Groundwork

A persistent isometric building game in the browser, with AI-run NPCs and
rival operations. The design is `DESIGN.md`. How it gets built across sessions
is `PROCESS.md`. Read the DESIGN.md sections your item names, not the whole
file.

## Every session

1. The SessionStart hook prints `plan/STATE.md`, the next items and the git log.
2. `make check-fast` before anything new. A red clean tree is the first item.
3. One item: `scripts/agent/plan.py start <id>`, build it, verify it, `/wrap`.
4. Never stop with uncommitted or half-done work. Split the item instead.
5. `/autopilot` runs items back to back in subagents. Under autopilot a
   builder replies `READY <id>` instead of spawning the verifier itself.

## Commands

- `scripts/agent/plan.py next` lists actionable items. `human` lists Matt's.
  `show <id>`, `start <id>`, `done <id> --evidence "..."`,
  `block <id> --reason "..."`, `status`, `lint`.
- `make check-fast`: plan lint, typecheck, unit tests. `make check` adds
  determinism, scenario, soak and client smoke suites.
- `scripts/deploy.sh` deploys to the Fedora box (once R0 lands).

## Rules

- Change only `status` and `evidence` in `plan/features.json`, and only through
  `plan.py`. Never weaken or delete an acceptance check.
- Done needs the `verifier` subagent's PASS, not your own judgment.
- If building proves DESIGN.md wrong, fix DESIGN.md and add a decision to
  section 24 in the same commit.
- Keep DESIGN.md section 1 invariants. Above all: every actor, the player
  included, changes the world only through the one command API, and the sim
  stays deterministic (no `Math.random`, no `Date` in `packages/sim`).
- Automated tests use the fake Mind backend. Never call a real model in a test
  unless the item says it is a live smoke test.
- Matt's items (owner `human`) carry exact commands, one path, no options.
- Copy in docs and in-game text: no em dashes, no semicolons, plain sentences.
- Secrets never enter the repo.

## Gotchas

- Development is on the Mac. The world server runs on the Fedora box
  (`ssh laptop`, or `ssh laptop-ts` away from home). Use
  `ssh -o BatchMode=yes` in scripts.
- The Fedora box has 15 GB of RAM and also runs Ark and Vigil work. Keep the
  server lean.
- NPC minds share Matt's Claude subscription with his own coding sessions. The
  budget governor (DESIGN.md 13.5) must stay on.
- Keep this file under 100 lines.

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

## Adding things

How to add a building, a good, a command and an agent type is written here as
each of those systems lands.

# State

Rewritten at the end of every session. Under 40 lines.

**Ring:** 0, foundation.

**Works now:** the design (DESIGN.md) and the build process (PROCESS.md,
skills, hooks, plan) are in place. The repo is local on the Mac. A pnpm
workspace with five packages (protocol, sim, minds, server, client), strict
TypeScript and Vitest is in place. `make check-fast` typechecks every package
and runs the unit tests. No game code yet. A lean headless `claude -p` NPC
call was proven on the Fedora box (DESIGN.md 13.4).

**In progress:** nothing.

**Next (agent):** R0-04 sim core, R0-07 minds skeleton. `/autopilot` runs
them back to back.

**Waiting on Matt:** R0-02 publish the public repo. Until it lands there is no
`origin` remote and nothing has been pushed. Commits from R0-03 on are local.

**Blocked:** nothing.

**Notes for the next session:** development is on the Mac
(`cd ~/code/groundwork && claude`, then `/next`). The world server will run on
the Fedora box. On the Fedora box, `claude` and later `pnpm` live in
`~/.local/bin`, which non-interactive ssh does not have on its PATH. Use
absolute paths. Packages export their `src/index.ts` directly and imports
inside a package use the `.ts` extension. The toolchain is TypeScript 7 and
Vitest 5.

---
name: wrap
description: Finish a Groundwork work item. Verifies it with the independent verifier, marks it done, updates the state and progress files, commits and pushes. Use when an item's acceptance checks pass, or when ending any Groundwork session.
---

Follow PROCESS.md section 3.1 step 6. Do these in order and do not skip any.

1. **Verify independently.** Spawn the `verifier` subagent with the item id.
   Give it only the id. If it reports FAIL, fix the problem and run it again.
   Never mark an item done on your own judgment.
2. **Clean tree.** `make check-fast` is green. No stray files, no debug code,
   no half-finished parts. Anything not done is finished now or split out
   (`scripts/agent/plan.py block <id> --reason "split: ..."`) with the
   remainder described in PROGRESS.md.
3. **Mark it done** with the verifier's report as evidence:
   `scripts/agent/plan.py done <id> --evidence "verifier: PASS <id> ..."`.
4. **Design.** If this item changed the design, DESIGN.md is updated and the
   decision is in section 24, in this same set of commits.
5. **Rewrite `plan/STATE.md`** (under 40 lines): ring, what works now (what
   Matt can see or play), in progress, next agent items, waiting on Matt (with
   item ids), blocked, notes for the next session.
6. **Append to `plan/PROGRESS.md`**: date, item id, Did, Verified, Learned,
   Next. Learned is the most valuable line. If a gotcha will recur, also add
   it to CLAUDE.md's Gotchas.
7. **Commit and push:** `git add -A && git commit -m "<id>: <title>"`, then
   `git push origin main` once the remote exists. If the item changed the
   server or client and deploy exists, run `scripts/deploy.sh`.
8. Tell Matt in a few lines: what now works, what is next, and anything
   waiting on him, with the exact command.

Then the session is over. The next item starts in a fresh session (`/clear`,
then `/next`).

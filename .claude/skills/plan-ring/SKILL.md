---
name: plan-ring
description: Break the next Groundwork ring into session-sized plan items with concrete acceptance checks. Use when the next actionable item is RN-plan.
---

Follow PROCESS.md section 3.2. Run at high effort.

1. `touch plan/.planning` (allows item changes, gitignored).
2. Read DESIGN.md section 23.2 for ring N, the sections the ring touches, the
   previous ring's review result, PROGRESS.md entries since the last planning
   session (especially Learned lines and split items), and plan/PLAYTEST.md.
   Matt's playtest notes outrank the original ring outline: if he said
   something is not fun, fixing that comes first.
3. Write ring N's items into plan/features.json. Each item:
   - fits one session: one coherent change, testable on its own. Prefer more,
     smaller items to fewer large ones.
   - has `design` refs, `depends_on`, `owner` (`agent` or `human`), `effort`
     (`low`, `medium` or `high`), and `acceptance` checks that are commands or
     observable results a verifier can run (a test name, a scenario assertion,
     a screenshot check, a curl). "Works", "feels good" or "is clean" are not
     checks.
   - Matt's items carry exact `commands` or `instructions` (one path, no
     options) and cover only what needs him.
4. Order breadth first: the thinnest playable version of every piece before
   any piece is filled out. Docs items next to the features they document.
5. Add `tests/rings/ringN.sh` as an item: the end-to-end script the review
   runs. End the ring with `RN-review` (depending on every gating item, its
   acceptance is the ring's done-when plus "the commit is tagged ring-N"),
   then `RN-playtest` (owner human, gates_ring false) and `R(N+1)-plan`
   depending on `RN-review`.
6. Spawn the verifier to check the items against the ring's outline in
   DESIGN.md, then mark `RN-plan` done:
   `scripts/agent/plan.py done RN-plan --evidence "verifier: PASS RN-plan ..."`.
7. `scripts/agent/plan.py lint`, commit the new items
   (`git add -A && git commit -m "RN-plan: ..."`), then `rm plan/.planning`
   and lint again. Outside planning, lint compares against HEAD, so it must
   pass now that the items are committed.
8. Update DESIGN.md section 23.2 if planning sharpened the ring's done-when.
   Rewrite STATE.md with a short summary of the ring for Matt (what he will be
   able to play at the end of it, what he will need to do), append to
   PROGRESS.md, commit and push.

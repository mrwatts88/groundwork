---
name: ring-review
description: Review a finished Groundwork ring against its done-when with a fresh verifier, turn gaps into items, tag and deploy the ring. Use when the next actionable item is RN-review.
---

Follow PROCESS.md section 3.3. Run at high effort.

1. `scripts/agent/plan.py start RN-review`.
2. Run `make check` and `tests/rings/ringN.sh` yourself and read the real
   output.
3. Spawn the `verifier` subagent for `RN-review`. It checks every done-when
   line from DESIGN.md section 23.2 for ring N, and every invariant in section
   1 that the ring touches. Skip style.
4. If anything fails: block `RN-review` with the reason, run a short planning
   pass (plan-ring skill steps 1, 3 and 7) that adds fix items to ring N, and
   stop. The review runs again after the fixes.
5. If everything passes:
   - `scripts/agent/plan.py done RN-review --evidence "verifier: PASS RN-review ..."`
   - `git tag ring-N` and `git push origin ring-N`.
   - Deploy with `scripts/deploy.sh` (from Ring 0 on) and confirm the health
     check.
   - Rewrite STATE.md: what Matt can now play, said plainly, with the URL, and
     the playtest item waiting on him.
   - Append the review to PROGRESS.md, commit and push.
6. Re-examine the process: if a hook, rule or step was never needed this ring,
   or a failure kept recurring that no rule caught, say so in PROGRESS.md and
   propose the change to PROCESS.md for Matt.

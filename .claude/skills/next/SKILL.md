---
name: next
description: Start a Groundwork work session. Reads the current state, picks the next plan item, and runs the right kind of session (build, ring planning or ring review). Use at the start of every Groundwork session.
---

You are starting a Groundwork session. Follow PROCESS.md section 3.

1. If the session context from the SessionStart hook is not above, run
   `scripts/agent/session-context.sh` and read its output.
2. If it warned about uncommitted changes, deal with them first: if they are a
   coherent finished part of an item, verify and commit them. Otherwise revert
   them. Note what you did in plan/PROGRESS.md at wrap time.
3. Run `make check-fast`. If it fails on a clean tree, that failure is this
   session's work: fix it, commit, then continue.
4. Run `scripts/agent/plan.py next` and take the first actionable item. If an
   item is already in progress, that is the one.
   - An `RN-plan` item: follow the plan-ring skill for ring N.
   - An `RN-review` item: follow the ring-review skill for ring N.
   - Anything else: a build session.
5. For a build session:
   - `scripts/agent/plan.py start <id>`, then `scripts/agent/plan.py show <id>`.
   - Read the DESIGN.md sections it names and the code it touches. Nothing
     more until you need it. Use subagents for wide searches and log reading.
   - If the item says high effort and this session is not at high effort, tell
     Matt to run `/effort high` before you start building.
   - Build in small commits whose messages start with the item id. Tests with
     the code. Docs with the feature.
   - When the acceptance checks pass for you, finish with the wrap skill.
6. If no agent item is actionable, say exactly what it is waiting on, show
   `scripts/agent/plan.py human`, and stop. Do not invent work outside the plan.

Tell Matt in one or two sentences which item you are taking and why, then work.

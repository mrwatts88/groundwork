# How Groundwork gets built

Groundwork is built by Claude across many separate sessions. No session
remembers the last one, so everything that matters between sessions lives in
files in this repo. This document is the process. `CLAUDE.md` is the short
version every session loads automatically. The process is the one proven on
Ark (`~/code/ark/PROCESS.md`), adapted for a game.

## 1. Principles

1. **State lives in files, not in chat.** The plan, the progress log and the
   design are the memory.
2. **One item per session.** Each session takes one item from the plan,
   finishes it to a clean, committed state, and stops.
3. **Breadth first, in rings.** Rings come from DESIGN.md section 23. A ring
   finishes before the next starts, so there is always a playable build.
4. **Rolling-wave planning.** Only the current ring is broken into items. The
   next ring is planned after the current one is reviewed.
5. **Done means proven.** An item is done only when its acceptance checks pass
   and an independent verifier (a fresh subagent) has rerun them.
6. **The plan's checks are fixed.** A build session may change an item's status
   and evidence, nothing else. Only a planning session changes items.
7. **Rules that must hold are hooks, not prose.** Session-start context and
   stop-time checks are hooks. `CLAUDE.md` is advice.
8. **The design is the source of truth.** If building proves DESIGN.md wrong,
   fix it and add a decision to section 24 in the same commit as the code.
9. **Matt does only what only Matt can do:** pay, sign up, log in, type his
   sudo password, and decide on money, his machines and anything public. And
   play the game: playtest notes are his to give.
10. **Fun is checked by Matt, everything else by tests.** Ring reviews end with
    a short playtest item for Matt. His notes feed the next ring's planning.
11. **Re-examine the process when the model changes.** Remove scaffolding that
    is no longer load-bearing.

## 2. The files

| File | What it holds | Who changes it |
|---|---|---|
| `DESIGN.md` | The game design, architecture, build plan (23), decisions (24) | Any session, with a decision entry |
| `PROCESS.md` | This document | Rarely, deliberately |
| `CLAUDE.md` | Short rules, commands, gotchas (under 100 lines) | When a gotcha recurs |
| `plan/features.json` | Every work item: ring, owner, deps, acceptance checks, status, evidence | Status and evidence only, through `scripts/agent/plan.py`. Items only in planning sessions |
| `plan/STATE.md` | Current state in under 40 lines | Rewritten every session |
| `plan/PROGRESS.md` | Append-only log, one entry per session | Appended every session |
| `plan/PLAYTEST.md` | Matt's playtest notes, newest first | Matt, or a session transcribing what he said |

## 3. Sessions

Matt starts every session the same way, on the Mac:

```
cd ~/code/groundwork && claude
/next
```

### 3.1 Build session (`/next`)

1. **Orient.** The SessionStart hook prints STATE.md, the next items, Matt's
   open items and the git log. Read the item's DESIGN.md sections and only the
   code it touches.
2. **Check the ground.** `make check-fast`. If it fails on a clean tree, fixing
   that is the session's item.
3. **Claim one item:** `scripts/agent/plan.py start <id>`, the first one
   `plan.py next` lists.
4. **Build it.** Small commits starting with the item id. Tests with the code.
   Docs with the feature.
5. **Verify.** Run the acceptance checks, then spawn the `verifier` subagent
   with the item id. On FAIL, fix and verify again.
6. **Wrap** (`/wrap`): mark done with the verifier's evidence, rewrite STATE.md,
   append PROGRESS.md, commit, push.

If an item is bigger than one session, finish a coherent part, block the item
with reason "split: ...", and describe the rest in PROGRESS.md.

### 3.2 Ring planning (`/plan-ring N`)

Runs when `plan.py next` offers `RN-plan`, at high effort. Breaks ring N into
session-sized items with concrete checks, using DESIGN.md section 23, the last
review, PROGRESS.md Learned lines and PLAYTEST.md.

### 3.3 Ring review (`/ring-review N`)

The ring's last agent item, at high effort. A fresh verifier runs
`tests/rings/ringN.sh` and checks the done-when. Gaps become items. On pass,
tag `ring-N`, deploy to the Fedora box, and add Matt's playtest item for the
ring.

## 4. Rules

- **Effort.** Build sessions at medium. Planning, reviews, design changes and
  stubborn bugs at high.
- **Context.** One item per session. Subagents for noisy work. Needing
  `/compact` means the item was too big.
- **Matt's items.** Owner `human`. Exact commands, one path, no options.
- **Decisions.** Engineering decisions are the agent's, recorded in DESIGN.md
  section 24 when expensive to reverse. Money, Matt's machines and anything
  public are Matt's.
- **Models.** Automated tests never call a real model. Live `claude -p` calls
  happen only in items that say so.
- **Git.** Work on `main` in small green commits. The process authorizes
  pushing to this repo's own remote at wrap time and deploying to the Fedora
  box with `scripts/deploy.sh`. Nothing else is published.
- **Where it runs.** Code on the Mac. The world server on the Fedora box
  (`ssh laptop`, or `ssh laptop-ts` away from home).

## 5. Enforcement

| Guarantee | How |
|---|---|
| Every session starts with the current state | `SessionStart` hook: `scripts/agent/session-context.sh` |
| The plan stays valid and settled items are not rewritten | `scripts/agent/plan.py lint`, in the `Stop` hook and `make check-fast` |
| A session cannot stop with broken code it touched | `Stop` hook: `scripts/agent/stop-check.sh` |
| Done is verified independently | the `verifier` subagent, required by `/wrap` and `plan.py done` |
| Secrets are not read | deny rules in `.claude/settings.json` |

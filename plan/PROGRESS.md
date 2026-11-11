# Progress

Append-only. One entry per session: date, item, Did, Verified, Learned, Next.

## 2026-11-11, setup session (design interview)

- **Did:** interviewed Matt over five rounds and wrote DESIGN.md: a persistent
  isometric building game in the browser where the player is one builder
  operation among AI peers. No combat, no mayor role. Copied the Ark build
  process (PROCESS.md, /next, /wrap, /plan-ring, /ring-review, verifier,
  plan.py, hooks) and wrote the Ring 0 plan.
- **Decisions:** D-001 to D-008 in DESIGN.md section 24. Matt's late call:
  run NPC minds through `claude -p` on the Fedora box instead of the API.
- **Verified:** a lean `claude -p` call on the Fedora box with
  `--system-prompt`, `--setting-sources ''`, `--strict-mcp-config`,
  `--tools ''` and `--json-schema` returned `structured_output` in 2.5 s with
  about 1.2k tokens. `plan.py lint` passes.
- **Learned:** without those flags, a headless call carries about 74k tokens of
  Claude Code context. `claude` lives at `~/.local/bin/claude` on the Fedora
  box and is not on the non-interactive PATH. The Fedora box has Node 22 but no
  pnpm or corepack. Linger is on, so systemd user services survive logout.
- **Next:** R0-03 workspace scaffold. Matt: R0-01.

## 2026-11-11, setup session (continued)

- **Did:** added /autopilot (main session stands in for Matt, builders and the verifier run as subagents). Matt activated the wider allowlist. Matt approved the GitHub repo and chose public (R0-01 done, D-009). R0-02 now checks PUBLIC and scans history for secrets before the first push.
- **Learned:** subagents cannot spawn subagents, so the autopilot main session runs the verifier between builder and wrap. The auto-mode classifier blocks agents editing .claude/settings.json. Changes go in scripts/agent/claude-settings.json for Matt to copy.
- **Next:** /autopilot from a fresh session in ~/code/groundwork, starting with R0-02.

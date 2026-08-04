# 0126 — a command that writes outside the project can say so first

Status: Accepted
- Date: 2026-08-03
- Builds: 0125
- Enforced by: tests/integration/features/dry-run-writes-nothing.test.ts (both dry runs leave a redirected HOME byte-identical, and the entry uninstall would remove survives) — the assertion is proven to discriminate: --dry-run leaves 1 file where a real setup writes 7

## Context

`setup` and `uninstall` were the last two commands the todo37 sweep had not measured, and they could
not be measured, because **running them to find out what they do is the same act as letting them do
it.** Both write outside the project:

| command | reaches into |
|---|---|
| `setup` | the Claude Desktop config, `~/.claude/skills`, `~/.conducks/projects.json`, and a `.conducksignore` in the project |
| `uninstall` | the Claude Desktop config, and the conducks skills in every scope that has them |

Neither offered a confirmation or a preview. `uninstall` writes a `.bak` of the config before editing
it, which is why this was recorded as a gap rather than a defect — but a command that edits a file in
`~/Library/Application Support` on the strength of one word should be able to say what it would touch
beforehand.

## Decision

**Both take `--dry-run`**, printing every destination and what would happen at each — including
whether the MCP entry is present, whether this root is already registered, and whether the ignore
file already exists and would be left alone. Nothing is written.

This is not a courtesy. It is what makes the two commands **measurable**: the sweep's whole method is
to run a command and compare its behaviour to a written expectation, and that was impossible for
these two without side effects on the user's machine.

## Consequences

- Verified by checksumming the user's real `claude_desktop_config.json` before and after both
  dry-runs: **unchanged**.
- The dry-run also answered a question worth knowing: this machine's Claude config **does** carry a
  `conducks` MCP entry, so `uninstall` here would have removed a live integration. Not running it was
  correct.
- `watch` was measured and is correct — it detects changes, writes its liveness heartbeat, and states
  plainly that it is read-only and that `analyze` is what persists. Its one blemish was
  `[Watcher Debug]` reaching shipped output on every file event, the same shape as the `[DEBUG]`
  lines ADR 0122 removed from `diff`; those now go through the logger at debug level.
- `mirror` was measured and is correct — serves on port 3333, HTTP 200.
- **The sweep now covers all 39 commands.** `setup` and `uninstall` remain unexercised in their
  WRITING form by deliberate choice; what is now guaranteed is that anyone can see what they would do
  before deciding.

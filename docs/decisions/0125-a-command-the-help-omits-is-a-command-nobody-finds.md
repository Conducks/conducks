# 0125 — a command the help omits is a command nobody finds

Status: Accepted
- Date: 2026-08-03
- Builds: 0111, 0124
- Enforced by: tests/unit/interfaces/cli/help-covers-every-command.test.ts (every command file appears in help output) — run against the unfixed build first, it failed naming exactly the seven

## Context

Phase 4 of the sweep: `clean`, `doctor`, `monitor`, `watch`, `setup`, `uninstall`, `mcp`, `mirror`,
`help`.

`help` renders from a HARDCODED map of command ids grouped into domains. It receives the real command
list in its constructor and uses it only to look descriptions UP — never to check the map is
complete. Measured: **32 of 39 commands listed.** The seven missing:

```
coverage   coverage-view   docs-lint   docs-status   ledger   monitor   supply-chain
```

Every one works. `docs-lint` is the documented CI gate. `coverage` and `coverage-view` are what ADR
0116 was spent fixing. None could be discovered from the tool itself.

## Decision

**The seven are assigned to domains** — that fixes today.

**Anything the map forgets still prints, under `OTHER`** — that fixes tomorrow. The next command
added and forgotten here appears in an untidy group rather than nowhere, so the failure mode is
cosmetic instead of a feature nobody knows exists.

The test reads the command DIRECTORY, so adding a file is enough to be covered by it.

## Consequences

- **Four of Phase 4's nine commands were measured and found correct**: `doctor` (six real checks,
  each naming what it verified), `clean` (purges the vault to zero, leaves source untouched, and its
  description says exactly that), `monitor`, and `mcp` (`--sse` verified live on port 3001).
- **`monitor` was nearly recorded as defective and is not.** It reported a branch mismatch naming a
  branch belonging to no part of this project — which turned out to be `mentorseed`, a different
  registered root, correctly labelled with its own name and path. The header had been cut off by the
  command used to read the output. That is the fourth finding this session refuted by looking again,
  and the reason the rule is *verify before recording*.
- **`setup` and `uninstall` were NOT run, deliberately.** Both mutate the user's real Claude Desktop
  config at `~/Library/Application Support/Claude/claude_desktop_config.json`, and neither offers a
  confirmation or a `--dry-run`. `uninstall` does write a `.bak` first, which is why this is recorded
  as a gap rather than a defect — but a command that edits a file outside the project on the strength
  of one word should be able to say what it would do before doing it. Left for a decision rather than
  changed unilaterally.
- No regression: **1,436 tests green**.

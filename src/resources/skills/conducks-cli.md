<!-- description: Manual for the conducks CLI. Use when running analysis, coverage, docs, or lifecycle commands from the terminal. -->

# Conducks CLI Guide

Every command takes an optional trailing `[path]` and defaults to the current directory.

**Two layers, and the difference decides whether a command works right now.** `docs-status`,
`docs-lint`, `monitor`, `bootstrap-docs` and `help` read authored markdown and the filesystem: no vault,
no grammars, no graph, so they answer on a project that was never analyzed. Everything else reads the
graph and needs `conducks analyze` first.

## Core loop
- `conducks analyze [path] [--force] [--staged] [--yes]` — build/refresh the structural graph (the pulse)
  - incremental by mtime: a file untouched since the last pulse is not re-parsed. `--force` re-inducts everything
  - `--yes` bypasses the scope guard's prompt. With no TTY, anything above `ok` is a refusal
- `conducks clean` — wipe the vault for a fresh full analyze
- `conducks status [--mode pulse] [--file <path>] [--json]` — health, node/edge counts, density, staleness, hotspots
- `conducks doctor` — environment check: Node, DuckDB, **which parse path is live** (native vs Gnosis fallback), vault age, and whether a newer release exists

## Docs (the conducks-docs grammar)
- `conducks docs-status [--json] [--all] [--root-only]` — open work: each ADR with unfinished phases, the next task in each, what is blocked
- `conducks docs-lint [--root-only]` — validate against the grammar; **exits 1** on violation (the CI gate)
- `conducks bootstrap-docs [name]` — scaffold the grammar file set into `docs/`
- `conducks monitor [--json] [--stale]` — every registered project: graph freshness, docs violations, architecture notes describing changed code
  - `--dismiss <module>` = "checked, still accurate"; `--dismiss <module> --intent <adr|todo|path>` when an enhancement landed, and the address must exist

**Both docs commands are RECURSIVE.** A monorepo keeps a `docs/` per deployable unit, so they read the
root tree AND every unit tree. A single-repo project has one tree and its output is unchanged — you
never have to know which case you are in.

```
✓ (root)            43 governed docs conform to the grammar.
✓ admin             3 governed docs conform to the grammar.
✖ app               1 file(s) violate the grammar:
✓ packages/core     3 governed docs conform to the grammar.
```

`docs-lint` fails if ANY tree fails, which is what makes it a real gate: the old root-only behaviour
reported 43 docs clean and exited 0 while a broken phase sat unread in `app/docs/`.

Trees stay SEPARATE, never merged — `todo01#P2` only resolves inside its own tree, and merging would
lose which unit an address belongs to. `docs-status --json` returns a map keyed by tree for a monorepo,
and the bare board for a single repo. `--root-only` on either command restores the single-tree run.

## Coverage & drift (the overlay)
- `conducks coverage <coverage-final.json> [--all] [--json]` — per-function fill % + branch coverage
- `conducks coverage --save-baseline` / `--vs-baseline` — snapshot + "was 86% → now 0% (BROKE)" drift
- `conducks coverage-view <cov.json> [--out x.html] [--watch]` — self-contained HTML overlay, live re-render

## Architecture governance
- `conducks audit [--fallback] [--history=<window>]` — cycles (ARCH-3), self-imports (ARCH-4), **mutual call tangles (ARCH-6)**, god objects, orphans
  - ARCH-6 is informational and never fails the audit: mutual recursion is legal, a knot with no entry order is not, and only a human tells them apart
- `conducks guard [--threshold=N] [--force]` — layer contract + cycles + rank rules; blocks violations
- `conducks advise` — structural advice · `conducks ledger` — the decision/architecture ledger
- `conducks drift [prevPulseId]` · `conducks diff [--base <id>] [--head <id>]` — structural change between pulses
- `conducks supply-chain [--deps-only]` — third-party surface, with each import's origin

## Symbol intelligence
- `conducks query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>] [--json]`
  - `conducks query "*"` is the INVENTORY: every symbol by structural gravity, heaviest first, for reading a codebase top-down instead of searching a name you already know
- `conducks explain <id>` — 6-signal risk breakdown · `conducks context <id> [--json]`
- `conducks impact <id> [upstream|downstream] [--tree]` — blast radius · `conducks trace <id> [--flow]` · `conducks flows`
- `conducks entry` — real entry points · `conducks list` — all nodes · `conducks cohesion <id1> <id2>`
- `conducks entropy <id>` — authorship entropy · `conducks fallback` — suspicious fallback patterns
- `conducks prune` — dead code: ORPHAN, UNUSED_EXPORT, STALE_IMPORT
  - advisory, and it deliberately under-reports. Verify by SYMBOL, never by import path, before deleting anything
- `conducks rename <id> <new> [--confirm]` — graph-verified rename

## Lifecycle
- `conducks setup` — install skills into `~/.claude/skills`, register the project, configure MCP, write `.conducksignore`
  - skills are GLOBAL only; a repo-local copy is a duplicate that loads twice, and setup prunes one if it finds it
- `conducks uninstall` — remove the skills conducks installed
- `conducks mcp [--sse] [--root <path>]` — run the MCP server (stdio by default)
- `conducks watch` — live re-analysis on save · `conducks mirror` — web dashboard on port 3333
- `conducks link <path>` — link a neighbouring repo · `conducks resonance <path>` · `conducks record --type <t> "content"`

## Two things that surprise people
- **A running `analyze` locks the vault.** Every graph-reading command FAILS while a pulse writes — it
  does not queue, and the error says so. The docs layer keeps working throughout. Wait and retry.
- **Native parsing is optional.** If the `tree-sitter` binding could not build, conducks still analyzes
  through the Gnosis regex extractor at lower fidelity. `conducks doctor` tells you which you are on.

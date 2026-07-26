<!-- description: Manual for the conducks CLI. Use when running analysis, coverage, docs, or lifecycle commands from the terminal. -->

# Conducks CLI Guide

## Core loop
- `conducks analyze [path]` — build/refresh the structural graph (the pulse)
- `conducks clean [path]` — wipe the vault for a fresh full analyze
- `conducks status [path]` — health, node counts, staleness

## Coverage & drift (the overlay)
- `conducks coverage <coverage-final.json> [--all] [--json]` — per-function fill % + branch coverage
- `conducks coverage --save-baseline` / `--vs-baseline` — snapshot + "was 86% → now 0% (BROKE)" drift
- `conducks coverage-view <cov.json> [--out x.html] [--watch]` — self-contained HTML overlay, live re-render

## Docs (conducks-docs grammar)
- `conducks docs-status [--json] [--all]` — open work from the docs: each ADR with unfinished phases, the next task in each, what is blocked
- `conducks docs-lint` — validate docs against the grammar; exits 1 on violation (CI gate)
- `conducks bootstrap-docs [name]` — scaffold the grammar file set into docs/

## Architecture governance
- `conducks guard [--threshold=N] [--force]` — layer contract + cycles + rank rules; blocks violations
- `conducks audit [--fallback] [--history=<window>]` / `advise` — structural audit + advice
- `conducks status --blueprint` — integrity readout (cycles/orphans/violations) printed to stdout; writes nothing
- `conducks drift [prevPulseId]` / `diff` — structural change between pulses

## Symbol intelligence
- `conducks query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>] [--json]`
- `conducks explain <id>` · `context <id> [--json]`
- `conducks impact <id> [upstream|downstream] [--json] [--tree]` · `trace <id> [--flow]` · `flows`
- `conducks rename <id> <new> [--confirm]` — graph-verified rename · `prune` — dead-path cleanup

## Lifecycle
- `conducks setup` — install skills + configure MCP · `mcp [--sse]` — run the MCP server
- `conducks watch` — live re-analysis on file change · `conducks mirror` — web dashboard (port 3333)

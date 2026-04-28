<!-- conducks:start -->
# Conducks — Code Intelligence

This project is indexed by Conducks as **conducks** (1027 symbols, 2605 relationships, 80 execution flows). Use the Conducks MCP tools to understand code, assess impact, and navigate safely.

> If any Conducks tool warns the index is stale, run `npx conducks analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `conducks_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `conducks_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `conducks_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `conducks_context({name: "symbolName"})`.

## When Debugging

1. `conducks_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `conducks_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ conducks://repo/conducks/process/{processName}` — trace the full execution flow step by step
4. For regressions: `conducks_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `conducks_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `conducks_context({name: "target"})` to see all incoming/outgoing refs, then `conducks_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `conducks_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `conducks_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `conducks_rename` which understands the call graph.
- NEVER commit changes without running `conducks_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `conducks_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `conducks_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `conducks_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `conducks_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `conducks_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `conducks_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `conducks://repo/conducks/context` | Codebase overview, check index freshness |
| `conducks://repo/conducks/clusters` | All functional areas |
| `conducks://repo/conducks/processes` | All execution flows |
| `conducks://repo/conducks/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `conducks_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `conducks_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the Conducks index becomes stale. Re-run analyze to update it:

```bash
npx conducks analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx conducks analyze --embeddings
```

To check whether embeddings exist, inspect `.conducks/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/conducks/conducks-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/conducks/conducks-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/conducks/conducks-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/conducks/conducks-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/conducks/conducks-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/conducks/conducks-cli/SKILL.md` |

<!-- conducks:end -->

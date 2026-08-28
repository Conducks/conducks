# 0180 — the base had no completeness check
Status: Accepted
- Date: 2026-08-27
- Builds: 0160, 0169
- Enforced by: tools/benchmark/oracle-nodes-python.mjs, tools/benchmark/oracle-nodes-ts.mjs

## Context

`analyze` is the base of the octopus: every other command reads the graph it builds. Seven oracles
scored what the arms SAY, and none scored whether the base contains what the source declares.

`oracle-packs.mjs` comes closest and stops one step short — it asks whether a pack's QUERIES capture
what its grammar declares, which is a question about the query file. Whether a capture becomes a NODE
is a different event, and it is the one every arm downstream reads.

The failure that hides here is silent in a way no other is. A declaration with no node is invisible to
`prune`, `trace`, `impact` and `context` **at once**, and all four look correct while missing it,
because absence produces no output anywhere.

## Decision

**Two oracles, one per benchmarked language, scoring declarations against nodes.**

- Python, against `ast` — the standard library, a genuinely independent parser, and the same choice
  `oracle-python.mjs` made for the same reason.
- TypeScript, against `ts.createProgram` over the project's tsconfigs — the compiler's own parser, the
  same machinery `oracle-exports.mjs` uses.

Keyed by **file + name, not line**. A node's recorded line is a separate claim with its own failure
mode, and folding them together would report a line drift as a missing symbol.

## Consequences

- Measured, cold, on every subject:

  | target | declarations | missing |
  |---|---|---|
  | scraper (Python) | 1,207 | **0** |
  | sofie (Python) | 114 | **0** |
  | sofie (TypeScript) | 1,452 | **0** |
  | orchestrator (TypeScript) | 569 | **0** |
  | conducks (TypeScript) | 471 | **0** |

- **Both are proved by catching a dropped capture**, which is the only thing that makes a zero mean
  anything: removing Python's `function_definition` capture takes scraper from 0 to **1,060** missing;
  removing TypeScript's `interface_declaration` capture takes sofie from 0 to **69**.
- Removing the TS `class_declaration` capture moves the number by only **1** — classes are minted by
  more than one pattern. Recorded because it is a fact about conducks worth knowing: redundancy in the
  captures means a single deleted pattern is not always visible, and a mutation that barely moves is
  not proof the check is weak.
- **The oracle was wrong before analyze was, again.** Its first run reported 14 declarations in
  `scripts/qa/fixtures.mjs` as having no node — the program is built with `allowJs` and walks `.mjs`,
  while the graph query matched only `.ts*`. The graph held 24 nodes for that file. An oracle whose
  two sides disagree about which files are in scope reports the difference as a defect in the tool.
- `oracle:nodes`, `oracle:nodes:sofie`, `oracle:nodes:ts`, `oracle:nodes:ts:sofie`,
  `oracle:nodes:ts:orch` — all five in `npm run gate`.

### What this does not cover

Edges — a node can exist with every relationship missing, which is prune's and trace's oracles.
Nested declarations, whose scoping is its own subject. Line numbers. And the nine grammars with no
subject, which remains the largest hole in the whole method.

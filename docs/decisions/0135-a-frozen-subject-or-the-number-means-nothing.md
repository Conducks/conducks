# 0135 — a frozen subject, or the number means nothing

Status: Accepted
- Date: 2026-08-04
- Builds: 0077, 0112, 0114, 0133
- Amends: 0133 — its Python claim rested on reading a grammar file, and the join lost two thirds of what it harvested
- Enforced by: tools/benchmark/health.mjs — `--compare` exits 1 on drift; tests/unit/core/parsing/doc-comments.test.ts covers the defect it found
- Amended by: todo44 — the second benchmark this record calls "not built yet" was built: `tools/benchmark/vs-grep/` (8 pre-registered tasks, re-run recorded in results.md) plus the per-symbol doc-truth witness. Correctness is measured against hand-derived truth now, not only shape

## Context

Every number this project reports has been measured on the repository that was changing while it was
measured. Node counts moved from 5,412 to 5,626 inside a single session, and a verification script
that hardcoded `Nodes: 5429` produced three FALSE failures before anyone noticed the SUBJECT had moved
rather than the tool. A benchmark whose subject changes measures nothing at all.

There is a second problem underneath that one. A tool tested only on the repository it lives in is
tested on the code its author already understands. The bugs it finds are the bugs already known.
`conducks analyze` has never been measured against a Python codebase, a monorepo with workspaces, or
an Electron two-process split — and ADR 0133 stated Python docstrings were covered on the strength of
reading a grammar file, having never run against Python at all.

Three real projects were available, each already frozen and never to receive another commit:

| subject | shape | why it is here |
|---|---|---|
| `subject-a` | 167 Python files | the non-TypeScript grammar path, and the honest test of ADR 0133 |
| `orchestrator` | 955 units, npm workspaces, Next.js | the phantom-node territory of ADR 0108 |
| `subject-c` | 1,095 units, Electron main/preload/renderer | a shape that is NOT hexagonal, so the decision table has something it must decline to name |

## Decision

**A benchmark subject is pinned by git SHA, and the run refuses to proceed if the subject moved or is
dirty.** A number that changes while the SHA holds is a change in conducks. That is the only claim
this instrument is allowed to make.

**Every rate is printed with its count, always.** A rate improves when the denominator is destroyed:
delete nodes and the dangling percentage falls while the graph gets worse. ADR 0077 records this
happening. `dangling 2897/16674 (17.37%)` cannot be gamed the way `17.37%` can.

**A gate exiting non-zero is a verdict, not a crash.** `audit` exits 1 when it finds violations, which
is what a gate is for; counting that as a failure reported two of three honest codebases as breaking
conducks. Gates may exit 0 or 1; above 1 is still a crash.

**`analyze` is always run with `--force`.** Without it the incremental path reuses the vault, and on a
subject pinned by SHA nothing ever changes — so the timing collapses to the cost of deciding to skip.
Measured: 932 ms incremental against 6,744 ms for the real work. The first version of this benchmark
reported the 932.

**Timings are reported and never compared.** A shared machine makes wall-clock a weak signal, and a
benchmark that fails on load is a benchmark people learn to ignore.

## Consequences

The first run found a defect that had survived a full command sweep, because every check that could
have caught it was run on TypeScript.

**Python docstrings were harvested and then thrown away.** The Python AST says 606 functions in
`subject-a` carry a docstring; conducks had attached 198. Modules: 69 carry one, conducks had attached
1. Instrumenting the join printed the cause immediately:

```
[TARGETS] [["logging_setup.py",1],["job_name",7],["setup_logging",7], ...]
```

`job_name` is the PARAMETER of `setup_logging`. Both are recorded at line 7, the parameter was
reached first, and ADR 0133 gives a comment to at most one symbol — so the parameter claimed the
docstring and the function got nothing. A function with no parameters kept its doc, which is why the
loss looked random instead of total. `DocTarget.rank` now breaks a tie within a line, and the inside
window starts AT the declaration rather than after it, which is what a module docstring needs.

Measured after the fix, on the same frozen subjects:

| subject | documented behaviors before | after |
|---|---|---|
| subject-a | 198/1,117 (17.7%) | 632/1,117 (56.6%) |
| orchestrator | 563/1,493 (37.7%) | 578/1,493 (38.7%) |
| subject-c | 916/2,936 (31.2%) | 988/2,936 (33.7%) |

**Recall was scored first and would have been enough to declare victory.** Scoring the TEXT against
the AST instead of counting attachments showed 17 FALSE attachments, each one a `# ------------` rule
that beat the real docstring whenever the signature wrapped. A benchmark that counts only what it
found cannot see what it found wrongly, so both axes are scored: 599 of 606 exact matches now, and 0
false attachments. Two rules did it — the inside search reaches the declaration's own `lineEnd` but
never past the next declaration, and a comment with no letter in it is refused as documentation.

The TypeScript counts FELL after that second rule, by 13 on orchestrator. That is junk leaving: all 27
refused comments there were rules and commented-out clock times. A number going down is not
automatically a regression, and the only way to tell is to look at what left.

**`located` was measuring nothing.** It read 81% on orchestrator, which looked like a fifth of the
graph having no position. The missing fifth was 488 directories, 42 npm packages and a folder of
markdown — none of which is a line of code. Counted on what CAN have a line, it is 100% on all three
subjects, so any value below 100% is now a real regression rather than a permanent shrug.

The first attempt at the fix changed nothing, and the benchmark said so. It ranked on `kind ===
'parameter'`, and Python reports its parameters as `kind: 'variable'` — so the check fired never.
Ranking on `canonicalKind === 'ATOM'` is what works. Without an instrument that re-measures, that fix
would have shipped as done.

`subject-a` re-analyzed twice from `--force` produced an identical graph, so the pipeline is
reproducible on a fixed input. That was assumed and had never been checked.

What this does NOT do: it does not check whether any individual answer is CORRECT. It measures shape,
integrity and cost. Correctness needs hand-derived truth per question, which is the second benchmark
and is not built yet (todo44).

Frozen subjects also do not replace running on live code. The duplicate route nodes and the `unit`
name collision both came from messy real code on this repository. Pinning fixes drifting numbers, not
unknown unknowns.

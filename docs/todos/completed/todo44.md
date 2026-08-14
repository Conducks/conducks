# todo44 — measure on something that does not move
Status: done

- Acceptance: two benchmarks exist and run from a clean checkout. `health.mjs --compare` exits 0 on all three frozen subjects and 1 on any drift. The vs-grep benchmark scores every task against expectations WRITTEN BEFORE the run, gives grep its best realistic invocation, and reports the tasks grep wins alongside the tasks it loses. Every claim of a win carries the raw output that supports it.
- Builds: 0135
- Depends: none

## Context

Conducks has only ever been measured on conducks. That is the repository whose bugs are already known,
whose grammar is TypeScript, and which changes between one measurement and the next — node counts moved
5,412 to 5,626 in one session, and a hardcoded expectation produced three false failures before anyone
noticed the subject had moved rather than the tool.

Three frozen subjects now exist, pinned by SHA and never to receive another commit: `subject-a` (167
Python files), `orchestrator` (955 units, npm workspaces, Next.js) and `subject-c` (1,095 units, Electron).
ADR 0135 records the rules the instrument obeys.

The second benchmark answers the question an investor asks: **grep is faster, why conducks?** The
measure is not milliseconds. Grep wins that and it is not the claim. The measure is whether the reader
can act on the output, or has to go and open a file.

## Phase 1 — Benchmark B: conducks measured against itself

- [x] `tools/benchmark/projects.json` pins each subject by SHA, with a stated reason for its presence
- [x] `health.mjs` REFUSES to run on a subject that moved off its SHA or has uncommitted changes — a dirty subject is not a frozen one
- [x] Every rate prints with its count. `dangling 2897/16674 (17.37%)` cannot be gamed by deleting the denominator the way `17.37%` can
- [x] `analyze` runs with `--force`, because incremental reuse always hits on a subject that never changes — the first version reported 932 ms for work that costs 6,744
- [x] A gate exiting 1 is a verdict, not a crash — `audit` reported two of three honest codebases as failures until `GATES` existed
- [x] `--save` writes a baseline, `--compare` diffs against it and exits 1 on drift
- [x] Baselines committed for all three subjects, all nine smoke commands surviving on each
- [x] Reproducibility CHECKED, not assumed: `subject-a` analyzed twice from `--force` produces an identical graph

## Phase 2 — what the first run found

- [x] Python docstrings measured against the AST rather than against a grammar file: 606 functions carry one, conducks had attached 198; 69 modules carry one, conducks had attached 1
- [x] Root cause instrumented rather than guessed — a PARAMETER shares its function's declaration line, sorted first, and claimed the docstring under the one-owner rule of ADR 0133
- [x] `DocTarget.rank` breaks a tie within a line so a declaration outranks its parameter; the inside window starts AT the declaration so a module docstring is reachable
- [x] The first fix ranked on `kind === 'parameter'` and changed NOTHING — Python reports its parameters as `kind: 'variable'`. The benchmark is what caught it; ranking on `canonicalKind === 'ATOM'` is what works
- [x] Result on the frozen subjects: subject-a 198 to 548 behaviors, orchestrator 563 to 591, subject-c 916 to 990. Suite green at 1,494
- [x] Scored on BOTH axes, because recall alone rises by attaching anything: text compared against the AST docstring, not merely counted. Before the reach fix — 496 exact matches and 17 FALSE attachments, every false one a `# ------` rule that beat the real docstring whenever the signature wrapped
- [x] The reach is the declaration's own `lineEnd`, never past the next declaration — a constant cannot express that, since too small hides a wrapped signature's docstring and too large hands an inner function's docstring to its parent
- [x] A banner is not a description: a comment with no letter in it is refused. 27 refused on orchestrator, all of them rules and commented-out clock times, which is why the TypeScript count FELL by 13 and that fall is junk leaving
- [x] Result: 599 of 606 exact text matches, 0 false attachments. Behaviors 548 to 632 on subject-a
- [x] `located` was measuring nothing: the missing fifth on orchestrator was 488 directories, 42 npm packages and a folder of markdown, none of which is a line of code. On the honest denominator — a symbol in a file this repository owns — it is 100% on all three, so anything under 100% is now a real regression

## Phase 3 — is the doc gap OURS or the author's

- [x] `doc-truth.mjs` scores per symbol against the language's own parser — Python's `ast`, the TypeScript compiler — because a coverage percentage cannot tell "the authors wrote nothing" apart from "we lost what they wrote", and on Python it read 17.7% and was a bug
- [x] Answered: it is an AUTHOR gap. Of the symbols whose author wrote a doc, conducks carries 99.2% on subject-a, 99.3% on subject-c, 95.6% on orchestrator
- [x] The checker's OWN first version keyed by basename, which collapsed every `route.ts` and `index.ts` in a Next.js app together and reported 106 and 178 false attachments that were entirely its own bug. Keyed by full path: 4 and 1
- [x] A React component recorded as a variable — 123 PascalCase atoms in orchestrator's `.tsx` against 128 BEHAVIOR nodes across all 198 files. Fixed in ADR 0136: behaviors 1,493 to 1,836, and doc fidelity 88.5% to 95.6%
- [x] A linter directive served as documentation — `debounce` carried `eslint-disable-next-line @typescript-eslint/no-explicit-any`. Refused, anchored to the start so prose mentioning a directive survives
- [-] Four false attachments remain on orchestrator: a class-level JSDoc reaching a method declared beneath it. `registry.ts:43` and `:62` both carry the class's paragraph instead of their own — dropped by decision: the TypeScript compiler binds a JSDoc block to the NEXT declaration regardless of blank lines, so the vault's reading matches the language's own; the file-header rule that would have changed it was built, measured stealing 20 real symbol docs, and reverted (pinned by test). Residue re-measured 2026-08-06: 3 differs + 1 no-doc on 705 authored docs, 99.1%
- [x] 26 declarations on orchestrator still have no node at the author's line — down from 76, and the remainder is unexamined → examined via re-run 2026-08-06: the .mjs extensions fix landed and the residue is now 2 of 705 (99.1% text-match); subject-c 1 of 854 (99.5%), subject-a unchanged — the tail is the recorded file-header ambiguity class, not a missing parser

## Phase 4 — the unexplained 110

- [x] EXPLAINED, by running both arms against a seven-line file rather than reasoning about the pipeline: with the rule off, 7 of 7 arrow functions produced NO NODE AT ALL; with it on, 7 of 7 are BEHAVIOR
- [x] The chain: an arrow function was an ATOM, and `pruneTaxonomy` drops an ATOM with no non-structural edge. A component exported for another file has no reference inside its own file, so it had no edge, so it was deleted. Only the ones something in the same file called survived — `removeAttachment` is called by the component's own JSX and lived; `handleSubmit`, passed as an `onClick` prop, did not
- [x] So the defect was not mislabelling. Conducks was DELETING most React components, and the 123 PascalCase atoms measured on orchestrator were the survivors
- [x] `pruneTaxonomy` drops an unreferenced ATOM silently. Whatever it removes should be COUNTED and reportable, so the next symbol class it swallows is visible without a seven-line reproduction → built: counts per semantic kind, printed every analyze (`[Taxonomy] Pruned 3803 unreferenced value node(s): 2327 variable, 1475 property, 1 taxonomy`)

## Phase 5 — edge precision on the frozen subjects

- [x] `verify-edges.mjs` run against all three for the first time — every claim checked against the SOURCE, with `unchecked` stated rather than counted as a pass
- [x] subject-a 99.94% (5 wrong / 7,948), orchestrator 99.99% (2 / 14,239), subject-c 99.93% (14 / 20,108). 21 wrong edges across 42,295 checked
- [x] subject-c mints CALLS edges FROM markdown files — `docs/memory.md::unit -> said-server`. A doc that mentions a module is not a caller of it; find where a `.md` unit acquires call edges → found and fixed: the http-service-linker read URLs out of prose; PROSE_EXTENSIONS (md/mdx/rst/txt/adoc) are skipped in its link loop, pinned by test
- [x] The 24 remaining no-node declarations were `.mjs` — CLAIMED now (extensions fix). The doc-truth residue after it: 4 + 2 + 1 no-node, 4 + 1 false attachments (class JSDoc onto the method beneath), unexamined → examined 2026-08-06: residue is 2+1+0 no-node and 3+1+0 false attachments across the three subjects, all in the recorded compiler-convention class; rates 99.1% / 99.5% / 99.2%

## Phase 6 — Benchmark A: conducks against grep

- [x] Task set pre-registered and COMMITTED before either tool ran (`tools/benchmark/vs-grep/tasks.md`), truth hand-derived with rg — which biases truth toward grep, so conducks matching it is the strong direction
- [x] Grep given its best realistic form per task; the tasks grep should win included and reported: it won T2 (literal string) as predicted, and T8 reported as UNANSWERABLE for grep rather than zero
- [x] Scored on the four axes, raw outputs committed in `raw/` (`results.md`)
- [x] VERDICT: on Python, conducks LOSES its flagship question. `impact resolve_project_path` returned 0 callers against 10 measured call sites — every one calls through the module alias (`paths.resolve_project_path`), the normal Python form, and none of those references resolve. todo42 is not an improvement; it is the difference between winning and losing T3/T4
- [x] Second finding: a TRUE zero and a BROKEN zero print the same output. `impact classify` said 0 and was right; `impact resolve_project_path` said 0 and was wrong; the reader cannot tell. CONDUCKS-37 in its most expensive form
- [x] FIXED and re-measured (ADR 0137): three stacked defects — classifyOrigin speaks npm so the Python resolver was never consulted; the resolver compared lowercased against raw so it matched nothing on any path with an uppercase letter; `@named_import` was captured and consumed nowhere. `impact resolve_project_path`: 0 -> 11 symbols across 8 files, every production truth site present with its source line, direct/indirect marked
- [x] subject-a unresolved 2,897 -> 2,106 (17.4% -> 12.6%); precision holds at 99.93% with 1,066 more edges checkable; TS subjects byte-identical
- [x] The fix surfaced a REAL cycle conducks was blind to — foundation/__init__ -> job_runner -> logging_setup -> back, verified hop by hop; the authors break it at runtime with a function-local import at job_runner.py:98. `cycles 0 -> 1` in the baseline is a finding appearing, not a regression
- [x] `impact` zero-result honesty: state what was examined and how many references in this graph are unresolved, so an empty answer carries its own confidence — T7's true zero and T3's broken zero printed identically → built: an empty answer counts edges examined, unresolved references, and same-leaf-name unresolved, warning when the last is non-zero; pinned by test
- [x] `--depth` does not exist on `impact` — the pre-registered T4 command was wrong as written; decide whether depth control is wanted or the default depth is the contract → wanted and built: `--depth <n>` validated as a positive integer (an invalid value errors rather than silently defaulting), T4 re-run passes with it
- [x] Full re-run of tasks.md for the record once todo42's typed-receiver work lands — T3/T4 already re-measured above → run and recorded in tools/benchmark/vs-grep/results.md: T3 flipped 0/10 → 10/10 recall, T4 works with --depth, T7 zero states its basis, T8b answered by `conducks arch`

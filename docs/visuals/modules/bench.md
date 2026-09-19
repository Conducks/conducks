# bench — the benchmark

**Layer:** none. Dev tooling outside the layer contract (`sentinel-rules.ts`) — it drives the built
CLI (the `conducks` bin, `package.json:18`, compiled from
[interfaces/cli](interfaces/cli.md)) as a subprocess, exactly as a real user or agent would, and never
imports `src/lib/**` directly.

**Responsibility:** proving conducks' analysis correct and fast against shapes real code does not
reliably contain (`docs/decisions/0175-a-benchmark-asks-for-the-shape-an-oracle-cannot.md`), and
against frozen real subjects a live codebase would otherwise drift out from under. `npm run gate`
(`package.json:116`) is the one command that runs every scenario and every oracle against every
subject; anything cheaper leaves a subject unscored while still reporting green.

**Boundaries:** a benchmark scenario is not believed until it has been seen RED. Every scenario in
`tools/benchmark/bench-*.mjs` scores a specific mechanism in the analyzer it targets, and that
mechanism must be mutated — the guard removed, the filter widened, the anchor left in its own result
— and the SPECIFIC scenario written for it must fail, not some other scenario in the set going red by
coincidence. `mutate-cli-smoke.mjs`'s own opening comment states the rule generally ("a check written
after its fix has never been seen red, and one that cannot go red is a false positive wearing a
tick"), and `bench-context.mjs`/`bench-trace.mjs` carry it out concretely: removing context's
container filter fails scenario 06 ("a container is never returned"), widening its radius fails 03
and 04, and keeping the anchor in its own result fails 05 — each break named to the one scenario it
breaks. Six scenarios were found wrong (measuring the fixture, not the tool) before this discipline
caught them (`docs/decisions/0189-the-radius-is-the-claim.md`). No oracle is allowed to judge the
analyzer with the analyzer's own machinery — `oracle-tsc.mjs` and `oracle-context.mjs` each ask an
independently produced answer (the real `tsc`, or a hand-rolled graph walk) rather than re-deriving
one from conducks' own output.

**Uses:** [core/persistence](core/persistence.md) and [domain/analysis](domain/analysis.md) only
indirectly, through the built CLI it spawns as a child process against fixture repos it builds on the
fly (`bench-*.mjs`) or against three frozen real subjects pinned by git SHA in
`tools/benchmark/projects.json` (`oracle-*.mjs`, `health.mjs`).

## Features

- **Plant benchmarks** (`tools/benchmark/bench-{prune,trace,context,drift,guard,advise,diff,doctor,
  entry,flows,audit,list}.mjs`) — each builds small synthetic git repos and asks the built CLI a
  question, per scenario. Every scenario states both halves: what the command MUST find (recall) and
  what it must NOT find (precision) — a neighbourhood returning everything passes every inclusion
  check and one returning nothing passes every exclusion check, so a scenario missing either half is
  half a gate (`bench-context.mjs:31`). Counts measured directly: trace 10, context 10, prune 12,
  drift 10, entry 10, doctor 12, list 10, diff 8, audit 8, flows 7, guard 7, advise 5.
- **Oracles** (`tools/benchmark/oracle-*.mjs`) — score conducks against a SECOND, independently
  produced answer on the three frozen subjects, never against itself: `oracle-tsc.mjs` asks the real
  TypeScript compiler which imports are unused (`oracleUnusedImports`, `oracle-tsc.mjs:94`) and scores
  MISSED (conducks silent, a recall gap) against EXTRA (conducks wrong, the dangerous precision bug);
  `oracle-context.mjs` and `oracle-trace.mjs` build their own graph walk (`within`,
  `oracle-context.mjs:46`) because trace and context ARE walks, so sharing the underlying graph while
  scoring the traversal independently is the only honest oracle for them; `oracle-packs.mjs` walks
  every tree-sitter grammar's own node-types manifest, which ships inside the grammar package rather than in this repo (the grammar author's declared node list) to check a
  language pack's queries against a source neither party wrote.
- **The liveness probe** (`oracle-tsc.mjs::probeDetectsPlantedImport`, `oracle-tsc.mjs:220`) — plants
  an import the real compiler must flag and refuses to report a score if it does not. Written after a
  subject's `tsc` on `PATH` turned out to be a joke script printing "This is not the tsc command you
  are looking for," which the oracle had scored as a perfect run.
- **`tools/benchmark/ts-program.mjs::buildProgram`** (`ts-program.mjs:56`) — unions every tsconfig in
  a workspace before walking the rest of the tree, because a monorepo has one tsconfig per package,
  none of them lists the whole tree, and scoring against a single config blamed the analyzer for every
  file the compiler had never been shown (ADR 0186).
- **`tools/benchmark/reset-vault.mjs::resetVault`** (`reset-vault.mjs:51`) — clears a subject's
  `.conducks/` between runs without deleting the directory or anything git tracks in it, asking
  `git ls-files .conducks` per project rather than a hardcoded filename list (ADR 0171).
- **`tools/benchmark/health.mjs`** — Benchmark B: shape, integrity and cost against the frozen
  subjects, never correctness of an individual answer (that is the plant benchmarks' job). Every rate
  is printed together with its count, because a rate improves when the denominator is destroyed
  (ADR 0077).
- **`tools/benchmark/doc-truth.mjs`** — scores whether missing doc coverage is a TOOL gap or an AUTHOR
  gap, per symbol, against the language's own compiler/AST rather than against conducks' own vault.
- **`tools/benchmark/mutate-cli-smoke.mjs`** — proves every check in `cli-smoke.mjs` can go red: for
  each listed mutation it patches the analyzer source, rebuilds, reruns the harness, records which
  checks flipped, then restores from git. A mutation that flips nothing is the finding.
- **`tools/benchmark/cli-smoke.mjs`** — every CLI command re-run against every DISCOVERED subject
  under `../test-projects/` (never a hardcoded subject list, so a fourth subject is not silently
  skipped), asserting the SPECIFIC fix each check exists for, not just a zero exit code.

## Glossary

- **oracle** — an independently produced second answer (a real compiler, a hand-rolled walk, a
  grammar's own node-type list) that a conducks answer is scored against. An oracle built from
  conducks' own machinery agrees with it by construction and measures nothing.
- **MISSED / EXTRA** — an oracle's two disagreement directions: MISSED is conducks silent where the
  oracle found something (a recall gap), EXTRA is conducks reporting something the oracle disagrees
  with (a precision bug, the dangerous one).
- **plant** — a scenario built specifically to contain a shape the analyzer must handle, because real
  code cannot be relied on to contain every shape a tool must be scored against.

## Traps

**No benchmark runs on `git commit`.** `scripts/hooks/pre-commit` runs `conducks docs-lint` only, on
doc changes — `npm run hooks`'s own description states this explicitly (`package.json:43`:
`"pre-commit runs conducks docs-lint"`). An earlier version of this note (reconstructed from the
existing render) described a `bench:prune` pre-commit stage; that no longer exists. `npm run gate`
(build, full test suite, all plant benchmarks and every oracle run against every subject) is the only
enforcement of benchmark correctness, and it is not wired into any git hook or CI — there is no
`.github/workflows` directory in this repository, so a clean machine is untested until someone runs
`npm run gate` on it by hand.

**`results-baseline.txt` measures nothing — do not cite it.** Two of its three subjects recorded the
wrong tree, `nodes=0` read a vault path that never existed, `peak_cpu=0%` sampled the subshell rather
than the work, and the one real number (`subject-b`'s wall time) varied 139s–193s across identical
runs. It was produced once by a harness since fixed, and nothing in the file says so — a stale number
with a plausible filename outranks a correct number nobody wrote down, which is how it kept getting
quoted. Current measured figures for `analyze` live in ADR 0060 (memory) and ADR 0061 (parse time),
each with the run that produced it.

**A flag written after `--` was consumed as the project path, in four oracles at once.**
`npm run oracle:imports -- --write-baseline` resolved `--write-baseline` as `projectDir` because each
script (`oracle-tsc.mjs` and three others) parsed `argv[2]` positionally before the flag existed.
Filter flags out of the positional slot before reading it — a positional parser plus a later flag is
the same defect every time it happens. `oracle-tsc.mjs`'s `positionalArg` derivation
(`oracle-tsc.mjs:41`) is the current fix.

**A preserve list of filenames deleted another project's committed files — ask git instead.**
`reset-vault.mjs` used to clear a subject's `.conducks/` with a hardcoded `KEEP` set derived from this
repository's own `.gitignore` carve-out. That was correct only while every oracle ran against
conducks itself; the first time one was pointed at the sofie subject it deleted sofie's own committed
`.conducks/dependency-graph.html` and `.conducks/overview.html`. `git ls-files .conducks` is now the
answer, per project, and it needs no maintenance when the subject changes (ADR 0171).

**The instrument must be probed before its reading is believed.** See the liveness probe under
`## Features` — a `tsc` resolved from `PATH` rather than from the project's own `node_modules` can be
a joke script, and an oracle that trusts it silently scores a perfect run against nothing.

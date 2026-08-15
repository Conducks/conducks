# Handover — 2026-08-15
Status: current

## Where it stands
Gates green: **1,857 tests / 242 suites**, typecheck 0, `docs-lint` 183 governed docs, `visuals-lint`
clean (60 review stamps), `cli:smoke` 28/28 across all three frozen subjects, declared-deps clean.
Branch `mcp-surface-walk-and-concurrency` pushed through `818bcf3`.

**Prune, measured on the three subjects after today's fixes** — these are the numbers to compare
against, not the ones further down this file:

| | subject-c | subject-a | orchestrator |
| --- | --- | --- | --- |
| ORPHAN | 17 | 18 | 79 |
| UNUSED_EXPORT | 120 | – | 96 |
| UNIMPORTED_MODULE | 11 | 44 | 63 |
| STALE_IMPORT | 1 | 7 | 0 |

Every `STALE_IMPORT` above was checked against the source by hand and is a TRUE positive.

A SECOND benchmark run found three more use-positions, all ordinary React/TypeScript: a parenthesised
type (`...roles: (Role)[]`), object shorthand (`return { handleNext, handleBack }` — how every hook
hands back its handlers), and a default export (`export default Card`, the reason a component file
exists). The monorepo moved ORPHAN 98 → 84 and STALE_IMPORT 1 → 0, while UNUSED_EXPORT rose 93 → 96,
which is RECALL: symbols previously hidden behind a false ORPHAN are now judged. The other two
subjects did not move — these shapes are pervasive in a React monorepo and rare elsewhere.

**A THIRD benchmark run found two more, both ordinary JavaScript.** `useSyncExternalStore(subscribe,
getSnapshot, getServerSnapshot)` had arguments 2 and 3 reported ORPHAN while the first resolved —
because the kinesis pattern captures arguments as `(arguments (_)* @kinesis_arg)` and that quantifier
yields exactly ONE capture, probed against the real grammar. Every call argument after the first was
invisible to the whole pipeline. And `const { shouldRetry = shouldRetryError } = options` — a
destructuring DEFAULT — was invisible too. Both are captured in the shared block now; the argument
one is a SEPARATE pattern rather than a fix to the quantifier, because folding it in would multiply
the match count and with it the CALLS edges. orchestrator ORPHAN 84 → 79.

**A process failure worth recording:** the first reading of that run reported ORPHAN 98 → 9 and
UNIMPORTED_MODULE 67 → 4. Both were wrong — a `cd` earlier in the same command had left the shell in
the conducks repo, so `analyze` and `prune` ran against THIS project and I read its output as the
subject's. It was caught by the numbers being impossible (edges moved by 1 while 89 orphans
vanished) and by a finding naming `NodeId`, a symbol only this repository has. Always print `pwd`
before trusting a measurement taken after a `cd`.

**Eleven fixes today, and they collapse into three causes.**

1. **A name used in a position no grammar captured** — ten shapes, one idea: array literal, ternary
   branch, enum member read, array-of-generic, `instanceof`, intersection type, conditional type,
   JSX `onClick={handler}`, Python member read, Python zero-argument call, Python class inheritance.
2. **A command resolving symbols its own way** instead of through the shared helper — `trace`,
   `explain`, `entropy`. All three are now on `resolveSymbol` / `tryResolveSymbol`, and no command
   has its own resolution left.
3. **`::` read as an id separator when it was Rust's path separator** — one bug, one fix.

Plus three that stand alone: the package shipped its own test suite (741 of 1,437 files), `arch`
printed a sentence with words missing, and `help` advertised flags `impact` rejects.

**A CLI benchmark now exists** at `test-projects/_benchmark/`, to be run by a FRESH agent that checks
every claim against source rather than recording output. It has already earned its keep: running it
found four of today's bugs. `BASELINE-RUN-author.md` is my own run and does not substitute for an
independent one.

**Board, decided 2026-08-15 after research rather than left hanging:**
- **todo58 CLOSED**, acceptance verified on the subject rather than assumed: `MacOSAdapter` and
  `LinuxAdapter` are unreported and `impact MacOSAdapter upstream` returns 7. Its last open task was
  DROPPED as superseded — both surfaces reach the same `registry.explain.prune()`,
  `paired-surfaces` enforces that, and `surface-equivalence` already drives both doors over real
  stdio and compares the answer. The only thing left uncovered is payload SHAPE, which ADR 0148
  makes free to differ. Its "noted, not chased" `uid` item is answered too, and its hypothesis was
  wrong: the edge is `PULSES_TO` data flow (`const name = uid()` feeding `loadKernelPrompt(name)`),
  not the co-location leak it guessed.
- **todo66 OPENED** to carry what todo58 could not close. Six symbols on subject-c are still falsely
  flagged by one unresolved specifier — `electron/main/index.ts` imports `../engine/...` where the
  file lives at `src/engine/...`, a mapping that exists only in the build config. Named symbols and
  call sites are in the todo, so the count is falsifiable: six wrong today, zero when done.
- **todo31 NOT reopened**, and a fourth trigger recorded instead. Its Phase 0 rests on "the gate has
  removed the cost", and the gate became a defect source today: it could not see the new shared
  query file, and my first fix for that SILENTLY BROKE DETECTION — a stray backtick ends the
  literal, so scanning to the next unescaped one stops where the offence starts. Caught only by
  mutation-testing the gate. The migration's own risk (runtime path resolution) is unchanged and
  nothing measured today speaks to it, so the decision stands; the reasoning behind it no longer
  does unexamined.

**`prune` is now SCORED against the compiler, in both directions** (`npm run oracle`). Until
2026-08-15 nothing independent checked it, and the largest category had no oracle at all.

| measure | oracle | conducks | agreed | MISSED | EXTRA |
| --- | --- | --- | --- | --- | --- |
| TS unused IMPORTS (`tsc --noUnusedLocals`) | 31 | 1 | 1 | 30 | **0** |
| TS unused EXPORTS (`LanguageService.findReferences`) | 149 | 78 | 78 | 71 | **0** |
| PY unused IMPORTS (python's own `ast`) | 11 | 7 | 7 | 4 | **0** |

Recall reads 3% / 52% / **64%** — the Python surface, where the worst defects were, scores best.

**Run against FOUR codebases on 2026-08-15, and EXTRA is 0 on every one** — conducks contradicts
neither compiler nor parser anywhere:

| project | oracle | conducks | agreed | MISSED | EXTRA |
| --- | --- | --- | --- | --- | --- |
| conducks (exports) | 149 | 78 | 78 | 71 | **0** |
| subject-c (exports) | 212 | 120 | 114 | 98 | **0** |
| orchestrator/app (exports) | 202 | 24 | 24 | 178 | **0** |
| subject-a (python imports) | 11 | 7 | 7 | 4 | **0** |

Two gate bugs were found by running it on subjects rather than only on this repository, and both
failed in the direction that looks like a conducks defect:

- **Scope.** The program is built from the project's tsconfig, and subject-c's root config says
  `include: ["src/**/*"]` — so `renderer/**` is not in it. Scoring findings from a directory the
  oracle never read reported 6 false contradictions, three of them symbols already verified BY HAND
  as correct. The comparison is now limited to files the oracle actually examined, and what falls
  outside is counted and named rather than silently scored.
- **Monorepo.** `orchestrator` has no root tsconfig at all — each workspace carries its own — and the
  gate stack-traced. It now skips with the workspace command to run instead. A gate that looks broken
  on a normal repository gets switched off.

The workspace number carries a caveat worth keeping: `orchestrator/app` scores 24 of 202 because a
program scoped to ONE workspace cannot see consumers in its siblings, so most of that 178 is the
library-boundary limit already recorded in the file, not conducks being quiet.

**The recall gap was then DIAGNOSED, not just measured.** 22 of the 30 missed TypeScript imports are
one line: the import-site calibration in `dead-code.ts`, which skips a statement when NO name in it
was observed used. Removing that line, measured in both directions:

| | findings | MISSED | EXTRA |
| --- | --- | --- | --- |
| TypeScript | 1 → **20** | 30 → 11 | **0** |
| Python | 7 → **87** | 4 → 1 | **77** |

It costs 19 true findings on the language whose extractor is strong, and prevents a collapse into 77
false ones on the language whose extractor is not. **Kept**, and deliberately not made
language-conditional: a flag reading "TypeScript's extractor is good enough now" would assert as a
constant something that was false last week and is only true because thirteen use-positions were
closed. `npm run oracle` re-measures it; a constant would only remember it.

That experiment is the first time a calibration decision in this project was made against numbers in
BOTH directions rather than against a worry.

**EXTRA is 0 on both.** conducks contradicts the compiler nowhere — the thirteen use-position fixes
did what they claimed. What it is, is QUIET: 3% recall on imports, 52% on exports.

Both gates are TWO-SIDED, because precision alone is gameable to the limit — capture every identifier
position and `prune` reports nothing while scoring perfectly. `EXTRA` hard-fails; `MISSED` ratchets
against `tools/benchmark/oracle-baseline.json` and may never rise. Mutation-verified in both files:
silencing `findStaleImports` gives "RECALL WENT BACKWARDS 30 → 31", silencing `UNUSED_EXPORT` gives
71 → 149. Either change would have passed every gate this project had the day before.

Each oracle also checks ITSELF first, because an oracle that quietly stops finding things turns the
gate into a rubber stamp — MISSED to zero, EXTRA to zero, everything green. That is not theoretical:
the first import oracle parsed only `TS6133` and was blind to `TS6192` (emitted when EVERY name in a
declaration is unused), so it reported a CORRECT conducks finding as a precision bug.

**Known open, with the mechanism already found:**
- ~~Java/C# same-package calls do not resolve~~ — FIXED 2026-08-15. My earlier claim that "the graph
  never records a DECLARED package" was WRONG, and wrong because of the fixture: `package app;` is a
  single identifier and the Java query captures `(scoped_identifier)`, so no PACKAGE node was minted
  and I concluded none ever is. With a realistic dotted package the node exists —
  `com/example/app/lib.java::com.example.app`, one per file, named for the declaration. Units are
  now grouped by that node and made mutually visible, which is what the language rule already says.
  Keyed on the PACKAGE/NAMESPACE node and NOT on `namespaceId`, which is directory-derived for every
  language — grouping by that would mean "same folder" (ADR 0070's coincidence).
  MEASURED: `impact alpha upstream` 0 → 1 in Java, `UsedFn` 0 → 1 in C#, with the dead sibling still
  at 0. Reaches only the six grammars that mint declared package/namespace nodes (cpp, go, csharp,
  java, php, rust); all three frozen subjects are byte-identical.
- Java's call capture still drops the receiver (`Lib.alpha()` arrives as bare `alpha`); C# keeps it.
  Harmless now that same-package units are in the candidate set, but it is why the Java target has
  to resolve by bare name.
- ~~Python `self.method()` produces no caller edge~~ — FIXED 2026-08-14. Two lines deep: `self.` was
  never stripped the way `this.` is (and the strip's own comment says class self-calls resolve via
  same-file lookup), AND the built-in check tested the UNSTRIPPED target, so `self` matched the
  Python built-in list and the call bound to `GLOBAL::self` — one synthetic node absorbing every
  intra-class call in the language. MEASURED on subject-c's Python daemon: `_drain_queue` 1 caller →
  13, `_transcribe` and `_await_response` 0 → 11 each. Prune totals unchanged on all three subjects,
  so the recall was not bought with precision.
- ~~`update-check.test.ts` flaked~~ — CHASED AND FOUND, 2026-08-14. The file claimed "no test
  touches the network" and that was false: the TTL case falls through to the fetch, so every run of
  the unit suite made a live request to `api.github.com` with a 2-second timeout. `node:https` is
  stubbed now, answering as OFFLINE — one of the two cases that test already names — and the stub
  asserts it was reached, so the test cannot silently go back to using the real network.
- ~~`docs-watcher` flake~~ — ROOT CAUSE FOUND AND FIXED 2026-08-15, and it was a PRODUCT defect, not
  a test one. `whenReady()` resolved on chokidar's `ready`, which means the initial SCAN finished —
  on macOS that fires BEFORE the fsevents stream is subscribed, so a write landing in the gap
  produced no event at all. MEASURED under six writer processes: writing immediately after
  `whenReady()` gave **0 pulses in 90 seconds** on one probe of three and ~356ms on the others —
  binary, never or immediate. A one-second settle made it 5/5, which showed the gap was DELIVERY,
  not slowness.
  Readiness is now PROVEN: after `ready`, the watcher writes a probe inside the watched tree, waits
  until it observes its own write, then arms. Fails open after 3s with a warning, because this
  component is log-only by design and never arming would be worse than arming late.
  **0/6 failures under the load that gave 2/6 before; mutation-verified (reverting to announced
  readiness fails 2/4 on the new assertion).**
  What this cost the user before the fix: start the watcher, save a doc a moment later, and get no
  re-lint — no error, no retry, the gate simply quiet at the moment it should fire.
  The earlier `jest.setTimeout(30_000)` stays for its own smaller reason: a test whose declared
  bound cannot fire is lying about what it measures. It was never the fix, and the commit that
  claimed it was is corrected in the log.

**A method note worth keeping:** three of six quick language fixtures written today produced
confident FALSE conclusions until a real toolchain checked them — `rustc` and `ruby` caught all three
in seconds. Validate a language fixture with its own compiler before drawing any conclusion from it.

## 2026-08-13 — where it stood the day before

Kept as history. Where a line below is now false, the correction sits beside it — a handover that
contradicts itself at the top and the bottom is worse than one that admits the change.

**Closed 2026-08-13: todo56, todo57, todo59, todo60#P3, todo61, todo62, todo63, todo64.** ADR 0148's twelve pairs are
all mirrored and `paired-surfaces` has no granted exceptions left.

todo61 closed with ONE acceptance clause deliberately unmet, written into the record rather than
reinterpreted: it asked that the enum vocabularies match, and for `status` they should not. MCP's
`health`/`map`/`manifest` are different PROJECTIONS of the same data, not different names for one, so
matching them would mean changing what each returns. Every field is reachable from the CLI already —
`status`, `status --blueprint`, `entry`, `guard`, `supply-chain` — which is what ADR 0148 actually
requires. The mapping table is in the todo.

**The board is down to ONE open todo, and it is a decision, not work.**
**CORRECTED 2026-08-14:** still true of the todo board, but not of the work — eight defects were
found and fixed on 08-14 by running the tool against real projects, none of which had a todo.

What remains:
- **todo58#P1** and **todo16 (publish)** — genuinely yours, and the only things left.

todo60 and todo65 both closed. The suite now runs at **`maxWorkers: 2`, 129s, 1,838 green** — half
what it was — because `conducks clean` was killing conducks processes machine-wide, including in
OTHER projects. That was a product bug the tests happened to expose.

**SOLVED 2026-08-14 — do not act on this paragraph.** The cause was `conducks clean` killing
conducks processes machine-wide, including in other projects. The suite has since run green
repeatedly at 1,857/242 in ~130s. Kept only to show what the flake looked like before it was found.

~~The suite is not reliably green and nobody knows why.~~ Across nine runs today: `rename-safety`
(twice, two different lines), `kinetic` (4 tests), `blocking-commands` (1) — FOUR distinct suites,
all integration, all spawning child processes. Two of the three captured runs were contaminated by
work happening in another shell at the same time, so the rate is not trustworthy either.
Do not read a green run as settled, and see todo60 Phase 3 for how to measure it properly.

Work sits on branch `mcp-surface-walk-and-concurrency`. **CORRECTED 2026-08-14: pushed through
`818bcf3`.** Everything below is committed: `feat(persistence): move the vault to a NAPI DuckDB driver`
and `fix(prune): stop reporting a used value import as stale`.

**`npm run test:fast` is the inner loop — 26s, 1,143 tests.** `npm test` is the gate — **~130s and
1,857 as of 2026-08-14**, not the ~235s recorded here before `clean` was fixed.
Use the gate before a commit; do not use it to chase a failure.

## 2026-08-14 — `::` meant two things, and three of my own language fixtures were wrong

**The method was the bug.** Six quick per-language fixtures produced three false conclusions before
any of them were validated by a compiler:

- "Ruby is broken" — I wrote a paren-less `used_fn`; with `used_fn()` Ruby is correct.
- "The first function in a file is dropped" — an artifact of `query`'s default limit. Refuted.
- "Rust emits no behavioural edges" — my only call sat inside `println!(…)`, and a macro body is an
  unparsed `token_tree`. Conducks was right to see nothing.

Every language fixture is now validated by its own toolchain before any conclusion is drawn from it.
`rustc` and `ruby` caught all three of those errors in seconds.

**The real Rust defect, once the fixture was honest.** A resolved node id is `<filePath>::<symbol>`,
so `IntraLinker` skipped every edge whose target contained `::` as already-resolved. Rust's PATH
SEPARATOR is also `::`, so `helper::alpha()` was handed back untouched, and the external-induction
pass then invented a phantom `helper::alpha` node for it (`external://helper/alpha`) — because the
rule deciding "is this namespace local" only recognises `.ts` and `.js`. The call edge pointed at a
node that was not the declaration, so the real function had no callers.

MEASURED against rustc on a two-file crate where the compiler reports **only `beta`** as never used:
conducks reported BOTH `alpha` and `beta` as ORPHAN, and `impact alpha upstream` found 0 callers.
**After the fix: `beta` only, and `alpha` has 1 caller — conducks and rustc now agree.**

Two halves. `mod helper;` is now captured as an import: `RustResolver` has always known how to map a
module declaration to `helper.rs` or `helper/mod.rs` ("Maps Rust 'use' and 'mod' declarations to file
paths"), but nothing ever captured a `mod_item`, so half of it was unreachable. And the skip now asks
whether the target is really an id — a file path separator, or one of the enumerated
`CONSTRUCTED_NAMESPACES` — instead of assuming `::` proves it.

**All three frozen subjects are byte-identical after the change** (subject-c 17/120/11/1, subject-a
44/18/7, orchestrator 67/98/93/1), so the fix reaches only `::`-path languages.

**Java is NOT broken, and that was the other correction.** It reports nothing because
`isModuleScoped` deliberately excludes symbols nested in a class: *"Nested symbols (locals, methods)
cannot be reliably proven dead from the static graph, so orphan detection ignores them."* In Java
nearly all code is methods-in-classes, so ORPHAN legitimately finds nothing — that is a refusal, not
a miss. What IS still open for Java: a same-package call resolves to nothing, because the capture
drops the receiver (`Lib.alpha()` arrives as bare `alpha`) and same-package files have no import edge
to resolve against. That costs `impact`/`trace`/`context`, not prune.

## 2026-08-14 — running the benchmark end to end found two more invisible use-positions

Executed the whole benchmark against all three subjects. Every claim checked against source rather
than read off the terminal. It found two more bugs of the SAME family as everything else today — a
name READ in a position no grammar covered — plus one broken sentence.

**A Python enum reached only through a member was invisible.** `EntryPoint.LEVEL_1_ONLY`,
`InputType.URL_LIST`. Python carried **no value-position captures at all**; the `@ref_value` idea
existed only in the TypeScript-family grammars. **3 of subject-a's 10 `STALE_IMPORT` findings were
this**, each telling the reader to delete an import the module branches on. Added member-read,
list-element and conditional-branch captures. **10 → 7, and the 7 survivors are each verified true.**

**A JSX handler was invisible.** `onAction={handleAction}`, `onClick={exportCSV}` — the identifier
sits in `(jsx_attribute (jsx_expression (identifier)))` and nothing reached it, so the normal way of
wiring a React handler made it look unreferenced. **28 of the monorepo's 126 ORPHAN findings.**
Added `(jsx_expression (identifier) @ref_value)`. **126 → 98, zero JSX false positives**, and
`UNIMPORTED_MODULE` fell on two subjects as the new edges connected modules (subject-c 15 → 11,
orchestrator 74 → 67).

`arch` also printed **"No pattern detected. The shape, so the answer is still usable:"** — a sentence
missing its own subject, on exactly the projects where the command has the least else to say.

**What the run confirmed**, each verified in the source: `query` line numbers exact; `impact`'s
caller real (`index.ts:2151`); `arch`'s bidirectional pair true in both directions; `context`'s
printed declaration line exact; `ledger`'s orphan count equal to `prune`'s; `guard` and `drift`
refusing rather than inventing a verdict; **all 9 previously-false symbols still absent**; subject-c's
single `STALE_IMPORT` verified true; **no Next.js route file reported as dead**.

**Recorded and NOT fixed:** `self.method()` still produces no caller edge — `_drain_queue` has 22
call sites and `impact` finds 1, the only one whose receiver is a typed parameter. Three methods
called only via `self.` report zero callers. Prune does not turn that into a delete verdict here,
because their file is `UNIMPORTED_MODULE` and ADR 0026 makes that a question — so the damage is to
`impact`/`context`/`trace`, not to prune. Also: subject-c's #2 and #3 hotspots are barrel re-export
lines rather than declarations, `entry --json` returns a bare array with no denominator, and
`context` ranks `external://global/*` builtins among real neighbours.

The benchmark itself needed one correction: a second `analyze` on an unchanged project creates no
second pulse (verified — one pulse after two runs), so `T-DRIFT-2` now edits a file on a copy first.

## 2026-08-14 — dry-running the new benchmark found two more bugs, one of them 63% of a category

A CLI benchmark now lives in `test-projects/_benchmark/` (README + shared task spec + one file per
subject), to be executed by a fresh agent that verifies every claim against the SOURCE rather than
recording output. Dry-running it first found **eight defects in the benchmark itself** — the worst
being `CONDUCKS="node /path"` + `$CONDUCKS`, which cannot work in zsh (no word-splitting on an
unquoted variable), so the executing agent would have failed on task one. Also: `timeout` is absent
on macOS, unquoted `--include=*.py` dies to zsh globbing, `fallback` does not scan (it points at
`audit --fallback`), `resonance` takes a path, `rename` defaults to a dry run and needs `--confirm`,
and `audit`/`drift`/`fallback` all exit 1 BY DESIGN — which would have been logged as three crashes.

It also found two real defects.

**Python recorded no heritage edge for any class, ever.** `reflector.ts` gates its heritage branch on
a co-captured node, so a `@heritage` capture with no `@name` beside it is dropped; the Python grammar
captured only `@heritage`. TypeScript, TSX and JavaScript all co-capture `@name` for this exact
reason and the JavaScript grammar says so in a comment. **MEASURED on the Python subject: 17 of 27
`STALE_IMPORT` findings were base classes being inherited from** — `BaseExtractor` across 11 files,
plus `BaseSpecialist`, `BaseMapper`, `BaseWriter`, `BaseLevel`. 63% of the category was wrong, and
each one told the reader to delete an import whose class the next line inherits from. **After the fix:
27 → 10, zero base-class false positives.**

**`explain` and `entropy` rejected the id format `status` prints.** Both pre-checked absence with
`findNodesByName(input)` — which matches a NAME — so every `path/file.ts::name` id was declared
missing before the resolver that handles `::` ever ran. `impact`, `trace` and `context` accept that
form; `status` emits it. Fixed by splitting `tryResolveSymbol` (returns null) out of `resolveSymbol`
(exits): one resolution rule, two error policies, so both commands keep the wording their tests
assert on. The id a command PRINTS must be an id its siblings ACCEPT.

Both are the same family as the `trace` bug fixed earlier today, and all three came from ONE cause:
a command resolving symbols its own way instead of through the shared helper.

One near-miss worth recording: `sweep_global_metadata` looked like a false positive until line 66
turned out to be inside a multi-line `from … import (…)`. It is genuinely stale, and prune was right.
The benchmark warns its reader about exactly that trap, and I walked into it anyway.

## 2026-08-14 — the published package was half test files, and it carried other projects' names

`npm pack` shipped **1,437 files, 741 of them `build/tests`** — 3.7MB of compiled test code against
build/src's 4.3MB, in every install. `tsconfig.json` includes `tests/**` and `scripts/**` so
`type-check` covers them, and `tsc` ran against that same project, so the tests were compiled and
published. Nothing ever ran them from there: jest runs the TypeScript in `tests/` through ts-jest,
and `scripts/check-build-aliases.mjs` already said in a comment that `build/tests` is never executed.

Split into `tsconfig.build.json` (emit `src/**` only) from `tsconfig.json` (type-check everything).
**Type-checking is NOT narrowed, and that was verified rather than assumed** — a deliberate type
error added to a test file still fails `npm run type-check`. `rootDir` is pinned in the build project
because tsc infers it from the input set: with only `src/**` included it emits straight into
`build/`, moving every path the `bin` entry depends on.

`removeComments` is on for the emitted JS. This repository's comments are unusually long and record
what was MEASURED, naming the subjects — and tsc copies them verbatim into the tarball, so 15 shipped
files named a private project. Comment-stripping removes the leak where it actually happens, which is
the package, not `docs/` (docs have never been in `files`). `.d.ts` output is unaffected, so JSDoc a
consumer reads on the types survives.

**The rest of the leak was inside query TEMPLATE LITERALS, where `;;` comments are DATA and no
compiler flag can reach them** — including comments added earlier the same day. Those subject names
are now written as what was measured ("a 1,095-file Electron subject") instead of who it was measured
on. `oracle` stays: it is conducks' own fixture. `orchestrator` stays where it means
`AnalyzeOrchestrator`, this repository's own component.

**MEASURED: 1,437 files → 678, 1.2MB → 435kB packed, 4.2MB → 1.8MB unpacked, and zero third-party
project names in the shipped tree.** Verified by packing the tarball, installing it into a clean
directory, and running `conducks help` and `conducks analyze` from the installed `bin`.

Also fixed while there: `conducks help` advertised `impact --symbol X --direction downstream` and
`impact` takes positional arguments, so the first command the help taught anyone was one the tool
refuses with "Unknown flags". The new test checks the example against the command's OWN `usage`
string, so the two cannot drift apart again.

## 2026-08-14 — a zero-argument Python call was invisible, and `trace` answered from a symbol it never found

Two bugs, both found by asking which languages the prune fix below did NOT cover, and both bigger
than the thing that led to them.

**Python recorded no CALLS edge for a zero-argument call.** The pattern constrained the argument
list with a bare `(_)`, which requires at least ONE node in the list, so `start()`, `run()`,
`self.close()` matched nothing at all. Python was the ONLY grammar with this shape — TypeScript, TSX
and JavaScript already quantify with `(_)*`, and every other language captures the call target
without constraining arguments. Measured cost on a two-file fixture: `prune` reported the import of a
function called on the next line as `STALE_IMPORT`, and `trace` on the calling function returned zero
steps. **On subject-c, fixing it took `UNIMPORTED_MODULE` from 35 to 15** — two dozen Python symbols were
being called and the graph could not see it.

**`trace` traced from the raw input when resolution missed.** It tried `getNode(input)`, then a
one-result `query()`, and when both missed it KEPT THE RAW STRING and walked from an id no node is
keyed by — printing its heading with no steps under it. That reads as "this symbol depends on
nothing", which is a wrong answer, not an empty one. Every other command uses the shared
`resolveSymbol`, which also refuses loudly when a symbol genuinely does not exist; `trace` had
neither half. MEASURED: `trace pkg/main.py::run` printed nothing while `impact` on the same symbol
reported the call over a direct `["CALLS"]` path, and the same command handed the fully-qualified
lowercased id returned six steps.

**The exposure question is worth keeping.** `STALE_IMPORT` can only fire where a grammar emits
per-binding IMPORTS edges, which needs an `@name` or `@named_import` capture inside an import
pattern. Only typescript, tsx, javascript and python have one — java, go, rust, csharp, php, ruby,
swift, c and cpp capture the module with `@source` alone and cannot produce the finding at all
(verified on a Java fixture: zero findings). So the four exposed grammars are the whole surface, and
all four are now covered.

**Found but NOT fixed, recorded so it is not mistaken for covered:** a Python attribute call resolves
to the RECEIVER, not the method — `self.close()` emits `shutdown -> GLOBAL::self` and `close` gets no
incoming CALLS edge. Asserted in `python-zero-arg-call.test.ts` as current behaviour, so changing it
is a deliberate act. Also, `conducks help` advertises `impact --symbol X --direction downstream` and
the command only accepts positional arguments.

## 2026-08-14 — prune was wrong 9 times out of 10 on a real subject, and the cause was in the grammar

Found by running the shipped build against the frozen subject-c subject and checking every finding by
hand. `STALE_IMPORT` reported 10; **9 were false, and each one tells the reader to delete an import
the code needs.** The other categories held up — ORPHAN, UNUSED_EXPORT and UNIMPORTED_MODULE were
right in every case checked, including the hard one (`AGENT_COLOR` is an unused export in one file
while a DIFFERENT file declares its own local const of the same name, and prune did not confuse them).

The cause is ONE missing idea expressed in seven syntaxes: **a binding read in a position no query
covered produces no evidence at all**, and the analyzer reads absent evidence as proof of death.
Not a weak signal — an absent one. The seven:

| shape | example | measured on |
| --- | --- | --- |
| array-literal element | `[registerSafety, registerPrivacy]` | subject-c (6 of the 9) |
| ternary branch | `flag ? undefined : registerEmbeddings` | subject-c |
| enum member read | `FailoverReason.Timeout` | subject-c |
| array of a generic | `PhaseRunResult<R>[]` | subject-c |
| `instanceof` operand | `e instanceof FilterValidationError` | **conducks itself** |
| intersection type | `Promise<DriftResult & {...}>` | **conducks itself** |
| conditional type | `T extends EdgeType ? ... : ...` | **conducks itself** |

The last three came from pointing the fixed build at THIS repository, which had been reporting them
all along. A tool that misreads its own source is the strongest evidence available that the gap was
in the grammar and not in one project's style.

**The import-site calibration could not save any of them, and it is worth writing down why.** That
guard skips a statement when nothing it brings in was seen being used. Every one of these files HAS
observed uses — subject-c's `app.ts` imports `registerSafety` while a sibling `import type { Safety }`
from the same module is genuinely used as a type, and the two merge on (file, specifier). The blind
spot is per-SHAPE, not per-file, so a guard keyed on the file can never cover it. That is why the fix
belongs in the grammar and a second guard on top would not have worked.

Fixed by adding the missing patterns to the typescript, tsx and javascript grammars, reusing the
existing `@ref_value` and `@pulse_type_target` machinery — no new code paths. `intersection_type` was
simply missing beside the `union_type` line that was already there.

**MEASURED: subject-c `STALE_IMPORT` 10 → 1, conducks itself 4 → 1. Both survivors verified true
positives.** ORPHAN, UNUSED_EXPORT and UNIMPORTED_MODULE counts are unchanged on both, so the fix
bought precision without trading recall elsewhere. Cost: +3% edges, analyze 19.1s → 20.0s on a
1,095-file subject.

**The regression test was VACUOUS when first written, and passed against the unfixed build.** All
seven shapes lived in one import statement, so nothing in it produced evidence and the calibration
guard suppressed the whole statement — the test proved the guard works, not the grammar. It needed a
called sibling in the same statement to reproduce the real condition. Caught by mutation, which is the
only reason it is worth anything; the fixture now fails on all seven shapes when the grammar is
reverted (CONDUCKS-41).

## 2026-08-10 — the install stops compiling DuckDB, and what that uncovered

ADR **0149**: the vault driver is `@duckdb/node-api` (NAPI, one binary for every Node) instead of
`duckdb` (node-pre-gyp, one binary per ABI). `npm i -g` from a packed tarball went from **past ten
minutes still compiling** to **39s** with no compiler invoked. **todo56 is CLOSED** (`completed/`).

Verified on four triples, each a clean-prefix tarball install plus a real `analyze` — darwin-arm64
39s, linux-arm64 38s, linux-arm64-musl 38s, linux-x64 47s (emulated, via Docker).

The port was NOT one file, as the todo had assumed — `getRawConnection()` hands the driver's
connection to five callers. Row shape was verified unchanged by diffing both drivers against this
repo's own vault before anything was rewritten. `close()` lost its 5-second timeout race (the new
close cannot hang) and now checkpoints the WAL away, so a stale `.wal` is strictly a crash signature.

**The tarball install caught a publish blocker no test could have.** `minimatch` and `chalk` were
imported by shipped code and declared nowhere — they arrived through `duckdb` → node-pre-gyp → glob,
and dropping that dependency took them with it. The suite stayed green throughout, because the repo
has both via devDependencies. `scripts/check-declared-deps.mjs` now fails the build on any undeclared
import (CONDUCKS-42). **Publishing before this was landed would have shipped a broken package.**

Two things this uncovered that were true before and invisible:

- The suite's referential-integrity assertion had **never checked anything** — it passed params in the
  shape the old driver did not take, the error was swallowed, and `[]` read as "0 dangling". Rewritten;
  three of the four things it reported turned out to be the QUERY being wrong (it partitioned by
  `pulseId`, but analyze is incremental). What survived became **todo62 — now closed, see below**.
- `persistence.ts.m`, a stale 919-line copy of the persistence layer, is deleted (todo56#P3).

**And the musl install found a nine-day-old lie.** On alpine, where `tree-sitter` cannot build,
`doctor` printed "Parse path: Gnosis regex fallback — Analysis still works, at lower fidelity" and the
very next `analyze` refused. ADR **0089 deleted that fallback** and the promotion never happened: six
living files still described it as current — `doctor`, `features.md` (a whole capability entry),
CONDUCKS-27, `memory.md`, the `conducks-cli` skill that ships into every repo, and two module notes.
All six corrected. Doctor now reports `Parse path: NONE` as a failure, mutation-verified.

**Conducks installs on musl and cannot analyze on it without a toolchain.** That is not new and not a
DuckDB problem — the musl DuckDB binding resolves fine. The remedy doctor prints is measured, not
guessed: `apk add build-base python3` then `CXXFLAGS="-std=c++20" npm i -g conducks` → all 13
grammars, real graph. Decide whether Alpine-without-a-toolchain is a supported story before publishing.

## 2026-08-13 — the flake had one cause, and the suite is serial for the wrong stated reason

**todo60#P3 closed.** Measured on an idle machine: five full runs, three green, two failing the SAME
test — `blocking-commands › mirror serves the wave over HTTP`. Every earlier observation had been
taken while a build or CLI was running in another shell, which is why FOUR suites had looked
implicated and none was understood.

`mirror.ts` prints "Initializing Visual Dashboard..." BEFORE it binds, and the test accepted
`/Dashboard/i` as readiness — so it fetched a port nothing was listening on, from a guessed default of
3333. One signal now serves as both the readiness condition and the address, with no fallback.

**Verified with the right instrument, which the first attempt got wrong.** Five more full runs is 20
minutes; the suite holding the flake costs 3 seconds. The cheap loop was validated before being
trusted — reverting the fix reproduced the failure 1 in 15 alone — and the fixed version is 0 in 60.
Note the rate is lower alone (7%) than under full-suite load (40%): a busy machine widens the race.

**todo65, filed not fixed.** `jest.config.js` said the suite is serial because "tests share fixture
vaults" and they do not — every suite gets its own mkdtemp'd repo. The real blocker is CPU contention:
each jest worker spawns a CLI running its own 4-worker analyze pool, so the helper's 90s timeout fires
on an analyze that SUCCEEDED. Measured: serial 248s green, 2 workers 133s with one failure, 4 workers
150s with three — 4 being slower than 2 is contention, not a lock. Half the wall clock is available.

## 2026-08-13 — todo57: `context` is one feature again

The last of ADR 0148's twelve pairs. The scored BFS moved to
`src/lib/domain/kinetic/context.ts` and both surfaces reach it through `registry.kinetic.context`.
Measured before: **2,407 CLI entries against the tool's 83, sharing 44 names** — 247 of the CLI's were
unresolved `node` placeholders and 196 were whole files, so the flow trace was replaced rather than
kept beside the neighbourhood.

The tool's output is **byte-identical** to baselines captured before the change, on three parameter
shapes. The CLI answers from the same list, cut at a different place, and keeps two things as
rendering: source lines, and the `Called by:` section — dropping the latter was a real regression that
`traversal-truth` caught, since the neighbourhood contains callers but does not label them.

**A limitation worth carrying:** the equivalence test compares the surfaces to EACH OTHER, so it
cannot catch a change to the shared answer — mutating the sort or the ATOM filter moves both and it
stays green. `context-shape.test.ts` pins the answer itself, which is why its registry mock delegates
to the real analyzer instead of returning canned nodes.

## 2026-08-13 — todo61: a duplicate door caught before it shipped, and a real denominator bug

**`conducks flows --json` emitted a bare array**, so `[]` meant both "no flows here" and "4 exist and
none matched". The denominator was in the rendered output and in the MCP tool and missing from the one
surface a machine reads (ADR 0115/0145). It now returns `{flows, total, matching, shown}`.

**I nearly shipped a second door onto `drift`.** todo61 said the CLI lacked it; `conducks drift`
already existed, on the same `registry.evolution.compare()`, under a different COMMAND NAME. The gap
came from comparing `diff`'s flags against `conducks_diff`'s parameters — the exact mistake ADR 0148
records for `audit`. Reverted. What was actually missing was `--json` on `drift`.

**The pairs gate was NOT strengthened, deliberately.** todo61#P2 asked for "reaches the same domain
function"; ADR 0148 argued against that in writing, and two measurements agree — `query` legitimately
returns echoes the tool does not, `drift` legitimately renders as text. A call-graph gate would have
been wrong twice on its first run. The strong check is
`tests/integration/features/surface-equivalence.test.ts`, which compares ANSWERS on real data over
stdio JSON-RPC and cannot false-fail on rendering. Five pairs, each mutation-verified.

Also noted: the static gate pairs a tool with a CLI file of the SAME NAME, so a capability under a
different command name is invisible to it. That is how `drift` was missed.

## 2026-08-13 — todo63 closed, and one of my "not blocked" calls was wrong

**todo63 CLOSED.** The recall half is built: `pruneTaxonomy`'s ATOM edge gate now spares a node whose
`dna.isExported` is true, so an exported constant nobody imports keeps its node and `prune` reports
it. MEASURED on the frozen subjects — orchestrator 6,662 -> 6,715 nodes (+0.80%), subject-c 10,545 ->
10,567 (+0.21%), subject-a unchanged as the python control. Dangling counts identical, `located` still
100%: the cost is nodes, not broken references. Baselines re-saved warm and cold.

**todo58#P1 is NOT unblocked, and saying it was is my mistake.** I claimed ADR 0070 already decided
it — refuse and record as dangling. Two things were wrong. ADR 0070 forbids fabricating a target by
COINCIDENCE (a basename match that sent 106 importers to a test file); reading a declared `tsconfig`
`rootDir`/`outDir` is not that kind of guess. And the dangling option does not meet the acceptance
anyway: the unresolved reference is ALREADY kept as a dangling edge at 0.4, and on subject-c **all seven
named symbols are still flagged**. The false verdicts sit on the TARGET file's symbols, and nothing
links "this importer did not resolve" to "do not call that symbol dead". Only resolving the specifier
removes them. It is a real decision again.

## 2026-08-13 — `context` measured, todo64 corrected, and a self-inflicted flake

**todo57#P1 answered.** Both `context` surfaces driven on `resolveSymbolId`, same vault, same moment.
They are not two renderings of one answer:

| | CLI | MCP |
|---|---|---|
| entries | **2,407** | 83 (of 103 in radius 2) |
| overlap by name | **44** | 44 |
| kinds | ATOM 1052, BEHAVIOR 649, `node` 247, STRUCTURE 244, UNIT 196, ECOSYSTEM 19 | BEHAVIOR 78, STRUCTURE 5 |
| source lines | yes | no |

The CLI side has a defect the static gate could not see: **2,407 entries for one symbol is a dump**,
247 of them unresolved `node` placeholders. The decision in todo57#P1 is still yours, but the CLI's
breadth is a bug regardless of which way it goes.

**todo64 is CLOSED, after carrying two wrong headlines on the way.** It said block 3b was unreachable
dead code; then, after a contaminated starve, that 3b was load-bearing. Both wrong — 3b instrumented
logs no rebinds at all, and starving it changes nothing.

The real cause, found by instrumenting the call processor: `context.localBindings` is keyed by name
per FILE with no scope, so `import { realTarget as shadowed }` made every `shadowed()` in the file
resolve to the import, including inside a function declaring its own. Fixed as IntraLinker block 3c.
It also corrects same-named locals across SIBLING functions — a python call in `_merkle_diff` was
bound to `_render_markdown.walk`.

**Two guards, each forced by a measurement catching the fix being wrong.** Ids are lowercased for
APFS (CONDUCKS-4), so the first cut rebound 37 python edges — `pathlib::Path` onto a local `path` —
reintroducing the same defect from the other side; names are compared case-sensitively now. And a
destructured import binding is ALSO a scoped node with a matching name and must not win, which the
prune-precision fixture caught by reporting three live symbols as dead.

**One flake capture was contaminated, by me.** `kinetic.test.ts` failed with
`Cannot find module .../build/src/lib/core/utils/mem-trace.js` — which reads as a harness race and is
not one. `npm run build` opens with `rm -rf build`, and it was run by hand while the suite was in
flight. It also refutes the theory it suggests: `maxWorkers: 1` makes the suite serial, so two suites
cannot rebuild over each other. **Never build or restore a source file while `npm test` is running** —
the integration suites spawn child CLIs that read `build/` live.

Three captured runs followed: **fail / pass / fail**, in two more suites. Run 3 was
`mirror serves the wave over HTTP` — `fetch failed` while the server HAD reported ready, so a
ready-vs-listening gap or a port collision, not slowness. It was also taken while this shell was
running `docs-lint`, which is exactly the kind of noise that makes a timing test meaningless. **Every
observation of this flake so far was taken while something else was running.** That has to stop
before any theory is worth writing down.

## 2026-08-11 — prune stopped telling users to delete imports their code needs

**todo63 Phase 0 + 1.** The const-value defect the new fixture found is TWO causes, not one, and the
single-cause theory in the todo is refuted — fixing either half leaves the other exactly where it was.

- **False positive:** a bare value read (`return usedValue`) produces NO edge, so the used-set never
  sees it. The analyzer HAS a guard for that blind spot, but it is keyed per (file, specifier) — so
  any used sibling from the same module lifts it. Splitting the import into two statements does not
  help; they merge into one record.
- **Recall miss:** entirely separate. An exported value nobody imports has no NODE at all —
  `pruneTaxonomy` cut it (ADR 0013). Nothing to flag. Left open as todo63 Phase 2, because reporting
  it is a taxonomy decision about what the graph stores, not a `prune` change.

Fixed by removing `variable` from `PRUNABLE_BINDING_KINDS` — one consumer, one line. Decided by the
analyzer's OWN written rule, not preference: *"a missed dead import is acceptable and a wrong one is
not"*. A const arrow function is `function`, not `variable` (measured), so callable coverage is intact.

**MEASURED on subject-c: 171 findings → 161, `STALE_IMPORT` 20 → 10.** Three of the ten removed were
checked against the source and all three are confirmed false positives — `ALL_ROLES` used three times
in the file that imports it, `STATE_COLOR` used as an index, `OWNER_KEY` used as a call argument.
The cost is real and asserted explicitly in the fixture: a genuinely stale VALUE import is now never
reported. Trading it back is a visible choice, not an accident.

## 2026-08-11 — the prune precision check is a fixture now, and it found two things

**todo58#P2 done.** `tests/integration/features/prune-precision.test.ts` replaces a by-hand
measurement (172 findings verified one at a time, ~94.8% precision, unrepeatable) with a project
whose truth is DECLARED in the test. Scored on precision AND recall together, because either alone is
gameable. Four live symbols, four different mechanisms — static import, destructured dynamic import,
dynamic import then `new`, barrel re-export. Mutation-verified.

**It found a defect on its first run — todo63.** Exported const VALUES are wrong in BOTH directions:
an unused one is MISSED, and a used one is flagged `STALE_IMPORT`. Functions and classes are fine,
including an arrow function on a const, so it is the value and not the declaration form. The false
positive is the bad half — `STALE_IMPORT` is a verdict telling the user to delete an import their
code needs. Held in the fixture's `KNOWN_WRONG` group, which fails if the gap grows OR is silently
fixed.

**And a second thing — todo64, whose first headline was WRONG.** `IntraLinker` block 3b was filed as
unreachable dead code: starving it left 1,827 of 1,829 tests passing, both failures in the one test
that hand-builds the pre-fix graph. Checking the shadowing case corrected it. 3b is LOAD-BEARING — it
resolves calls through a renamed STATIC import (`import { A as B }` … `B()`), and starving it deletes
those edges. Every fixture that reached the first conclusion held a dynamic import and none held a
renamed static one.

What 3b actually has is a WRONG-EDGE bug: a genuine local declaration that shadows a renamed import is
rebound to the import, so `usesLocal` — which calls its own arrow function — is recorded as calling
the imported definition. Confidently wrong, and nothing counts it. todo64 carries the repro.

**A green suite while a path is starved proves the SUITE does not cover it, not that the path is
unused.** That is the lesson, and it cost a wrong claim in three files before the shadowing fixture
caught it.

## 2026-08-11 — todo59 closed, and the re-baselining confirmed todo62 independently

**todo59 closed.** Cold and warm now keep SEPARATE baselines — `<name>.cold.json` beside
`<name>.json`. Both modes wrote the same file before, so `--cold --save` silently overwrote the warm
baseline and `--cold --compare` diffed a first analyze against a second, reporting the residue as
DRIFT every run. Comparing across modes is now REFUSED (mutation-verified), and the residue is a
stored number instead of a rediscovery: **orchestrator 5 edges, subject-c 1 node**. The docstring's
"cold and warm now agree" claim — asserted in prose, checked by nobody — is replaced with the truth.

**The warm baselines had to be re-saved, and the diff was not noise.** It is the todo62 alias fix
measured on frozen subjects, which nothing else could have shown:

| orchestrator | before | after |
|---|---|---|
| orphans | **23** | **0** |
| violations | 25 | 2 |
| nodes | 6,639 | 6,662 |

Every one of those 23 orphans was a binding node deleted by its own mis-named edge. subject-a (python)
is unchanged — the control, since it has no destructured dynamic imports.

**And the driver swap had broken 26 files nobody tests.** `tools/` and `scripts/` imported `duckdb`
directly — including `npm run benchmark` and `health.mjs` itself — while the gate written the same
session reported `build/ clean`, because it scanned `build/src` only and matched `.js` alone. All 26
ported behind one helper (`tools/lib/vault.mjs`); the gate now covers `tools/`, `scripts/`, `.mjs`
and `.cjs`, allows devDependencies for tooling only, and ignores `require(...)` written inside a
comment. `tools/upstream-duckdb-repro/` still imports `duckdb` ON PURPOSE — it is a bug report about
that package.

**A THIRD intermittent test appeared:** `rename-safety.test.ts:84` failed in one full-suite run of
three and passes in isolation. That run reported two failing suites and only one was captured before
the output rolled. Filed as todo60 Phase 3, explicitly NOT attributed to the alias fix — 235/235
passed twice on the same build, so the counts cannot carry an attribution.

## 2026-08-11 — todo62: the edge was misnamed, therefore the node was deleted

**Closed.** The three surviving dangling edges were NOT re-exports — that first reading was wrong, and
the correction is the point. They are destructured dynamic imports
(`const { X } = await import(...)`), and the failure runs backwards from the intuition:

`processAlias` built the edge from the bare local name (`<file>::doit`) while the binding node is
stored scoped to its enclosing function (`<file>::main2.doit`). `pruneTaxonomy`'s ATOM gate keeps a
node only when an edge's endpoint IS that node — so the mismatch made the binding read as
unreferenced and **the edge's own misnaming is what deleted its node**. Prune's edge cleanup then
missed the edge for the same reason. A module-level re-export has no scope, the two ids coincide, and
57 of 60 alias edges were always healthy — which is why only the scoped minority was ever broken.

Fixed at both call sites in `reflector.ts`. Measured after a full re-analyze: dangling confident
structural edges **3 → 0**, alias edges still 60, the 1,044 deliberately-unresolved untouched. The
structural test's carve-out is gone — it asserts `[]`. Rule promoted into CONDUCKS-28.

**`CONDUCKS_SQL_LOG` is what ended it.** Three rounds of plausible reasoning about which deleter ran
were all wrong; the write log put the node's id and the edge's endpoint side by side in one line. Use
it before theorising about what a pulse wrote.

## 2026-08-10 — the two surfaces must answer the same question

ADR **0148**: every MCP tool is a CLI command, not the reverse, and where both exist they mirror —
same input, same ANSWER, differing only in rendering. Twelve capabilities live on both surfaces and
nothing had ever said what their relationship was, so they drifted silently.

Closed: `trace` gained `--mode`/`--target` (its `path` mode was unreachable from the CLI), `prune`
gained `--type`/`--limit`, `flows` gained `--min-members`/`--limit`, `coverage` gained `--limit`, and
`impact`'s CLI stopped reading an unknown direction as upstream. Each verified against subject-c rather
than asserted — `prune --type ORPHAN` gives 17 from both surfaces, `flows --min-members 2/5/10` gives
1126/635/376 from both.

**The find that mattered most: `conducks_rename` wrote to disk by default.** Its schema declares
`dryRun: { default: true }`, but a JSON Schema default is documentation — the server does not inject it
— so an omitted value reached a parameter defaulted to `false` one layer down. The only destructive
tool on the surface mutated source while advertising that it would not, and the CLI had always been
safe. Anything other than an explicit `dryRun: false` is now a dry run.

`audit` was reported as a gap and was not: comparing parameter lists against `usage` strings sees
absence where comparing CAPABILITIES sees a different layout (`advice` is `conducks advise`). State a
gap as a question a user cannot ask.

## The laptop stops overheating, and here is why it did

`analyze` sizes its worker pool at `os.cpus().length - 1` — 11 workers on a 12-core machine — and the
suite spawns `analyze` many times. Measured on subject-c: 11 workers analyzes in 20s, 4 in 23s. A 15%
wall-clock cost for a third of the load, so tests now cap it at 4 (`tests/helpers/cap-workers.mjs`,
`CONDUCKS_WORKERS` overrides).

The bigger half was behavioural and it was mine: ~25 full-suite runs at 4 minutes each to chase one
flake, which also produced a WRONG conclusion along the way. `npm run test:fast` exists so the inner
loop is 26s. See AGENT_RULES.

## The board is EMPTY, and here is what that does and does not mean
That sentence was true on 2026-08-09 and is not now. Six todos are open, and every one was filed FROM
measurements taken after the board said it was empty:

- (closed today) `todo56` — the install. See above; four platforms measured.
- `todo57` / `todo61` — `context` is two features under one name; needs the BFS extracted to the domain.
- `todo58` — build-layout specifiers: an unresolvable path should inflate DANGLING, not read as dead.
- (closed today) `todo59` — cold/warm parity. Residue tracked in a cold baseline, not chased.
- `todo60` — now THREE intermittent tests; the assertions print their values, so the next natural
  failure diagnoses itself.
- `todo61` — the mirror rule: five gaps closed, `status` and `diff` need a decision.
- `todo63` — the false-positive half is FIXED (above); Phase 2 remains, and it is a taxonomy
  decision: should an exported-but-unreferenced value keep a node at all?
- `todo64` — `IntraLinker` block 3b rebinds a local that SHADOWS a renamed import to the import: a
  wrong edge. It is load-bearing, not dead — an earlier note here said dead and was corrected.
- (closed today) `todo62` — the alias id-shape bug. See above.
  call, not work: is a barrel re-export a symbol or a relationship?

And the ones that are not tracked as open work:

- `todo16` — npm publish. Everything gating it is green; the publish itself is Said's command to run.
  Note what changed today: the package it would have published was BROKEN (undeclared `minimatch` and
  `chalk`), and the repo could not see it. Pack and install the tarball before publishing, every time.
- `todo31` — parked with reopen-triggers. NOTE: its `Status:` is `todo` with zero unchecked tasks, so
  the board cannot show it. That is a real blind spot in the grammar, flagged twice and not yet
  resolved — a file that says "todo" and appears nowhere.
- (closed 2026-08-09) `todo55` — `watch` missed files created in the first moment after startup,
  ~1 run in 3. Cause: the command never awaited chokidar's `ready`, so it reconciled and printed
  "Live Mirror Mode active" while the poller had no baseline. Fixed by awaiting it; 20 clean runs,
  mutation-verified.

## 2026-08-08 — the agent-facing surface, and what it cost
The CLI walk had been the whole story. Pointing the same method at the MCP surface — driving tools the
way an agent does rather than reading them — produced **eight defects in eight attempts**. Every one of
them returned a payload beforehand, which is the bar that keeps proving worthless.

The two that matter most, because both produce WRONG ANSWERS rather than errors:
- **Pipelined calls raced the shared registry.** `ensureGraphLoaded` cleared `pendingLoad` before
  awaiting the load, so a second caller walked an empty graph and reported `SYMBOL_NOT_FOUND` for
  symbols that exist. It did not throw — it answered. ADR 0146.
- **`conducks_prune` with an unknown `type`** returned `{ORPHAN: 0, UNUSED_EXPORT: 0, STALE_IMPORT: 0,
  total: 0}` — a clean bill of health for the whole codebase, from a typo.

Also fixed: `watch` was blind to files created after it started (`git diff HEAD` prints nothing for an
untracked path — todo51), `diff` had the SAME blind spot in the PR risk engine, `status` reported an
empty vault as `READY`/`SYNCHRONIZED` (`status: 'ready'` was a string LITERAL in both status functions),
the MCP payload dropped that verdict entirely, and `conducks_rename` told the agent to run
`conducks_analyze`, a tool that does not exist.

## The recurring class, now enforced rather than written down
17 of 132 memory entries were ONE defect: nothing examined reported as a negative finding. ADR 0124
stated the rule in prose and it was violated eight more times, because a principle cannot bind dozens
of independent render sites and a grep cannot tell a lying branch from an honest one.

ADR 0145 moves it to the compiler. `Verdict<T>` in `contracts/verdict.ts`: `clean` cannot be
constructed without `examined`, `nothing-to-check` is its own variant, and `renderVerdict` switches
with no default — adding a fourth variant fails the build (verified by adding one, TS2366).
**Migrated: `advise` only.** The others turned out not to need it — their empty case was already a loud
refusal, now translated at the single CLI error boundary instead of leaking the internal guard.

## 2026-08-09 — the MCP surface walked to the end, and the queue removed
`todo53` drove all 14 tools and all 9 enums over real stdio JSON-RPC: **25 defects**, every one behind
a payload that looked fine. The recurring shapes, each now fixed at source rather than per tool:

- **A `::` id was never checked against the graph.** An invented symbol made `trace`, `impact`,
  `explain` and `context` answer "0 steps / 0 impact / 0 in radius / no risk fields" — four confident
  nothings. One `resolveSymbolId` in `shared/resolve-symbol.ts` now verifies the node exists.
- **A bound declared in `inputSchema` was a comment.** `radius: "two"` made `Math.min("two", 10)` NaN,
  which removed the depth guard entirely and produced the WIDEST possible walk from a junk value.
  `numErr`/`boolErr` join `enumErr`; bounds live in one constant the schema and the guard both read.
- **Denominators.** `flows` published the pre-filter total, `docs` reported health over a project with
  no `docs/`, `coverage` answered `{total: 0, dark: 0}` for a report matching nothing. `coverage` and
  `docs` now carry `Verdict`; `flows` reports `matching`.
- **`query` advertised a template it then refused** (`type_coupling`), and the refusal told the caller
  to consult the list that had just advertised it. The allowlist is now ASKED of the library.
- **`diff` reported 0 impacted symbols** while the CLI reported 7 on the same tree at the same moment —
  a private copy that had received neither of the CLI's two fixes, plus a matcher reading a cyclomatic
  count as a line span. One engine now (`change-set.ts`), reached through the registry.

`todo52` then removed ADR 0146's serialisation. ADR **0147** supersedes it and carries the correction:
0146 blamed the handle swap, and reverting each fix singly proved the swap caused NEITHER failure.
`pendingLoad` cleared on every call caused the wrong answer; `tool-registry` closing the shared handle
uncounted caused `Database was already closed`. The handle now has ONE owner —
`registry.infrastructure.acquireVault/releaseVault`. Probe: **2,135 ms → ~500 ms**.

## Traps for the next session
- Frozen benchmark subjects (`test-projects/{scraper,orchestrator,sofie}`) take NO commits, ever.
  `tools/benchmark/health.mjs --compare` is the drift gate; analyze always `--force`. `--cold` now
  exists and measures the FIRST analyze — the default baseline describes the second.
- **A check written after its fix must be seen RED first** (`npm run cli:mutate`). Every fix this
  session was mutation-verified, and two earlier checks were vacuous when mutated.
- **A test must never re-implement what it tests.** The SQL guard's multi-statement hole survived in
  both the guard and its replica. Export the real function and call it — `sqlGuardReason`, `enumErr`.
- **A mocked handler has no shared singleton to corrupt**, which is why every unit test passed while
  pipelined calls were returning wrong answers. Concurrency needs the real server over stdio.
- `tools/mcp-parallel.mjs` is FIXED and can now be read as correctness: it parses the tool payload,
  counts an in-payload `error` as a failure, drives six DIFFERENT tools, and exits non-zero. It is
  mutation-verified against a symbol that does not exist (`PROBE_SYMBOL=noSuchSymbolAnywhere` gives
  `ok=2 failed=4`, where the old test scored all six `ok`).
- **When several fixes land for one symptom, revert each ONE AT A TIME.** Three landed for the
  concurrency races and the obvious story was wrong — the ADR amendment written before the mutations
  credited the wrong fix and had to be corrected. ADR 0147 carries the cause table.
- **The architecture gate is load-bearing.** `boundaries.test.ts` blocked three separate attempts on
  2026-08-09 (`cli -> domain` twice, `mcp -> domain`, `composition -> mcp`). Each time it was right and
  pointed at where the shared code actually belonged — the registry, not the interface layer.
- The stamp gate WILL flag your edits: touching a file cited by a module note prints a re-read flag.
  That is it working — re-read, then `visuals-lint --stamp <page>`. Do not bulk-stamp. Twice this
  session the flagged anchor had genuinely drifted (one by ~57 lines, hidden until an unrelated edit
  changed the file's hash).
- `blocking-commands.test.ts`'s reaction case does NOT flake on CPU load — that note was wrong and is
  now todo55. Measured 2026-08-09: ~1 failure in 3 running it ALONE. Do not widen the window and do not
  move it to a serial project; both were tried as theories and the measurement disproves them. The
  `docs-watcher` debounce case WAS a genuine test-timing bug (a fixed 600 ms sleep, asserting before
  the debounce fired) and is fixed — it now waits on the condition and then proves the count stays 1.
- subject-c (`assistant/subject-c`) sits ~96 commits ahead of origin, unpushed by decision — Said's call.
- `.conducks/note-reviews.json` is COMMITTED (the one carve-out from the ignored vault dir).

## What the earlier stretch built (read the ADRs, they carry the reasoning)
- **The visuals pipeline** (ADR 0138–0142): anchors checked against the working tree; drift proven by
  re-running the repo's DECLARED generator with a restore contract; module notes are SOURCE at
  `docs/visuals/modules/<path>.md`; review stamps hash the exact cited span.
- **conducks arch** finished ADR 0134's program: doors, composition root, layer direction, per-service
  monorepo verdicts, cluster shape.
- **Adoption is one command**: `conducks setup` installs skills, MCP, registry, ignore file and the
  pre-commit gates; skills re-sync on every build.
- **trace/context tell dependency from co-location** (todo38); `context` opens with the symbol's
  callers and their call-site lines.
- **The id re-case was decided AGAINST by measurement** (todo32).

## If you pick something up
`todo53` is the highest-value: the MCP surface has yielded a defect every single time it has been
driven, and roughly half of it is still unwalked. `todo52` buys back the 8×. The deferred canvas→note
link map in subject-c and the DERIVED-header warn→error raise remain, neither urgent.

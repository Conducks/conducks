# todo39 — an answer shows the call site, not a list of names
Status: doing

- Acceptance: `impact <symbol>` prints, for every caller, the file, the enclosing function, and the SOURCE LINE of the call — with direct and indirect labelled — and a reader can decide whether a change is safe without opening a file. Proven by a test that fails without the line.
- Depends: none

## Context

ADR 0132. Measured against ripgrep on this repository: `rg resolveSymbol` returns 36 mixed text matches
in 17 ms; `conducks impact resolveSymbol` returns exactly 7 correct callers in 682 ms. Conducks is
right and still loses, because it prints `execute (cohesion.ts:38)` — one of seven `execute`s here —
and grep prints the line of code.

Every call-site line number is already in the vault (ADR 0110): `edges.lineNumber`, plus a `lines`
property holding every site rather than the first. Nothing reads the source back when answering.

## Phase 1 — read the line back
- Builds: 0132

- [x] `edges.lineNumber` and the `lines` property reach the CLI answer layer — MEASURED and they already did: 6,077 of 6,077 CALLS edges carry both in the vault, all 7 survive into the in-memory graph, and `--json` already emitted `line`/`lines`/`declaredAt`. The gap was never the plumbing
- [x] A shared reader turns `(file, line)` into the trimmed source line — `SourceLineReader`, caching by path and reporting its own read count so the bound is checkable
- [x] A line the working tree no longer has says so — `past-end` and `unreadable` are distinct, and a BLANK line is `''` rather than null because empty and unreadable are different facts

## Phase 2 — the three-layer answer
- Builds: 0132

- [x] `impact` groups by FILE, then names the ENCLOSING FUNCTION, then prints the line (ADR 0132)
- [x] Direct and indirect callers are labelled, never merged into one list
- [x] `--json` carries the same three fields — it already did; verified rather than assumed
- [x] The hand-derived fixture from ADR 0129 is the test subject — `impact-call-sites.test.ts`, run against the unfixed build first: the two new claims failed, the two controls passed

## Phase 3 — the same shape everywhere it applies
- Builds: 0132

- [ ] `query` prints the declaration line for each hit, so "where is X" ends in one answer too
- [ ] `trace` and `context` print the line at each step they already name
- [ ] Measure the cost: an answer over a 50-caller symbol must not read 50 files

## Acceptance measure

Not milliseconds. Take three real change tasks on this repository, and record whether the reader
opened a file after reading the answer. Conducks will not beat 17 ms and should stop trying — the
currency is round trips, and one answer that ends the question beats four grep-and-read cycles.

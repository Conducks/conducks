# todo39 — an answer shows the call site, not a list of names
Status: todo

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

- [ ] `edges.lineNumber` and the `lines` property reach the CLI answer layer for `impact` — measure first whether both survive today's query path, since a field that never arrives is the defect this project keeps finding
- [ ] A shared reader turns `(file, line)` into the trimmed source line, with one file read per distinct file in the answer, not one per call site
- [ ] A line the working tree no longer has says so, and never prints whatever now sits at that number

## Phase 2 — the three-layer answer
- Builds: 0132

- [ ] `impact` groups by FILE, then names the ENCLOSING FUNCTION, then prints the line — the shape in ADR 0132
- [ ] Direct and indirect callers are labelled, never merged into one list
- [ ] `--json` carries the same three fields so an agent gets what a human gets
- [ ] The hand-derived fixture from ADR 0129 is the test subject: `format` must report `fetchUser` with `return format(id);` and `main` marked indirect

## Phase 3 — the same shape everywhere it applies
- Builds: 0132

- [ ] `query` prints the declaration line for each hit, so "where is X" ends in one answer too
- [ ] `trace` and `context` print the line at each step they already name
- [ ] Measure the cost: an answer over a 50-caller symbol must not read 50 files

## Acceptance measure

Not milliseconds. Take three real change tasks on this repository, and record whether the reader
opened a file after reading the answer. Conducks will not beat 17 ms and should stop trying — the
currency is round trips, and one answer that ends the question beats four grep-and-read cycles.

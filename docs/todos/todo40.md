# todo40 — the graph knows what a symbol IS, not only where it sits
Status: done

- Acceptance: `explain <symbol>` returns the author's own description, `impact`/`query` carry its first line in the header, an undocumented symbol says so rather than inventing one, and `query --doc <term>` finds a symbol by its PURPOSE. Each proven by a test that fails without the harvest.
- Depends: none

## Context

ADR 0133. `context calculateSplitScore` today answers with its neighbours — `ConducksAdvisor,
getNeighbors, ConducksNode, math` — because the graph stores structure and no meaning. The question
"what does it do" has no answer from conducks or from grep.

The meaning is already written and already parsed. `calculateSplitScore` carries `Conducks —
SplitScore(M) = Betweenness(M) + Entropy(M) + Churn(M) - Cohesion(M)` one line above its declaration.
Tree-sitter walks that node on every pulse and discards the comment beside it.

## Phase 1 — measure before building
- Builds: 0133

- [x] Count leading-comment bytes — MEASURED: 1,037 JSDoc blocks, 256 KB across src/, 16.4% of source. In the vault it cost 0.3 MB in the column plus 0.3 MB duplicated in the metadata blob — 0.7%, as predicted
- [x] Check each grammar — MEASURED: every grammar already captures (comment) @comment, and Python ALSO captures (expression_statement (string)) @comment, its docstring form. Both positions covered, and the join is by LINE so no per-grammar parent walk is needed
- [x] Confirm the comment node is reachable — it already fired: CaptureTags.COMMENT reached the reflector for TODO/FIXME scanning and the prose beside it was discarded

## Phase 2 — harvest and store
- Builds: 0133

- [x] The reflector captures the doc comment attached to a declaration and carries it on the spectrum node
- [x] A real column on nodes, with an ALTER TABLE migration — adding it to CREATE alone would have broken EVERY existing vault, which the CLI fixture proved before the migration existed
- [x] The worker boundary is threaded — and the drop was NOT there: addNode keeps a FIXED property skeleton and discarded it at the graph boundary. Found by measurement, the join reporting attached:1 against a NULL column
- [x] An undocumented symbol stores NULL and is reported as undocumented, never inferred from its name

## Phase 3 — serve it, asymmetrically
- Builds: 0133

- [x] `explain` returns the full text, and prints (undocumented) where there is none
- [x] `query` prints the FIRST LINE under the declaration it belongs to; `explain` carries the full text. `impact` and `context` deliberately do NOT — their rows are CALLERS and STEPS, and a description per row is the noise this task forbids
- [x] No docstring is printed per caller in a list — the serving is asymmetric on purpose
- [x] `--json` carries `doc` on `explain` and on `query --doc`; the first line is DERIVED at answer time rather than stored, so a vault-loaded node needs only the column

## Phase 4 — search by purpose
- Builds: 0133

- [x] `query --doc <term>` matches against the harvested text — answered from SQL, which is why ADR 0133 refused to put it in the metadata blob
- [x] The result states whether it matched the NAME or the PURPOSE
- [x] Measured against rg retry on this repository: 16 text lines across 8 files, versus 4 symbols whose DESCRIPTION mentions retry — including regenerate, found by its prose rather than its name

## Not in scope

Generating a summary where none was written. The author's sentence is evidence; a generated one is a
guess wearing the same font. Where no docstring exists the answer is "undocumented" — which is itself
a fact about the codebase worth reporting.

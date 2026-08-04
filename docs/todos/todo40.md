# todo40 — the graph knows what a symbol IS, not only where it sits
Status: todo

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

- [ ] Count leading-comment bytes across this repository and compare against the 23 MB vault, so the storage cost is known rather than assumed
- [ ] Check each grammar for where a doc comment lives — JSDoc above, Python docstring INSIDE the body — and write down which languages are actually covered
- [ ] Confirm the comment node is reachable from the declaration node in the tree-sitter walk that already runs, so this is a harvest and not a second parse

## Phase 2 — harvest and store
- Builds: 0133

- [ ] The reflector captures the doc comment attached to a declaration and carries it on the spectrum node
- [ ] A real column on `nodes`, not a field in the metadata blob, because a column can be searched
- [ ] The worker boundary is threaded — parsing happens in a subprocess, and a field that is not passed through arrives empty with nothing warning you (the ADR 0108 trap)
- [ ] An undocumented symbol stores NULL and is reported as undocumented, never inferred from its name

## Phase 3 — serve it, asymmetrically
- Builds: 0133

- [ ] `explain` returns the full text
- [ ] `impact`, `query` and `context` print the FIRST LINE in the header of the symbol they are about
- [ ] No docstring is printed per caller in a list — a docstring per row is noise
- [ ] `--json` carries `doc` and `docFirstLine` so an agent gets what a human gets

## Phase 4 — search by purpose
- Builds: 0133

- [ ] `query --doc <term>` matches against the harvested text, so "the function that mentions retry" is answerable
- [ ] The result states whether it matched the NAME or the PURPOSE, because those are different claims
- [ ] Measured against `rg retry` on this repository: record what each returns and which one a reader can act on

## Not in scope

Generating a summary where none was written. The author's sentence is evidence; a generated one is a
guess wearing the same font. Where no docstring exists the answer is "undocumented" — which is itself
a fact about the codebase worth reporting.

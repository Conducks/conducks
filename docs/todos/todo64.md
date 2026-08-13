# todo64 — the linker's dynamic-import rebind is unreachable, and only its own fixture still proves it
Status: todo
- Acceptance: either block 3b is deleted and the whole suite still passes, or a REAL parsed input is found that needs it and `dynamic-import-scoped-alias.test.ts` is rewritten to produce that input rather than hand-building a graph.

## Context

`IntraLinker` block 3b (`linker-intra.ts`, "A dynamic import inside a function: the call landed on
the LOCAL") was todo58's fix: a destructured dynamic import minted a MODULE-LEVEL binding with an
ALIASES edge while the call resolved to a function-scoped local, so the two never met and live code
read as dead.

todo62 changed the input it reads. The alias edge is now emitted against the id the binding node is
actually stored under, which for a dynamic import inside a function is SCOPED (`<file>::main2.doit`).
Block 3b skips those by design — `if (name.includes('.')) continue; // already scoped` — so the
shape it was written for is no longer produced. Block 3a (the "pure alias" follow) now covers the
case instead, because the alias source is a real node with an outgoing ALIASES edge.

MEASURED, by starving 3b's map and running everything:

| | result |
|---|---|
| full suite with 3b starved | **1,827 of 1,829 pass** |
| the 2 failures | both in `dynamic-import-scoped-alias.test.ts`, which hand-builds the graph |
| `prune-precision` scored fixture (real parse, function-scoped) | passes without 3b |
| module-level `const { x } = await import(...)` (real parse) | resolves without 3b |
| sofie / orchestrator baselines | unchanged by todo62 except the alias improvement already recorded |

So the only thing keeping 3b covered is a fixture that constructs the pre-todo62 id shape by hand.
That is CONDUCKS-28's trap one level up: the fixture and the code agree with each other and no longer
agree with the parser.

## Phase 0 — decide whether it is dead or merely unexercised here

- [ ] TypeScript is not the only producer. Check whether any other language's queries still emit an UNSCOPED module-level binding for a destructured dynamic import — if one does, 3b is live for that language and the answer is a fixture in that language, not a deletion
- [ ] Check the case 3b names that the fixtures above may not cover: a dynamic import whose destructured name is ALSO declared as a same-named local elsewhere in the file. 3a follows an alias edge; it does not do 3b's same-file, same-name rebind, and the two are not obviously equivalent under shadowing
- [ ] Only then delete or keep. If it is deleted, `dynamic-import-scoped-alias.test.ts` goes with it and its two controls move to the scored fixture, which drives a real parse

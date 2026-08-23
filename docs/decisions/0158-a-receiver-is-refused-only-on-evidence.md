# 0158 — a receiver is refused on evidence, never on absence
Status: Accepted
- Date: 2026-08-24
- Builds: 0070
- Enforced by: tests/integration/features/receiver-scoped-calls.test.ts (twelve cases — four bindings that must not exist, six that must survive, and two that assert a remaining gap as it behaves; the four ran red against the unfixed build)

## Context

Step 3c of the intra-file linker resolves `receiver.method` by throwing the receiver away and looking
the METHOD up in the units this file imports. Its own comment names import-scoping as the safety
rail: `path.join` stays dangling because no imported unit owns a `join`.

That rail holds only while no imported unit owns a method of that name. The moment one does, the
receiver that would have settled it has already been discarded. `asyncio.run(main())` in a file that
imports a module owning `run` bound to THAT `run`.

MEASURED before touching anything, by reading each cited source line back and classifying it:
**19 of 2,372 call sites on the scraper subject (0.80%)** and **5 of 9,280 on sofie (0.05%)** bound a
project symbol under a receiver that is an external module. Corpus-wide that is small. It concentrates
on hub names — `JobRunner.run` had one false caller of four, and on the minimal fixture `Worker.run`
had three of five.

Two facts found while measuring, both of which changed the fix:

- **TypeScript never had this.** `Math.min` resolves to `global::math` and `os.cpus()` to
  `node:os::default.cpus` before reaching 3c. The bug is Python's, because Python arrives with
  nothing: `import asyncio` records a `DEPENDS_ON -> ecosystem::asyncio` edge but no `IMPORTS` edge,
  and an aliased `import numpy as np` recorded **nothing at all** — no node, no edge, invisible to
  `supply-chain` as well as to the resolver.
- **The first fix was the wrong polarity and it deleted true edges.** It asked "is the receiver
  something this file has?" and refused whatever could not be found. That removed all 19 false
  bindings and **four true ones with them**: `obs.on_step_start(...)` where `obs` iterates
  `self._observers: List[BaseObserver]`, and `ext.extract(page)` where `ext` iterates a list of
  extractors. Loop variables are not captured as nodes — only assigned locals are — so no lookup can
  find them, and "not found" is not evidence.

## Decision

**Refuse only what can be named.** Step 3c falls back to the bare method name unless the receiver is
positively identified as an external module this file imported, read from the
`DEPENDS_ON -> ecosystem::<pkg>` edges. Everything else proceeds exactly as before.

The two errors are not symmetric, and that asymmetry is the whole argument. A false caller inflates a
blast radius and the reader can check it against the line the tool prints. A missing caller answers
"nothing depends on this" about code something depends on, and there is nothing to check. So a rule
that guesses wrong in the direction of keeping an edge is the safer rule, and this one only ever
removes an edge it can justify by name.

**Separately, the Python import query now captures aliased imports.**
`(import_statement (dotted_name) @source)` does not match `import numpy as np`, whose dotted name
sits inside an `(aliased_import)`. The `import_from_statement` branch had handled aliases since it
was written; the plain-import branch had not. That was not only a resolver problem: on a two-file
fixture `supply-chain` reported "stdlib 2 distinct" and **zero dependencies** with numpy absent from
every surface.

**Rejected: refuse whenever the receiver has no resolvable type.** Measured, and it costs four true
edges per 4,825 on one subject — see Context. The counter-tests in the enforcing file exist because
this was tried first.

**Rejected: a hardcoded list of stdlib module names.** It would cover `asyncio` and miss `np`, `aio`
and every project-local alias, while pretending to be complete. The graph already knows which
packages a file imports; a list beside it is a second source of truth that starts wrong for anything
vendored.

**Rejected: fix the alias receiver too, in this change.** The parser now records the PACKAGE for an
aliased import, not the alias, and a repeat import of a package already seen is deduplicated — so
`aio` reaches the graph nowhere. Closing it means carrying the local name on the edge, which is a
wider change than this record's measurement justifies. It is asserted as a gap instead.

## Consequences

- Measured after, on the same subjects, by diffing every `CALLS` edge before and after: **11 edges
  changed target on scraper and all 11 were false bindings** — `asyncio.run`, `asyncio.Semaphore`,
  `pathlib.Path`, `csv.reader`, `uvicorn.Config`, `uvicorn.Server`, `collections.items`. Sixteen
  edges appeared pointing at the correct EXTERNAL node instead, so the call sites were re-attributed
  rather than lost, and the total is unchanged at 4,825.
- The four true edges the first attempt deleted are present: 11 observer edges and the
  `BaseExtractor.extract` edge.
- External-receiver false bindings: scraper **19 → 0**, sofie **5 → 1**. The one remaining is
  `const cpus = os.cpus() ?? []`, where the call binds to the local being assigned on the same line —
  a different mechanism, in TypeScript, and out of scope here.
- `supply-chain` now sees aliased dependencies. Any project using `import numpy as np` was under-
  reporting its third-party surface, and nothing said so.
- The alias gap is asserted as it behaves, not as it should. Those two cases FAIL when someone closes
  it, which is the point — the fix is to flip them back to `not.toContain`.

Open: the sofie case above suggests a second shape — a call whose target is the local variable being
assigned from it. One edge measured, mechanism not investigated, no todo carries it.

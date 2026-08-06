# core/parsing/processors — capture → relationship

**Part of:** [core/parsing](../parsing.md). Five small units: `parsing/processors/import.ts`,
`parsing/processors/call.ts`, `parsing/processors/heritage.ts`, `parsing/processors/binding.ts`,
`parsing/processors/flow.ts`.

**Responsibility:** turning a raw capture into a spectrum relationship, and resolving what can be
resolved with only the current file in hand. `import` additionally owns module resolution — extension
inference, index files, external-package detection.

**Boundaries:** file-local only. Anything needing the whole repo (binding a bare name to a symbol in
another file) is the orchestrator's later pass; a processor emits an unresolved target and lets it
dangle deliberately.

**Deferred / not built:** `heritage` is written and correct but **never runs** — its query patterns
are standalone so no node exists for the handler's gate, and the graph has zero EXTENDS/IMPLEMENTS
edges as a result (todo11). Anything reasoning about inheritance today is reasoning about nothing.

## Preserve the original spelling or you break type/value classification

Node IDs are lowercased downstream (mandatory for APFS), which collapses TypeScript's type and value
namespaces — the variable `nodeId` and the type `NodeId` become one key `nodeid`. A processor that
emits only a lowercased name makes the variable's uses indistinguishable from the type's.

So every name-bearing relationship carries the pre-lowercase spelling in `metadata.original`
(`call.ts` sets it as `original`, flow assignments and reference-as-value ACCESSES likewise). This is
not optional bookkeeping: skipping it caused a false ARCH-3 cycle that survived two ADRs, because a
parameter named `nodeId` marked the imported *type* `NodeId` as value-used.

**A new processor emitting a named relationship must set `metadata.original`.**

## Resolution is guarded across language families

Import and symbol resolution falls back to fuzzy basename matching, which will happily bind a `.py`
import to a same-named `.tsx` or `.go` file. `sameFamily()` guards every tier that can do this. The
guard exists because the confidence-1 resolution path produced most of the false cross-language edges
before it was added — do not add a resolution tier without it.

## Reference-as-value is deliberately narrow

A bare identifier passed as an argument (`addEventListener('load', initUI)`) is a *use*, not a call,
and the call processor only records the callee. Those candidates are collected during the match loop
and emitted afterwards, gated on "imported here or defined in this file" — without the gate, every
local variable would flood the graph with danglers.

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

**Deferred / not built:** nothing outstanding here.

`heritage` used to be described as "written and correct but never runs" — its patterns were
standalone, so no node existed for the handler's gate and the graph carried zero EXTENDS/IMPLEMENTS
edges. **That was fixed, and the sentence outlived it.** Every heritage pattern co-captures a
definition node now, and `tools/benchmark/oracle-packs.mjs` fails the build if any of the ten packs
claiming a heritage capture stops producing an edge for a two-line fixture — three packs (ruby, rust,
php) were caught emitting none by exactly that check on 2026-08-17, with every other gate green.

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

Import and symbol resolution falls back to basename matching, which will happily bind a `.py` import
to a same-named `.tsx` or `.go` file if nothing stops it. Two different guards do, and they are not
the same guard — this section claimed `sameFamily()` covered every tier, and it does not:

- **`sameFamily()`** guards the graph-side tiers, called from
  <span class="anchor">src/lib/domain/analysis/reflection-pipeline.ts:128</span>. It fails OPEN on an
  unknown extension by design, so a newly added language is not refused wholesale.
- **The PARSE-time fallback in `import.ts` is guarded by UNIQUENESS and by refusal**, not by family:
  a declared dependency or a provider-declared boundary module returns undefined before it
  (<span class="anchor">src/lib/core/parsing/processors/import.ts:241</span>), and a basename that
  matches more than one file answers nothing. a barrel basename occurs 24 times in this repository, so
  guessing there is right about one time in twenty-four.

Refusing costs an edge; guessing costs a WRONG edge, and a wrong edge is what `impact` and `trace`
then walk. Do not add a resolution tier without deciding which of the two guards it needs.

Same family is not enough on its own: the fallback also binds within a family, so a repo owning its own typing.py captured every `from typing import ...` in it (316 dangling edges, measured). A
provider can now REFUSE a specifier outright — `isBoundaryModule` (ADR 0143), Python's standard
library — and a refusal skips the fallback while still falling through to induction. Refusing by
returning `undefined` from `resolveImport` does NOT work and is the bug that ADR names: it is the
same token the processor reads as "I don't know".

## Reference-as-value is deliberately narrow

A bare identifier passed as an argument (`addEventListener('load', initUI)`) is a *use*, not a call,
and the call processor only records the callee. Those candidates are collected during the match loop
and emitted afterwards, gated on "imported here or defined in this file" — without the gate, every
local variable would flood the graph with danglers.

# 0026 — Two dead modules removed; DAAC and the old plugin base need a decision, not a delete

Status: Accepted
- Amended by: 0028
- Enforced by: `conducks prune` (the finding list this ADR resolves)
- Date: 2026-07-26
- Promoted: docs/memory.md (the symbol-grep audit and the two open questions)

> **Amended by 0028.** Both open questions are now closed. `parsing/language-plugin.ts` stays.
> `clustering/daac.ts` is DELETED — and this record's description of it as "the more capable of the
> two" was wrong: measured against the live graph it is a no-op that returns one cluster per file,
> because it looks up edges by file path in a graph keyed by node id. The rule this ADR set still
> holds; the claim it made in passing did not.

## Context
`conducks prune` reports 18 ORPHAN and 5 UNUSED_EXPORT findings on conducks itself. Most are known
false positives already recorded in `memory.md`: dependency-injection getters on the registry, a
browser entry point with no import edge, and type-only exports the compiler erases. Five looked
genuinely unreferenced.

Verifying them exposed a mistake in the verification itself. The first pass matched import PATHS
(`python/resolver.js`) and reported `PythonResolver` as dead. It is not: `python/index.ts` imports it
relatively (`./resolver.js`) and instantiates it on line 21 — deleting it would have broken Python
import resolution. `memory.md` already prescribes the correct method, a bare SYMBOL grep excluding
the defining file, and it would have caught this immediately.

The remaining four split into two kinds, and the difference matters more than the count. Some are
orphaned by DISCONNECT — they were wired, the wiring was removed, nothing replaced the intent. Others
are orphaned BY CHOICE, or by nothing at all: a capability sitting unwired with no record of a
decision either way.

## Decision
**Removed, both disconnected with the disconnection already evidenced:**

- `src/registry/dynamic-loader.ts` — an alternative MCP tool-loading path that scanned a directory
  named by `conducks.config.json`. The live surface imports `synapseTools` and `kineticTools`
  statically in `server.ts`; nothing constructs the loader. `memory.md` already recorded that its
  liveness came from a re-export through `tool-registry` which no longer exists. Its config resource
  went with it — that file also described conducks as shipping frontend, backend, security and
  presentation standards, which a live convention forbids.
- `src/lib/domain/governance/config-detector.ts` — 57 lines, zero importers, zero mentions in any
  doc, no replacement needed.

**Left in place, because deleting them would destroy a decision nobody made:**

- `src/lib/core/algorithms/clustering/daac.ts` — 149 lines of directory-aware agglomerative
  clustering, unreferenced. What clusters today is `mirror.engine.detectCluster()`, a simpler
  directory heuristic. DAAC is the more capable of the two and is sitting unwired with no record of
  why. Research it and then either wire it as the clustering implementation or delete it with the
  reason written down.
- `src/lib/core/parsing/language-plugin.ts` — an older `LanguagePlugin` abstract class superseded by
  `ILanguagePlugin` in `src/types/language-plugin.ts`, which every language plugin implements. It
  reads as a stale duplicate, but a todo carries `DECISION = KEEP — language-plugin API contract` on
  a `language-plugin.ts:51`, and which of the two files that line means is unresolved.

**The rule this sets:** an unreferenced module is a QUESTION, not a finding. Answer "was this
disconnected, or never connected?" before deleting. A capability with no recorded decision gets a
decision first — deferred and dropped are different states, and a delete erases the difference.

## Consequences
Two modules and one resource file leave the tree, and the build no longer carries their compiled
output — `tsc` never removed output for deleted sources, so `build/` had accumulated ten stale `.js`
files whose `.ts` was long gone. The build script now clears its output directory first.

`prune`'s reputation improves by being contradicted in the open: of 23 findings, 2 were removable, 1
was a live module the tool called an orphan, and 2 need a human decision. The tool stays advisory,
which is what it claims to be.

The cost is two known-unreferenced files still compiling and shipping until someone answers their
question. That is deliberate: a wrong delete is a silent capability loss, and a file that costs a few
kilobytes is the cheaper side of the trade.

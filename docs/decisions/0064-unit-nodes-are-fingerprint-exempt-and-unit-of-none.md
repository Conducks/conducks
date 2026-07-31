# 0064 — a UNIT is exempt from `fingerprint`, and its own `unitId` is null
Status: Accepted
- Enforced by: tests/unit/domain/evolution/fingerprint-coverage.test.ts (UNIT node has unitId=null and no fingerprint; a route/request virtual node and a Gnosis-parsed symbol both get a fingerprint; a fingerprint-less node_history row is reported, not read as unchanged)
- Date: 2026-07-31

## Context

todo4 ("Universal Structural DNA Schema Reshape") claimed every node carries `fingerprint`,
`unitId` and `layer_path`. Measuring the live vault on 2026-07-31 (todo26) found 670 file-backed
nodes with no `fingerprint`, 330 with no `unitId`, 334 with no `layer_path` — using a loose
"file-backed" filter that, it turned out, counted `external://` placeholder nodes and
`taxonomy::`/`ecosystem::` legend anchors as if they were real source files.

Re-measured against the actual vault with that noise removed:

```
canonicalKind  total  missing_fingerprint  missing_unitId  missing_layer_path
ATOM            1961            1               0               0
BEHAVIOR         803            4               0               4
UNIT             494          494 (100%)       159             159
STRUCTURE        269            0               0               0
PACKAGE            2            0               0               0
```

Two things stood out. First, `fingerprint` is missing for **every single UNIT node, always** —
not a partial gap like the others, a universal one. `reflector.ts`'s `unitNode` object (the file
node itself, built once per file at the top of `reflect()`) has never included a `fingerprint`
field, in either the native tree-sitter path or the Gnosis regex fallback. That is not 500 bugs;
it is one line never written, everywhere, which is what "by design" looks like from the outside —
but todo26 explicitly forbids inferring that without reading the code that writes the column, so
this record is that reading.

Second, the 4 BEHAVIOR / 1 ATOM rows with a real gap were not files with broken parsing — they
were `ROUTE::…` / `REQUEST::…` virtual nodes (`FlowProcessor.processRoute`/`processRequest` push
these straight onto `spectrum.nodes`, bypassing the `nodeCache` path where every captured
definition gets a fingerprint at reflector.ts:355) and Gnosis-fallback class/function nodes (the
regex extractor at the bottom of reflector.ts never computed `fingerprint` or `layer_path` at
all). Those ARE real, file-backed symbols, and the gap in them is a bug, not a design.

The 159 UNIT rows missing `unitId`/`layer_path` were a third thing again: files with no matching
language provider (132 `.md`, plus `.mjs`, `.cjs`, `.json`, `.html`, `.yml`, `.txt`, `.npmrc`,
`.gitignore`, one extensionless file) that never reach `reflector.ts` at all — they get only the
bare stub `graph-skeleton-builder.ts` writes for every discovered file (id, name, filePath,
canonicalKind, parentId, rootId — no `unitId`, no `layer_path`, no `fingerprint`). That file is
not owned by this change (see `- Open:` below) and is a separate, already-narrower gap.

## Decision

**A UNIT is exempt from `fingerprint`.** The column is a hash of a *symbol's* structural
identity — `sha256(filePath|name|JSON(dna))`, computed at reflector.ts:355, where `dna` is
`isAsync`/`isAbstract`/`isExported`/`isStatic` — properties a declaration has and a file does not.
A file's identity is already exactly its own path, which is the entire basis of its node id
(`${path}::unit`); hashing `path|filename|{}` would be a redundant re-hash of the path with zero
discriminating power, and would not even serve the use case fingerprint exists for (drift-engine's
move detection, "same DNA different id") — a moved file gets a wholly new id with nothing to
connect it to the old one regardless of whether it carries a hash of nothing. Detecting a moved,
content-unchanged file is a real, different, unbuilt feature (a whole-file content hash), and nobody
has asked for it. `DIRECTORY`, `ECOSYSTEM`, `REPOSITORY` and `PACKAGE` are exempt for the same
reason already given in todo26's own context: no source file, no structural identity to hash.

**A route/request virtual node and a Gnosis-fallback symbol are NOT exempt** — both are real
declarations with a stable source location, and both were simply never wired to the
fingerprint-computing code path. Fixed in reflector.ts: the merge step that folds `FlowProcessor`'s
virtual nodes into `spectrum.nodes` now backfills `fingerprint`/`layer_path`/`unitId` for any node
that reached it without one, hashing the same way (`file.path|name|JSON(metadata)`); `reflectGnosis`
now computes both fields for its class and function nodes, using a best-effort `dna` (Gnosis has no
modifier captures, so only `isExported`/`isAsync` are readable off the raw line; the rest default
false).

**`unitId` on a UNIT node's own row is `null`, not itself.** `persistence.ts:531` already states
the rule in prose — "a unit's own row has `unitId = NULL` — it IS the unit, so it belongs to
none" — and `purgeUnits` is written against it (`owns = (unitId IN (…) OR id IN (…))`, matching a
unit's own row by `id`, not `unitId`). `reflector.ts`'s native `unitNode`, however, set
`unitId: fileId` (itself) — the same self-loop shape ADR 0056 already named and fixed for
`parentId`, just on a different column, and not yet caught. Unlike `parentId`, nothing walks
`unitId` transitively (it is a flat foreign key everywhere it is read — `query-service.ts`,
`linker-intra.ts`, `dead-code.ts`), so the self-loop never caused a hang or an infinite walk; it
was simply wrong, silently, next to code that already assumed it wasn't. Fixed: the native
`unitNode` now sets `unitId: null`. Symbol nodes are unaffected — they already set `unitId: fileId`
directly from the `fileId` variable, not by reading it back off `unitNode`.

**Not chosen: giving every UNIT node a whole-file content hash instead of exempting it.** That
would answer a real, currently-unasked question (file-level move detection) at the cost of a
second hash algorithm, a second column meaning, and a scope well past todo26's acceptance line
("no node-history row is excluded... by a missing fingerprint" — about symbols, not files). If
file-move detection is ever wanted, it is new work, not this cleanup.

**Not chosen: leaving `reflector.ts`'s `unitId: fileId` in place because `graph-engine.ts`
overrides it anyway.** `graph-engine.ts:ingestSpectrum` (not owned by this change) unconditionally
sets `unitId: unitId || null` on every node in a spectrum — including the file's own node — using
the pipeline's own `${filePath}::unit` parameter, which happens to equal the same self-referential
value regardless of what `reflector.ts` emits. So today this fix has no effect on what lands in the
vault for a file that goes through `reflect()`; only the intermediate spectrum object changes.
Leaving the source of truth wrong because a downstream bug currently masks it was rejected: the
downstream override is itself wrong by the same rule stated above, `reflector.ts` is the one file
in reach of this change, and correcting it here is what lets `graph-engine.ts` be fixed later
without also having to un-learn a second wrong convention.

**drift-engine.ts must not read a fingerprint gap as "nothing changed".** `isShifted = current !==
prev` was `false` when both sides were `null` (JS `null !== null` is `false`), and the velocity
filter (`Math.abs(velocity) > 0.001 || isModified`) then dropped that row from `deltas` entirely
when gravity/complexity hadn't moved either — the ADR 0044 failure ("a check that ran on nothing is
not a pass") on drift's other join key. Fixed: each delta now carries `identityGap` (true when
either side's fingerprint is `null`), the filter keeps a gap row instead of discarding it, and the
summary/message name the count explicitly rather than folding it into "stable". A UNIT row will
always be `identityGap: true` by this same decision — that is correct, not a residual bug: a UNIT
was never eligible for structural-shift detection, and the result must say so.

## Consequences

`DriftResult.deltas[].identityGap` and `DriftResult.summary.identity_gap_count` are new,
non-optional fields. Nothing in-tree constructs a `DriftResult` outside `drift-engine.ts` itself;
`guard.ts` and `evolution/index.ts` only read it, and `npx tsc --noEmit` is clean against both.

`Open:` `graph-engine.ts:ingestSpectrum` still forces every reflected UNIT node's `unitId` to
itself, so the live vault will keep showing self-referential `unitId` for reflected files until
that file is also fixed — this record only corrects the value `reflector.ts` emits. Separately,
159 UNIT rows have no `unitId`/`layer_path` because their file extension has no registered
provider and they never reach `reflector.ts` at all (`graph-skeleton-builder.ts`'s bare stub is
all they get); whether that is a gap or by-design for a non-code file (a `.md`/`.json`/`.gitignore`
has no layer to report) is not decided here. No todo carries either yet — both are reported as
blocked findings in the todo26 handover, not filed as new work, because neither file is owned by
this change.

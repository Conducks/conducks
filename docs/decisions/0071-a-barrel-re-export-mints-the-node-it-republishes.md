# 0071 — a barrel re-export mints the node it republishes
Status: Accepted
- Enforced by: tests/unit/domain/analysis/reexport-resolution.test.ts (a renamed and a plain barrel
  re-export both mint a real node for the public binding a downstream importer expects; the renamed
  case also emits a durable ALIASES edge that IntraLinker resolves to the true cross-file definition)
- Builds: 0053, 0070
- Date: 2026-07-31

## Context

ADR 0070 fixed the alias-resolution defect that made an unresolvable `@/` alias guess a wrong file by
basename. Re-measuring the mentorseed monorepo vault (5 services, 974 units, `.conducks/conducks-
synapse.db`, opened read-only) after that fix shows the alias-to-FILE resolution now works: 193
`IMPORTS` edges still dangle, but every one resolves its specifier to a real, in-scope file. The
defect is one layer deeper.

```sql
select e.targetId, count(*) c from edges e
where e.type = 'IMPORTS' and not exists (select 1 from nodes n where n.id = e.targetId)
group by e.targetId order by c desc limit 3;
```

```
packages/core/database/server/index.ts::db      103
packages/core/server.ts::db                       26
packages/core/database/server/index.ts::query      10
```

`packages/core/database/server/index.ts` reads:

```ts
export { coreDb as db, coreDb, pool, corePool, query, transaction } from './DatabaseManager';
export { CoreDatabaseManager as DatabaseManager } from './DatabaseManager';
```

An importer writes `import { db } from '@/core/database/server'`. The alias resolves to that file
correctly (ADR 0070). `reflection-pipeline.ts` then builds the per-binding target as
`${resolvedFile}::${bindingName}` — `.../server/index.ts::db`. But `db` is not DEFINED in `index.ts`.
It is re-exported from `./DatabaseManager` under a different name (`coreDb`). No node with that id was
ever created, so the edge dangles. `packages/core/server.ts::db` (26 edges) is the identical shape one
hop further out — `server.ts` itself re-exports `db` from `./database/server`, chaining the barrel.
Sampling the full 193: 182 target an `index.ts` or `server.ts` barrel's re-exported binding name, both
renamed (`coreDb as db`) and plain (`query`, `pool`, `hasAnyRole`, `VettingCard`, …); the remaining 11
are unrelated shapes out of this record's scope.

**Does the parser capture re-exports at all?** Before this fix: only at the whole-file level.
`(export_statement source: (string) @source) @isImport` in `queries.ts` matches `export { ... } from
'./x'` and seeds one `isRaw` `IMPORTS` relationship for the specifier — enough for `reflection-
pipeline.ts`'s whole-file `NEURAL::` edge (`index.ts::unit -> DatabaseManager.ts::unit`), which is why
that edge never dangled. Nothing captured WHICH names the statement republishes, or whether any were
renamed. `reflector.ts`'s per-binding path (the one that populates `bindingName` in edge metadata) only
fired for `import_statement`'s `named_imports`, never for `export_statement`'s `export_clause`.

**Where does the chain get followed?** Not at parse time: the orchestrator parses in waves of 500 and
clears the in-memory graph between them (`analyze()`, "Flush Chunk to Vault & Clear RAM"), so a barrel
file parsed in one wave cannot look up what `./DatabaseManager` exports if that file lands in a
different wave — the reason a `graph.hasNode()` guard was already rejected once, in ADR 0070's own
"not chosen" list, for the same class of cross-wave timing bug. `IntraLinker` (`linker-intra.ts`) runs
once, after every wave is flushed and the full graph is reloaded, precisely to rebind targets that
could not be resolved while streaming — CALLS, TYPE_REFERENCE and friends already go through it.

## Decision

**Mint a real node for every name a barrel republishes, at the barrel file's own parse time — this
requires no cross-file information — and let `IntraLinker`'s already-classified `ALIASES` edge type
carry the rename through to its real definition in a later pass.** Two additions, `queries.ts` only:

```
(export_statement
  (export_clause (export_specifier name: (identifier) @alias alias: (identifier) @name))
  source: (string) @source) @isBinding
(export_statement
  (export_clause (export_specifier name: (identifier) @name !alias))
  source: (string) @source) @isBinding
```

`@name` is tagged onto the grammar's PUBLIC name — the `alias:` field when the specifier renames (`x
as y`), the plain `name:` field otherwise. `@isBinding` is a `DEFINITION_CAPTURES` member
(`capture-tags.ts`), so `reflector.ts`'s EXISTING, unmodified node-creation path (~L322) mints
`<barrelFile>::<publicName>` — the exact id `reflection-pipeline.ts`'s per-binding `BIND::` block
already builds for a downstream importer. That is not the guess ADR 0070 refused: the guess there
fabricated a TARGET from a basename coincidence with no supporting syntax; this reads the barrel
file's own AST, which states outright that it exports a binding by this name. Same certainty as any
other declaration in the file.

The renamed pattern also tags the grammar's `name:` field (the ORIGINAL symbol, `coreDb`) as `@alias`.
`reflector.ts` already has a branch for exactly this (`cName === 'alias' && node`, ~L539) that calls
`BindingProcessor.processAlias` and emits a durable `ALIASES` relationship, `publicName -> originalName`
— existing code, reachable today only from a Go/PHP import pattern that itself never resolves (no
`@name` capture in that pattern, so `reflector.ts` never builds the `node` the branch requires; left
alone, out of scope here). `IntraLinker` already classifies `ALIASES` as `RESOLVABLE` (ADR 0053's
table), so the bare `coredb` target that `ALIASES` edge carries gets scoped to the files the barrel
imports and rebound to the real cross-file definition in the same post-wave pass CALLS and
TYPE_REFERENCE already use — no new resolution code.

**No edits to `reflector.ts`, `reflection-pipeline.ts`, `import.ts` or `linker-intra.ts`.** All three
mechanisms this fix leans on — `DEFINITION_CAPTURES`-triggered node creation, the `alias`-branch
`ALIASES` emission, and `IntraLinker`'s `RESOLVABLE` table — were already built and wired end to end;
no query in any language ever reached them for this shape. Verified against the real grammar
(`tree-sitter-typescript` 0.23.2, `Parser.Query.matches()` on the fixture in this record's own test)
before landing: `export_specifier` carries `name`/`alias` fields identically to `import_specifier`, in
left-to-right source order, and `!alias` correctly restricts the plain-re-export pattern to
specifiers with no `alias:` field so the two patterns never double-match one specifier.

**Not chosen: reading the target file's exports at parse time.** `reflection-pipeline.ts`'s
`BIND::` block already resolves the specifier to a file via `ImportProcessor.link()`; the missing step
looked like "check whether the target defines `bindingName`". That check needs the target file's
symbol table, which may not exist yet — the wave-clearing problem this record's Context section states
plainly, and the reason ADR 0070 rejected a same-shaped `hasNode()` guard for a different edge kind.

**Not chosen: resolving the barrel's export table in one step, at the point the downstream `BIND::`
edge is built.** Same wave-boundary defect as above, from the other direction: the importer's wave has
no guarantee the barrel's own wave — let alone the barrel's OWN import target's wave — has run.
Minting the node at the barrel's own parse time sidesteps the ordering question entirely: it needs
nothing about any other file, only the barrel's own syntax.

**Not chosen: walking the full re-export chain to the root definition in this record.** A barrel can
re-export another barrel (`server.ts` re-exporting `packages/core/database/server`'s `db`, itself
re-exported from `DatabaseManager.ts` — measured in the Context section above, a real two-hop chain in
this monorepo), and a chain can cycle. This fix resolves ONE hop per `IntraLinker` pass by construction
— `unitImports` only ever names files the CURRENT file imports — so a two-hop chain's `ALIASES` edge
lands on the middle barrel's own (now real) node, not the ultimate definition. That is an honest,
non-fabricated partial answer, not a broken one, and it is what closes the dangling-edge defect this
record exists to fix: the downstream `BIND::` edge no longer targets a node that does not exist,
regardless of how many hops the chain has, because a node now exists at every hop independently.
Walking `IntraLinker` to a fixed point (rerunning until no edge moves, with cycle detection) is a real,
scoped feature and is not built here.

**Not chosen: also handling `export * from './x'`.** No syntax carries a symbol name to key a node by
— the whole point of `*` is that the re-exported set is not enumerated at the re-exporting file. This
needs the target's exports at resolution time, the same cross-wave information problem, and cannot be
answered by reading the barrel file's own AST the way the two patterns above can. Left unfixed;
`packages/core/database/server/index.ts` itself contains one (`export * from '../shared/types'`), so
this is a real, present gap, not a hypothetical one.

## Consequences

Proven with unit tests (`tests/unit/domain/analysis/reexport-resolution.test.ts`) on a fixture built to
the exact mentorseed shape from this record's Context section — `coreDb as db` (renamed) and `pool`
(plain) re-exported from one `export { ... } from './DatabaseManager'` statement, plus two downstream
importers:

| | before this fix | after this fix |
|---|---|---|
| node exists at the renamed public binding's id (`index.ts::db`) | no | yes |
| node exists at the plain re-exported binding's id (`index.ts::pool`) | no | yes |
| downstream `BIND::` edge for the renamed binding | dangles | targets the real node above |
| downstream `BIND::` edge for the plain binding | dangles | targets the real node above |
| `ALIASES` edge from the renamed binding to its original name | none | `index.ts::db -> coredb` (bare) |
| `ALIASES` edge from a plain (non-renamed) re-export | none | none — correctly not fabricated |

A second, `linker-intra.ts`-only unit test proves `IntraLinker` resolves that bare `ALIASES` edge to
the real cross-file definition (`DatabaseManager.ts::coredb`), scoped through the barrel's own already-
resolved whole-file `IMPORTS` edge — the same mechanism, unmodified, that already resolves bare
`CALLS`/`TYPE_REFERENCE` targets.

Reverting the `queries.ts` change and rerunning the suite reproduces exactly the field shape: the
renamed- and plain-binding node-existence and `BIND::`-edge assertions fail (3 of 5 tests), while the
two assertions that do not depend on the new patterns — no fabricated `ALIASES` edge for a plain
re-export, and `IntraLinker`'s handling of a hand-built bare `ALIASES` edge — still pass, confirming
they pin something real rather than something the fixture would pass regardless.

`Open:` the end-to-end effect on the field measurement (193 dangling `IMPORTS` targets out of 18,673
total edges, mentorseed's shared vault) is unverified here — this task ran under a rule barring
`conducks analyze` on either repository while other work held both vaults. Read-only inspection of the
193 dangling targets' owning files (`packages/core/database/server/index.ts`,
`packages/core/server.ts`, `packages/core/auth/server/index.ts`, `admin/src/components/ui/card/
index.tsx`, and others) confirms every one sampled is a plain `export { a, b as c } from './x'`
statement of the shape this fix handles — 182 of the 193 by direct query, matching the field number
quoted when this task was assigned — but the vault predates this fix and cannot be re-measured
end-to-end from inside this task. Re-running `analyze` against mentorseed and re-counting dangling
`IMPORTS` edges is the next step. No todo carries this yet.

`Open:` `export * from './x'` re-exports are a live, unmeasured gap this record explicitly does not
close (see Decision). No todo carries this yet.

`Open:` walking an `ALIASES` chain past one hop, and cycle safety for a barrel that re-exports itself
transitively, is real, scoped follow-on work this record deliberately does not build (see Decision).
No todo carries this yet.

# 0070 — an unresolvable alias refuses, it does not guess by basename
Status: Accepted
- Enforced by: tests/unit/domain/analysis/import-binding-resolution.test.ts (an unresolvable `@/` alias produces no edge at all, even when an in-scope file coincidentally shares a basename with the alias's last segment; a genuinely in-scope alias still resolves both its file-level and per-binding edges)
- Builds: 0055
- Date: 2026-07-31

## Context

Run against `subject-b/app` (a foreign Next.js repository, 474 units), conducks produced 470
dangling edge targets out of 10,933 edges — 4.3%, against conducks' own 1.7% on itself. 181 of those
470 are `IMPORTS` edges, all of them the per-binding kind (`BIND::file->target::bindingName`); no
plain whole-file `IMPORTS` edge dangled. 163 of the 181 name `@/core` (148) or `@/product` (15).

The single worst target carried 106 references:

```
/users/.../subject-b/app/src/tests/unit/lib/registry.test.ts::registry
```

That file exists. It is `Registry.test.ts`, and it defines no symbol called `registry` — it is a
plain Vitest spec file. The 106 importers pointing at it each contain
`import { registry } from '@/core/registry/Registry'`, and `app/tsconfig.json` maps `@/core` to
`../packages/core` — a sibling package the analysis was never pointed at, so no file in `allPaths`
can ever satisfy that alias.

Traced to `ImportProcessor.resolve()` (`src/lib/core/parsing/processors/import.ts`), step 3b, the
alias branch. It resolves `@/x` by SUFFIX match against `allPaths` — a project convention, not a
read of `tsconfig.json` — and correctly finds nothing here: no in-scope file ends in
`core/registry/Registry(.ts|.tsx|...)`. But finding nothing did not stop resolution. Step 3b fell
through into step 4, the generic fuzzy fallback written for bare and loosely-relative specifiers in
other languages. Step 4 takes `path.basename(specifier)` — for this alias, `"Registry"` — and
prefix-matches it against every file's basename. Exactly one in-scope file's basename starts with
`"Registry"`: `Registry.test.ts`. Unique match, so step 4's own "refuse on ambiguity" rule (ADR 0046)
never fires, and it returns that file as if it were the resolved target. Every one of the 106
importers of `@/core/registry/Registry` independently ran the same lookup and landed on the same
wrong file, because the coincidence lives in the alias's tail word, not in anything about the
importer.

`link()` then wraps that wrong path as `{ targetId: '.../registry.test.ts', type: 'IMPORTS' }`, and
`reflection-pipeline.ts`'s per-binding block (`~line 149`) appends `::registry` and writes the edge
with no check that the resulting node exists — `graph-engine.ts:344` does that check for local
candidates in a same-file semantic pass, but this cross-file/cross-wave path never had it (see
Consequences for why it still shouldn't).

## Decision

**Confine the refusal to the alias branch itself: when the suffix match in step 3b finds nothing,
return `undefined` immediately — do not fall through to step 4.** One `return undefined;` added right
after the existing `if (hit) return hit;` in the `@/`/`~/` branch of `resolve()`.

This makes `link()` return `undefined` for the alias, which makes both call sites in
`reflection-pipeline.ts` (the whole-file `NEURAL::` block and the per-binding `BIND::` block) no-op —
their guards already require `linkage` to be truthy. **No edge is produced**, chosen over an
"honestly-external" edge, for two reasons: first, unlike the `origin`/ECOSYSTEM path (System 2, ADR
0012), nothing here tells `ImportProcessor` that `@/core` maps to an external package rather than a
project bug — a real typo in a real in-repo alias looks identical to a cross-service one from inside
`resolve()`, which has no access to `tsconfig.json`'s `paths` map (§3b's own comment: resolved by
suffix convention specifically so this processor does not need to know the mapping). Fabricating an
`ecosystem::` node for an alias that might just be misspelled would trade one wrong edge for another.
Second, ADR 0055 already established the shape of this call: an unresolvable target is not
materialised, "external", "unresolvable" and "never a reference" are different things and induction
(or, here, resolution) must not default to treating them alike. A dangling `@/` alias earns the same
answer ADR 0055 gave a dangling call target — nothing, honestly.

**Not chosen: reading `tsconfig.json` to tell a genuinely-external alias root from a typo.** It would
answer the question this fix leaves open, but it is a scoped, real feature (parsing `paths`, handling
multiple tsconfigs, non-TS alias schemes) and the measured harm here is a fabricated edge, not a
missing feature — refusing is strictly safer than guessing and ships now.

**Not chosen: adding a `graph.hasNode(targetNodeId)` guard in `reflection-pipeline.ts` instead**,
mirroring `graph-engine.ts:344`. This was the first instinct — it looks like the same shape of fix
one line closer to the edge. It is wrong here: `graph-engine.ts:344` checks a LOCAL candidate inside
the same file's own ingest, which is synchronous and complete by the time it runs. `reflection-
pipeline.ts`'s per-binding block resolves CROSS-file, and `orchestrator.ts` processes files in waves
of 500, flushing and clearing each wave's nodes from the live graph before the next wave starts
(`analyze()`, "Flush Chunk to Vault & Clear RAM"). A binding import whose target file landed in an
earlier, already-flushed wave would `hasNode()`-fail for a completely legitimate edge, deleting real
data to catch a class of bug that has nothing to do with timing. The alias fallthrough is a resolution
defect, not a materialisation defect, and the fix belongs where the wrong path is chosen — one level
up from where graph-engine's guard makes sense.

**Not chosen: relaxing step 4's own ambiguity rule instead** (e.g. requiring the match to also share
a directory segment). Step 4 exists for bare/loosely-relative specifiers in non-TS languages (its own
comment: "for languages with less strict relative paths") and ADR 0046 already tuned its refusal rule
against 15 real ambiguous basenames in this repository. The bug here is that an alias — a strict,
syntactically-marked form — reached step 4 at all, not that step 4's own rule is wrong for what it was
built to handle. Tightening step 4 would still leave every OTHER unresolvable alias one basename
coincidence away from the same failure.

## Consequences

Measured read-only against the `subject-b/app` vault (`.conducks/conducks-synapse.db`), without
re-running `analyze` — that vault predates this fix and cannot be re-measured end-to-end from inside
this task:

| | count |
|---|---|
| total edges | 10,933 |
| total dangling targets | 470 |
| dangling `IMPORTS` targets | 181 (all per-binding `BIND::`; 0 whole-file `IMPORTS` edges dangled) |
| …with specifier `@/core*` | 148 |
| …with specifier `@/product*` | 15 |
| …neither `@/core` nor `@/product` | 18 — specifiers `next` (13), `@playwright/test` (4), `@vercel/analytics/next` (1) |

163 of the 181 dangling `IMPORTS` edges are exactly the class this fix removes: an `@/` alias whose
suffix match fails, that would otherwise have fallen into step 4's fuzzy basename fallback. The
remaining 18 are a **different bug this ADR does not touch**: bare package specifiers (`next`,
`@playwright/test`, `@vercel/analytics/next`) that should have been caught by step 2's external-
package check and were not — `context.isExternalPackage()` did not recognise them, so they too fell
into step 4 and basename-matched an unrelated in-scope file. Same failure shape, different entry
point (step 4 reached from a bare specifier, not an alias), out of this record's scope. Reported, not
fixed.

Proven with unit tests, on a fixture that reproduces the exact subject-b shape — an alias with no
in-scope target, plus a decoy file whose basename coincidentally starts with the alias's last
segment — alongside a second fixture pair (`@/components/foo` → `@/components/bar`, both in scope)
that must keep resolving:

| | before this fix | after this fix |
|---|---|---|
| unresolvable alias → per-binding `BIND::` edge | 1 (wrong: points at the decoy file's fabricated `::registry` node) | 0 |
| unresolvable alias → whole-file `IMPORTS` edge | 1 (wrong, same decoy file) | 0 |
| genuinely in-scope alias → `BIND::` edge | 1 (correct) | 1 (unchanged) |
| genuinely in-scope alias → whole-file `IMPORTS` edge | 1 (correct) | 1 (unchanged) |
| total per-binding `IMPORTS` edges in the fixture | 2 | 1 |

Reverting the fix and re-running `tests/unit/domain/analysis/import-binding-resolution.test.ts`
reproduces the exact phantom node from the field measurement —
`.../tests/registry.test.ts::registry` — confirming the fixture is not a synthetic stand-in but the
same mechanism.

`Open:` the 18 dangling `IMPORTS` edges from bare package specifiers that missed the step-2 external-
package check are a live, unmeasured instance of the same "step 4 reached from a specifier it should
never see" family, in a different processor branch (step 2, not step 3b). No todo carries this yet;
it surfaced only from reading this repository's vault during this task and this record is scoped to
the alias path. The end-to-end effect of this fix on the field measurement (470 dangling / 10,933
edges) is unverified here — this task ran under a rule barring `conducks analyze` on either repo
while the orchestrator held both vaults; re-running `analyze` against `subject-b/app` and re-counting
is the next step, owned by whoever picks this back up.

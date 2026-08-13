# todo63 — an exported const VALUE is wrong in both directions: unused ones are missed, used ones are flagged
Status: todo
- Acceptance: in `tests/integration/features/prune-precision.test.ts` the two const-value symbols move out of `KNOWN_WRONG` and into `TRUTH`, and the scored assertion passes with them counted.

## Context

Found by the scored fixture built for todo58#P2, on its first run — which is what a fixture with
DECLARED truth is for. Functions and classes score perfectly; exported const VALUES fail both
directions at once, which is why neither shows up as a simple "prune is too aggressive" or
"prune misses things".

MEASURED on a four-symbol fixture, `conducks analyze` then `prune --json`:

| symbol | declaration | truth | prune says |
|---|---|---|---|
| `fnUnused` | `export function` | dead | `ORPHAN` — correct |
| `fnUsed` | `export function`, called | live | nothing — correct |
| `constFnUsed` | `export const` arrow fn, called | live | nothing — correct |
| `constValueUsed` | `export const` value, READ | live | **`STALE_IMPORT`** — false positive |
| `constUnused` | `export const` value, unused | dead | **nothing** — missed |

**It is the value, not the `const`.** An arrow function on a const scores correctly, so the
declaration form is not what separates the working cases from the broken ones.

The two failures are probably one cause seen from both ends, but that is NOT established and must be
before anything is changed: a plain value READ (`a + usedConstant`) appears to produce no edge the
linker keeps, which would make the importing file's import look unused (`STALE_IMPORT`) and leave the
definition with nothing pointing at it. The recall half then follows from ADR 0013 — `pruneTaxonomy`
cuts DATA outright and edge-gates ATOM, so an unused const value may have no node left to flag by the
time `prune` runs.

**Why it matters.** `STALE_IMPORT` is a verdict, not a question (ADR 0026), and it is telling the
user to delete an import their code needs. That is the worst direction for this class of error to
fail in: acting on it breaks the build.

## Phase 0 — establish the mechanism before touching either end

- [x] ANSWERED, and it is TWO causes, not one. The single-cause theory above is REFUTED: fixing either half leaves the other exactly where it was
- [x] **The false positive.** The import edge exists (`main.ts::unit -IMPORTS-> lib.ts::usedvalue`); what is missing is any edge for the READ. `staleImports` builds its used-set from CALLS / CONSTRUCTS / ACCESSES / TYPE_REFERENCE / heritage / call-arguments, and a bare value read (`return usedValue`) produces none of them. The analyzer HAS a guard for exactly this blind spot — "if NOTHING this statement brings in was ever seen being used, the extractor may simply not cover how this file uses it" — but it is keyed per (file, specifier), so any used sibling from the same module lifts it. MEASURED across three shapes: `import { usedValue, usedFn }` with `usedFn` called → FLAGGED; `import { usedValue }` alone → not flagged; the same two split into two separate `import` statements → STILL flagged, because they merge into one record
- [x] **The recall miss.** Different cause entirely, and nothing to do with edges into the file: an exported value nobody imports has NO NODE in the vault at all. `pruneTaxonomy` cuts an ATOM carrying no non-structural edge (ADR 0013), so `prune` has nothing to flag. Confirmed by dumping the vault: `usedvalue` survives as ATOM/variable because its IMPORTS edge keeps it; `unusedvalue` is absent
- [x] The kinds settle what a fix may touch: a const arrow function is `semantic_kind: function`, NOT `variable` (measured). So `variable` in `PRUNABLE_BINDING_KINDS` covers plain values only — precisely the class whose use can be invisible

## Phase 1 — stop telling users to delete imports their code needs

- [x] `variable` removed from `PRUNABLE_BINDING_KINDS` in `dead-code.ts`. That set has exactly one consumer — the stale-import path — so nothing else moves. Decided by this analyzer's own written rule rather than by preference: "prune must err toward under-reporting, so a missed dead import is acceptable and a wrong one is not"
- [x] MEASURED after: a used value import is no longer reported; a genuinely stale const ARROW FUNCTION still is (callable coverage intact); a genuinely stale VALUE import is no longer reported — the accepted cost, asserted explicitly in the fixture so trading it back is a visible choice and not an accident
- [x] Mutation-verified: putting `variable` back fails 3 of the 6 cases in `prune-precision.test.ts`
- [x] MEASURED ON A FROZEN SUBJECT, not just the fixture. sofie: **171 findings -> 161**, `STALE_IMPORT` **20 -> 10**. Three of the ten removed were spot-checked against the source and all three are confirmed FALSE POSITIVES: `ALL_ROLES` (imported at `src/cli/config.ts:14`, used at :101, :103 and :104), `STATE_COLOR` (imported at `renderer/src/App.tsx:18`, used at :166 as an index), `OWNER_KEY` (imported at `src/plugins/tools/telegram/receiver.ts:27`, used at :65 as a call argument). How many of the other seven were genuinely stale is NOT established — the point is that the class was unsafe to report, not that every member of it was wrong
- [-] Restore the lost recall by making a bare identifier read emit an edge — dropped from THIS todo: it is a parser change across every language's queries and would move every benchmark subject's edge count, which is a different piece of work with a different risk profile. Recorded here so the option is not lost

## Phase 2 — the recall half, which is a taxonomy question

- [ ] An exported value nobody imports is deleted by `pruneTaxonomy` before `prune` can see it, so reporting it means keeping such nodes alive — a change to what the graph STORES (ADR 0013), not to what `prune` reads. DECIDE whether an exported-but-unreferenced value is worth a node, weighing it against the ~72% ATOM flood that edge-gating exists to prevent
- [ ] Whatever is decided, the fixture's `KNOWN_WRONG.deadButNotFlagged` entry moves or disappears — it fails if this is silently fixed, which is the point of it

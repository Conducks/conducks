# Wave 10 — Misc Bug Fixes (2026-06-21)

## B5 — Unchecked blameData array access
File: `src/lib/domain/analysis/reflector.ts` ~line 489
Added guard `if (!Array.isArray(blameData) || !(line in blameData)) continue;` inside
the blame loop before accessing `blameData[line]`. Prevents silent failures when blame
data is sparse or missing.

## B6 — O(N) linear scan + filter bug in nameIndex
File: `src/lib/core/graph/adjacency-list.ts`
Changed `nameIndex` type from `Map<string, NodeId[]>` to `Map<string, Set<NodeId>>`.
- Insert: replaced `includes` + `push` with `Set.add()` — O(1) dedup.
- Delete: replaced `ids.filter(...) + set` with `ids.delete(id)` — O(1) removal, no
  risk of result being discarded.
- Read (`findNodesByName`): spread Set to array before `.map()`, use `.size` check.

## B7 — HttpServiceLinker misses port-free URLs
File: `src/lib/core/graph/http-service-linker.ts` line 13
Changed regex from `/https?:\/\/([a-z][a-z0-9-]{2,}):\d+/g` to
`/https?:\/\/([a-z][a-z0-9-]{2,})(:\d+)?(?:\/|$)/g`.
Port group is now optional; `(?:\/|$)` anchors the hostname end correctly.

## Result
`npx tsc --noEmit` — zero errors.

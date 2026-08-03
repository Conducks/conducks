# todo38 — impact reaches a sibling through its container
Status: todo

- Acceptance: `impact <symbol> upstream` reports no node whose only route to the symbol is a containment hop, AND `cross-service.test.ts` still binds a REQUEST to its ROUTE. Both proven by tests that fail without the change.
- Depends: none

## Context

Found by a correctness check against a five-file fixture whose every fact was derived by hand
(ADR 0129). `impact format upstream` reported:

```
dist 1    fetchUser      calls format                    correct
dist 2    service.ts     the file that imports it        defensible
dist 2    main           calls fetchUser                 correct
dist 3    main.ts        the file above that             defensible
dist 3.5  unusedHelper   NO dependency of any kind       WRONG
```

`unusedHelper` has exactly ONE edge in the whole graph — `MEMBER_OF service.ts` — and never
references `format`. The distance names the mechanism: **3.5 = 2 (service.ts) + 1.5**, and 1.5 is
precisely the `MEMBER_OF` weight, followed from the container back down into a sibling.

This is the third containment-read-as-dependency defect found in one sweep, after ADR 0120
(`layer_boundaries`) and ADR 0121 (`rank_violation`) — and the only one in the command people
actually use to ask what breaks.

## Phase 1 — the traversal rule is proven; resolution is what blocks it

The blanket skip was written, verified against the hand-derived fixture, and **reverted**: it broke
`cross-service.test.ts`, which reaches a `REQUEST` node from its `ROUTE` through container hops. So
containment IS load-bearing for cross-service discovery, and the fix has to separate "the file that
contains a real dependent" from "a sibling that merely shares a file".

- [x] Reproduce both cases in one test file so the fix cannot satisfy one and break the other — `tests/unit/domain/kinetic/impact-containment.test.ts`, case A skipped and owned here
- [x] Decide the rule — MEASURED: skipping `MEMBER_OF` while walking upstream is CORRECT. Given the ROUTE node's real id it returns `REQUEST@1`, which is exactly right. No cleverer rule is needed.
- [ ] Fix  so a NAME containing `::` resolves to its node (see below), then re-apply the one-line traversal rule
- [ ] Verify on the hand-derived fixture that `unusedHelper` is gone and `fetchUser`, `main`, `service.ts`, `main.ts` remain
- [ ] Un-skip `tests/unit/domain/kinetic/impact-containment.test.ts`

## Phase 2 — the same question for `trace` AND `context`

- [ ] `context` is the worse of the two and backs the `conducks_context` MCP tool. On the same fixture, `context fetchUser` returns SIX steps of which exactly ONE is real structure: service.ts (its own file), **format** (the only real dependency), util.ts, src, oracle2 (REPOSITORY), oracle2 (ECOSYSTEM — same name again). Its only caller, `main`, is absent entirely. Both commands go through `registry.kinetic.trace`, so this is one root cause with three faces: `impact`, `trace`, `context`.
- [ ] `trace main` on the fixture returns `main.ts → fetchUser → format → service.ts → src → oracle2 → util.ts → oracle2`. The first three are the real chain; the rest is the containment ladder, and `oracle2` appears twice (REPOSITORY and ECOSYSTEM). Decide whether a dependency trace should climb above UNIT at all.

## What is now known (measured, not inferred)

**The traversal rule is correct and is one line.** `if (edge.type === 'MEMBER_OF' && direction === 'upstream') continue;` in `trace.ts`'s Dijkstra. Given the ROUTE node's REAL id it produces
`REQUEST::/users/profile::GET@1` — precisely the right answer, by the direct CALLS edge.

**What blocks it is `resolveSymbol`, not the traversal.** Synthesised nodes are named for what they
are rather than where they live — `ROUTE::/users/profile::GET` — so a NAME can contain `::`.
`resolveSymbol` treats any `::` input as an id, fails to find it, and falls through to the bare tail
(`GET`). The caller is then handed an id no node has:

```
impact 'ROUTE::/users/profile::GET'   symbolId: ROUTE::/users/profile::GET   ← not a real id
                                      affected: server.ts@1                  ← walked from nowhere
impact '<the real lowercased id>'     affected: REQUEST::/users/profile::GET@1  ← correct
```

`cross-service.test.ts` passes today only because that wrong start happens to reach REQUEST through
container hops. Fix resolution and it passes for the right reason; then the traversal rule is safe.

- [ ] Adding `findNodesByName(input)` before the bare-tail fallback was tried and is NOT sufficient on its own — it returned a node whose id still did not match the real one, so the name index's entry for synthesised nodes needs its own look first

## Phase 3 — the root cause: every route and request exists twice

Found while fixing resolution (ADR 0130). The vault holds BOTH a file-scoped and a bare node for the
same route, and each carries part of its edges — so `impact` answers differently depending on which
one it lands on. Any traversal rule measured against this graph is being measured against an artefact.

- [ ] Decide which node is canonical — the file-scoped one carries the CALLS from its REQUEST, the bare one carries the edge to its file
- [ ] Merge or alias them so a route has ONE node holding ALL its edges
- [ ] Then re-evaluate the ADR 0129 traversal rule, which is already proven correct against a single-node graph

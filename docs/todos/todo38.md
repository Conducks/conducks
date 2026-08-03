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

## Phase 1 — a narrower rule than "skip MEMBER_OF upstream"

The blanket skip was written, verified against the hand-derived fixture, and **reverted**: it broke
`cross-service.test.ts`, which reaches a `REQUEST` node from its `ROUTE` through container hops. So
containment IS load-bearing for cross-service discovery, and the fix has to separate "the file that
contains a real dependent" from "a sibling that merely shares a file".

- [ ] Reproduce both cases in one test file so the fix cannot satisfy one and break the other
- [ ] Decide the rule — candidates: allow a container hop only when it is the LAST hop; or allow container→child only for nodes carrying `isRoute`/`isRequest`; or give containment its own traversal budget
- [ ] Verify on the hand-derived fixture that `unusedHelper` is gone and `fetchUser`, `main`, `service.ts`, `main.ts` remain
- [ ] Un-skip `tests/unit/domain/kinetic/impact-containment.test.ts`

## Phase 2 — the same question for `trace`

- [ ] `trace main` on the fixture returns `main.ts → fetchUser → format → service.ts → src → oracle2 → util.ts → oracle2`. The first three are the real chain; the rest is the containment ladder, and `oracle2` appears twice (REPOSITORY and ECOSYSTEM). Decide whether a dependency trace should climb above UNIT at all.

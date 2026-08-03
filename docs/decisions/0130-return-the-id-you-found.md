# 0130 — return the id you found, not the string that found it

Status: Accepted
- Date: 2026-08-03
- Builds: 0106, 0129
- Enforced by: tests/unit/interfaces/cli/resolve-symbol-id.test.ts — run against the unfixed build first, the case failed and the control passed

## Context

Work on todo38, chasing why `impact` reported the wrong dependents for a route. Three layers, each
hiding the next.

**Layer 1 — resolution threw the answer away.** `graph.getNode` is lenient: it resolves aliases and a
case-insensitive form. So a lookup can SUCCEED while the input differs from the id it matched, and
`resolveSymbol` returned `input` in exactly that case:

```
getNode('ROUTE::/users/profile::GET')   found; its id is `route::/users/profile::get`
resolveSymbol(...)                      returned 'ROUTE::/users/profile::GET'
```

Every caller downstream was handed a string no node is keyed by, and `impact` walked from an id the
graph does not hold — answering `server.ts` for a route whose only real dependent is the REQUEST that
calls it. The lookup was right; the return value discarded it.

**Layer 2 — the route exists TWICE.** With resolution fixed, the same route resolves to a bare alias
node, and the vault holds both:

```
/…/api/server.ts::route::/users/profile::get     carries the CALLS from REQUEST
route::/users/profile::get                       carries the edge to server.ts
```

Each duplicate holds PART of the route's edges, so `impact` gives a different answer depending on
which one it lands on. Same for `request::…`.

**Layer 3 — the containment traversal** (ADR 0129) sits behind both and cannot be evaluated until the
duplicates are resolved, because the test that constrains it reaches its answer through them.

## Decision

**Ship layer 1 only.** Returning the found node's id rather than the query string is correct on its
own terms and independent of the rest — a lookup that succeeded should not report the question back
as the answer.

**Layers 2 and 3 stay open** under todo38. The duplicate node is the root cause and has to be settled
first: any traversal rule evaluated against a graph that holds the same route twice is being measured
against an artefact.

## Consequences

- Full suite green with layer 1 alone: **1,440 passing, 1 skipped and owned**.
- **The traversal rule from ADR 0129 is still correct and still unshipped.** Given a route's
  file-scoped id it returns `REQUEST@1`, exactly right. It is blocked on the duplicate, not on itself.
- Four changes have now been built and reverted across todo38 and ADR 0129. Each one was measured
  against the case it was written for and reverted when it could not be shown correct overall. The
  cost of that discipline is visible; the alternative is a flagship command that is wrong in a new way
  after every fix.
- **The duplicate-node finding is the most valuable thing this thread produced**, and nothing about it
  was visible from the symptom that started it.

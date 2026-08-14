# 0085 — a renamed binding is called by one name and defined under another
Status: Accepted
- Date: 2026-08-01
- Builds: 0070, 0071, 0084
- Enforced by: tests/unit/core/renamed-binding.test.ts (a renamed static import, a renamed destructured dynamic import, an unrenamed import left alone, only the receiver segment of a dotted call rewritten, and the alias edge qualified with the resolved file)
- Amended by: todo35 — the dangling rates quoted here were measured BEFORE the guess sweep split deletes from keeps; they compare like with like and stand as relative improvements, but the honest absolute rate after the sweep is 7.35% on conducks (todo35 Phase 1), not the ~1% basis these figures imply

## Context

Found by checking whether resolved edges are RIGHT, not whether there are fewer of them.

Every number this codebase reports about resolution is a count of what is MISSING. Nothing counts a
wrong edge: it has both endpoints, it has confidence 0.85, and every command downstream reads it as a
real call. So the resolutions were verified against the SOURCE instead of against the graph — for
each member-call edge, does the target file really declare that member on that line, and does the
call site really write `.<member>(`. The graph cannot be its own witness; asking it re-runs the rule.

1,313 edges checked on subject-b. One failed, and it was a genuine defect:

```ts
const { POST: sendMessage } = await import('@/app/api/messages/send-safe/route');
await sendMessage(...);
```

conducks emitted `CALLS -> MessagingService.sendMessage` — a completely different function, in a
different file, at confidence 0.85. The call processor had resolved the FILE correctly and then
appended the LOCAL name, and where the local name happened to match a real export elsewhere, the
bare-name resolver bound it there.

The same root cause produced the largest remaining dangling group. `<route>::stepaction` is an id no
node has, because the route declares `POST`:

| bucket | edges before |
|---|---|
| qualified symbol that no node declares (mostly this shape) | 77 |
| the wrong edge above | 1 |

## Decision

**A binding's ORIGINAL name is what the id is built from. The local name is only how it is called.**

Three changes, all reads of what the source states:

1. `registerLocalBinding()` carries the original exported name, and `CallProcessor` builds
   `<file>::<original>`. Only the FIRST segment of a dotted target is a binding — `Svc.create()`
   becomes `<file>::userservice.create`, with the method untouched.
2. A DESTRUCTURED DYNAMIC IMPORT is a binding like any other. `const { POST: x } = await import(...)`
   never reached the import branch at all, so it registered nothing and emitted a bare local name —
   free to be bound to any imported unit owning that name. It now registers the binding and mints the
   node, reusing the `@isBinding` machinery ADR 0071 built.
3. The ALIASES edge is QUALIFIED with the resolved file. A bare original name relies on IntraLinker
   scoping the lookup to files the unit imports, and a dynamic import produces no such scope, so those
   aliases dangled on a bare `post`/`get`. The specifier is present in the match; resolve it there.

## Consequences

- MEASURED on subject-b: dangling **131 → 77**, rate **0.652% → 0.381%**, with edges GROWING
  20,092 → 20,210. Against the start of the day: **695 / 3.459%**.
- **Both subjects now verify 100% against source** — 1,312 member-call edges on subject-b and 1,176
  on conducks, every one of them declaring the member on the recorded line and writing the call at
  the call site. That is the first correctness number this project has ever had for resolution, and
  it is worth more than any dangling count.
- The verifier is a scratch script, not a suite gate, and that is a gap: it needs the vault and a
  real subject, so it cannot run in CI as written. Its three false alarms were all its own —
  a UNIT node's one-line span, a generic call (`get<T>(...)`), and an optional call (`f?.(x)`) —
  each fixed in the checker, none of them a defect in the graph.
- The wrong edge was found because it was LOOKED for. It survived every existing gate: the suite was
  green, `audit` was green, the dangling count had just improved. A wrong edge is invisible to all
  three by construction.
- `isConstructor()` classifies by CAPITALISATION, so a call to an uppercase export — `POST(...)`, the
  Next.js handler convention — is filed as CONSTRUCTS rather than CALLS. The target id is correct
  either way. Noted rather than changed: the heuristic is load-bearing elsewhere and nothing here
  depends on which of the two an endpoint call is called.
- An unrenamed import is untouched, since the local name IS the original.

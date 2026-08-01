# 0082 — a declared type is read, a returned one is not guessed
Status: Accepted
- Date: 2026-08-01
- Amended by: 0084
- Builds: 0070, 0071, 0077
- Enforced by: tests/unit/core/instance-type-capture.test.ts (each accepted declaration form records its type, and a factory records nothing), tests/unit/core/graph/linker-typed-receiver.test.ts (the member resolves through the recorded type, and refuses when the member, the type or the record is absent)

## Context

A call on an instance dangled, and the receiver was already resolved.

`packages/core/registry/registry.ts` declares
`export const Registry = globalForRegistry.registry ?? new ServiceRegistry()`, and 192 call sites
write `Registry.get(...)`. The call processor resolved the RECEIVER — the dangling target is
`registry.ts::registry.get`, carrying the file that defines `Registry` — and stopped there. `get`
belongs to `Registry`'s TYPE, and nothing in the graph recorded what that type was.
`registry.ts::serviceregistry.get` existed as a node the whole time, one hop away and unreachable.

The vault held every part of the answer except the link between them:

| fact | in the graph before |
|---|---|
| `Registry` is defined in `registry.ts` | yes — the target carries the file |
| `ServiceRegistry.get` exists | yes — a node |
| `Registry` IS a `ServiceRegistry` | **no** |

A CONSTRUCTS edge for the `new ServiceRegistry()` did exist, and was useless: its SOURCE is the
enclosing scope, so at module level it says "this file constructs a ServiceRegistry" and not
"`Registry` is one".

`todo29#P3b` recorded this as blocked on type inference. That was half right, and the half matters:
two shapes make up 68% of mentorseed's dangling edges and they are not the same problem.

| shape | count | type stated where |
|---|---|---|
| `Registry.get` — `const Registry = ... ?? new ServiceRegistry()` | 192 | **on the declaration** |
| `db.query` — `const db = CoreDatabaseManager.getInstance()` | 281 | nowhere — a factory's return |

## Decision

**A type written on the declaration is READ. A type only a function could return is NOT guessed.**

The reflector records `instanceOf` from a `new Y()` initializer, and `IntraLinker` resolves
`<file>::x.member` to `<typefile>::<type>.<member>` through it. Two rails keep it a read rather than
an inference, both inherited from ADR 0070: the type is resolved from the units the RECEIVER's own
file imports — that is where the class is imported, not the caller's — and **the member node must
already exist**. A type with no such member resolves to nothing rather than to an invented id.

A factory records NOTHING. `X.getInstance()` states no type at the declaration, and assuming it
returns an `X` is wrong exactly when a factory returns a subclass or an interface — the class of
guess ADR 0070 refuses. That leaves the 281 `db.query` edges open for a real type checker, and the
refusal is pinned by a test so it is not quietly relaxed later.

Three things had to be true and only the first was visible from the failure:

1. **A second query pattern.** The plain `new Y()` capture matched none of the 192, because the
   measured shape puts the `new` on the right of a `??` — a global-cache fallback, which is how a
   Next.js codebase keeps one instance across hot reloads.
2. **`addNode` keeps a fixed skeleton.** An extra property is discarded before it reaches the vault
   (memory.md — "The graph compresses properties that `getAllNodes()` never returns").
3. **The value had to become a REAL COLUMN.** Living only in the `metadata` blob, `instanceOf` is
   absent from every SHALLOW load — which is the load the analyze path uses. The rule worked on a
   fresh parse and did nothing on a reload: exactly the failure ADR 0074's sibling entry records for
   the route columns in `todo22#P15`, recurring on the next field to be added.

The rule runs ABOVE `IntraLinker`'s already-qualified skip, because these targets carry a file and
the bare-name path never sees them.

## Consequences

- MEASURED on mentorseed: dangling **695 → 477**, rate **3.459% → 2.374%**, 218 edges resolved
  against 39 nodes carrying a recorded type. conducks on itself is unchanged and `audit` is green.
- `instance_of` is a real `nodes` column, migrated for existing vaults, and classified as CONTENT in
  `content-key.ts` — it is read off the declaration, so it can only change when the declaration text
  changes, which changes the fingerprint anyway. The column guard (ADR 0081) failed the build until
  it was classified, which is the guard working.
- **The 281 factory-typed edges stay dangling, deliberately.** They are deferred work in `todo29`,
  not a defect being ignored, and the honest reading of the remaining 2.374% includes them.
- The three query files that gained the capture are TypeScript, TSX and JavaScript. Every other
  language records no instance type, so this resolution is TS-family-only until a language's query
  emits `@instance_name`/`@instance_type`.
- The `??` pattern is a SECOND pattern rather than a generalisation. A capture that walked any
  initializer expression looking for a `new` would also match `cond ? new A() : new B()`, where the
  declaration states two types and reading either one is a guess.

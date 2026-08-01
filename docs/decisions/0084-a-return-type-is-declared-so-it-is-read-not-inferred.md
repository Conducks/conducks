# 0084 — a return type is declared, so it is read, not inferred
Status: Accepted
- Date: 2026-08-01
- Amends: 0082
- Builds: 0070, 0071
- Enforced by: tests/unit/core/instance-type-capture.test.ts (a declared return type is recorded verbatim, an absent one is null rather than void, and a factory records the call), tests/unit/core/graph/linker-factory-receiver.test.ts (each of the four hops refused separately, plus the edge-order case)

## Context

ADR 0082 decided that a type written on a declaration is READ and a type a function returns is NOT
guessed, and put `const db = CoreDatabaseManager.getInstance()` on the wrong side of that line — 281
dangling edges on mentorseed, recorded as needing a real type checker.

**It never needed one.** TypeScript makes you write the return type, and the source says:

```ts
public static getInstance(): CoreDatabaseManager { ... }
```

The type is declared, one file away, in plain text. By ADR 0082's own rule it should have been read.
What made it look unknowable was a defect nobody had looked at:

| `dna.returns` on mentorseed | function nodes |
|---|---|
| `"void"` | **4,267** |
| null | 2,210 |

`reflector.ts` wrote the literal `returns: 'void'` for every function in every language. Not a
default that sometimes held — a constant, never derived from source, and `query-service.ts` reports
it to users as if it were a fact. `signature.returnTypes` was `[]` everywhere for the same reason.
So the graph asserted 4,267 things it had never measured, and the one place that would have
contradicted the "needs inference" conclusion agreed with it instead.

## Decision

**Capture the declared return type. Resolve a factory-produced receiver through it.**

Four hops, each a read of something the source states, and the chain refuses at any one that is
absent:

| hop | reads |
|---|---|
| `db` is a re-export | the ALIASES edge, or the barrel's own imports when ADR 0071 minted the node |
| `coreDb` came from a call | the CALLEE's declared return type |
| the type is a class | the class node, resolved in the DECLARING file |
| `query` is on the parent | the EXTENDS chain |

`returns` is now `null` when nothing is declared, not `'void'`. An absent annotation is not a claim
that the function returns nothing, and collapsing the two is what hid this.

Two things had to be fixed to make the chain work at all, and both are worth naming because neither
was the feature:

**`declared_return` had to be its own column.** It lives in the `dna` blob, and `dna` is not in the
shallow SELECT — the third time in two days that a value reachable on a fresh parse was invisible
after the reload the analyze path uses.

**`getNeighbors(id, direction, type)` never applied `type`.** The parameter was declared and the body
ignored it, so an alias walk asking for ALIASES got MEMBER_OF and followed containment into the
directory tree. No error, just the wrong edge. Every other caller omits the argument, which is why it
survived: implementing it changed nothing that already worked.

**The heritage edge is resolved inside the walk**, because EXTENDS targets are resolved by this same
pass and may still be bare names when the rule reads them. Without that, the identical lookup —
same type, same member — succeeded 80 times and refused 226. A rule whose answer depends on edge
order is worse than one that always refuses, and it would have read as flakiness rather than as a bug.

## Consequences

- MEASURED on mentorseed: dangling **373 → 131**, rate **1.856% → 0.652%**, against **695 / 3.459%**
  at the start of the day. The 306 `db.query` calls now point at `BaseDatabaseManager.query:111` —
  verified as the method that actually runs, not merely at a node that exists.
- conducks on itself: **226 → 193**, **1.401% → 1.190%**, with edges GROWING 16,127 → 16,222. The
  denominator rising while the count falls is the check ADR 0077 made mandatory after a "fix" that
  improved the count by destroying two thirds of the graph.
- **Every function's fingerprint changed once**, because `dna` is hashed into it and `returns` moved
  off a constant. A single re-analyze absorbs it; a `diff` taken across that boundary reports every
  function as changed, and that is expected rather than a regression.
- `params: []` is the SAME defect, still unfixed and now stated out loud: no function in the graph
  records its parameters, and nothing yet claims otherwise. Left out because nothing on this path
  reads it — but it is a lie of the same kind as the old `returns`.
- Return types are captured for TypeScript and TSX only. JavaScript has no annotations, and the other
  ten languages keep `null` until their queries emit `@return_type` — honest, where `'void'` was not.
- **A record keyed by bare name collided with shadowing**, and shipped that way for about an hour:
  a local `const client = new SmtpClient()` overwrote the module-level `const client = new
  HttpClient()`, pointing module-scope calls at the wrong class. Keyed on scope + name now, which is
  what the node id is built from. It was found by TESTING shadowing rather than by any failure —
  nothing broke, no count moved, and the graph just answered wrongly. A wrong edge is worse than the
  dangling one it replaces, because nothing counts it.
- A reassignment (`let s = new A(); s = new B()`) records `A`, matching what TypeScript infers for
  the variable. A method existing only on `B` stays dangling — under-reporting, which is the side
  this codebase errs on. A ternary of two constructors records nothing at all.
- A factory that declares no return type still refuses, and so does one returning a constructed type
  (`Promise<Foo>`, `Foo | null`, `Foo[]`). Unwrapping a generic is inference, not reading.

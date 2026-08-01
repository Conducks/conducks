# 0086 — a signature is measured or it is absent, never assumed empty
Status: Accepted
- Date: 2026-08-01
- Builds: 0070, 0084
- Enforced by: tests/unit/core/instance-type-capture.test.ts (name, declared type, optionality, rest marker, destructured pattern, a genuinely empty list, methods and arrow functions), tests/unit/core/graph/linker-factory-receiver.test.ts (the uniqueness gate refuses two imported units declaring one class name, and the same graph without the rival resolves)

## Context

Two gaps left open by ADR 0084, taken together because both are the same mistake: **a value that was
never measured, presented as a measurement.**

**`dna.params` was the literal `[]` for every function in the graph.** `taxonomy.ts` documents
parameters as living exactly there — they are deliberately not emitted as nodes BECAUSE they are
captured on their parent — so the empty array read as "this function takes no parameters" rather than
as "nobody looked". It is the same fabrication as the old `returns: 'void'`, and ADR 0084 named it
without fixing it.

**The new typed-receiver lookups were first-match-wins.** Two files behind one barrel can export the
same name; taking the first is the coincidence-binding ADR 0070 refuses. Its sibling rules were
already uniqueness-gated and these were not.

## Decision

**Capture the real signature. Refuse an ambiguous name.**

Parameters are read from the grammar's `pattern` field, which survives every shape a parameter takes:

| written | recorded |
|---|---|
| `a: string` | `{ name: 'a', type: 'string', optional: false }` |
| `b = 2` | `{ name: 'b', type: null, optional: false }` — no declared type is null, not a guess |
| `c?: Foo` | `optional: true` |
| `...rest: number[]` | `{ name: '...rest' }` — the marker is kept; the bare name would claim a single value |
| `{ y, z }: Bar` | `{ name: '{ y, z }' }` — it binds several names and has no single one |

An arrow function assigned to a const is a function, and gets the same treatment through an OPTIONAL
value pattern on the existing variable rule rather than a second pattern — a second pattern matches
the same declarator and races the first to create the node, which is an ordering bug waiting to
happen (the kind ADR 0084 already paid for once with heritage edges).

All four lookups the typed-receiver rules make now use `resolveSymbolUnique`, which returns nothing
when two imported units answer. **The cost of refusing is a dangling edge; the cost of guessing is a
wrong one, and only the second is invisible** (ADR 0085).

## Consequences

- MEASURED on mentorseed: **448/563 methods, 337/527 functions and 101 arrow-function variables**
  now carry their parameters. The rest are genuinely zero-argument — spot-checked
  (`export default function AuditPage()`), so an empty array now MEANS "takes nothing".
- The uniqueness gate changed nothing on either subject: 77 dangling and 100% source-verified before
  and after. It is a guard for the next codebase, not a fix for this one, which is why it is tested
  against a fixture that actually contains the collision — an unexercised guard is unverified.
- The first attempt at that test put the rival behind a file that DECLARED the class itself, so the
  same-file lookup won and the refusal never ran. The test failed and the code was right; a fixture
  that does not reach the code it names proves nothing.
- Fingerprints changed once more, since `dna` is hashed and `params` moved off a constant. Same
  one-time absorption as ADR 0084.
- **The regex fallback path still writes `params: []` and `returns: 'void'`** in the two `gnosis`
  branches. Those nodes come from a path with no AST at all, so nothing can be read there — but the
  values are the same lie in a smaller place, and they should be null. Left as stated debt.
- Parameters are TypeScript and TSX only, like return types. Ten languages still record `[]`, which
  in those languages carries the old ambiguity — honest only where it is documented, which it now is.
- Nothing consumes `dna.params` yet. It is captured because it was already claimed, not because a
  feature needs it; the first real consumer (a signature-aware `explain`, or overload resolution)
  will be the test of whether the shape is right.

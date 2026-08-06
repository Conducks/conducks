# 0048 — a gate checks the thing, not a proxy for it
Status: Accepted
- Date: 2026-07-30
- Enforced by: tests/architecture/boundaries.test.ts and tests/database/ts/structural.test.ts (gates assert the thing itself, not a proxy)

## Context

Four independent gates in this codebase reported clean while the property they exist to protect was
violated. Each checked something correlated with the property instead of the property itself.

| gate | checked | missed |
|---|---|---|
| `layer_boundaries` | `IMPORTS` edges in the graph | 4 `import()` calls: `diff.ts` ×3 cli→core, `pulse-worker.ts` core→domain |
| `layer-contract.test.ts` | that the rule is enabled and configured | whether THIS repo violates it |
| `require-conducks-component` | `matchLabel: STRUCTURE` | that STRUCTURE is 55 interfaces as well as 42 classes — 83 false positives |
| `conducks_graph_query` | that the string starts with SELECT | that a SELECT can read `/etc/passwd` |

The pattern is one step of indirection each time, and each step looked equivalent when it was
written. Import edges *are* dependencies — until a dependency is expressed as `await import()`. A
canonical kind *is* a node's type — until you need "class but not interface". A SELECT prefix *is*
a read-only statement — until a table function reads a file.

The `core → domain` case is the sharpest, because the indirection was deliberate.
`pulse-worker.ts:35` dynamically imports the reflector with a comment explaining that this avoids a
static core→domain edge. The runtime dependency is real and unchanged; only its visibility to the
gate was removed. The contract reports clean because the evidence was hidden from it, and a reader
of `conducks guard` cannot tell that from a contract that holds.

`drift` and `guard` (ADR 0044) and the confidence column (ADR 0046) were the same failure in other
clothes: a verdict derived from an empty collection, and a number recording which rule fired rather
than how far to trust the result. This record names the shape those two share.

## Decision

**A gate is written against the property it protects, and where it cannot reach the property it
declares the gap rather than reporting clean.** Four rules:

1. **A dependency gate reads every form of dependency.** Static imports, `import type` (excluded, and
   excluded ON PURPOSE with a reason), and dynamic `import()`. A gate that reads one form states
   which forms it does not read.
2. **A gate runs against THIS repository, not only against its own configuration.** A test proving a
   rule is enabled is necessary and is not sufficient; the suite must contain a check that fails when
   the repo itself violates the contract.
3. **A rule that matches zero subjects fails.** Zero matches and full compliance produce the same
   output, and the difference is the whole value of the gate. This is already built
   (`sentinel.ts`, todo24#P6) and is generalised here.
4. **A guard on a capability tests the capability.** Not the prefix, not the name, not the shape of
   the string. Where testing the capability is impractical, the guard is an allowlist of what is
   permitted rather than a denylist of what is known to be bad.

**Not chosen: forbidding dynamic imports outright.** They are load-bearing — `pulse-worker` uses one
to keep tree-sitter out of the CLI's boot path, and that is a real latency win. The rule is that they
are VISIBLE to the gate, not that they are banned. A legal dynamic import stays legal; an illegal one
stops being invisible.

**Not chosen: replacing the graph-based sentinel with a static gate.** The graph rule sees things a
file scanner cannot — transitive reach, rank inversions, edges the parser resolved across aliases.
The static gate sees things the graph cannot, because the graph only contains what the parser
captured. They are complementary, and the answer is both, with the static one owning the invariant
that must never silently stop running.

**Not chosen: making the static gate a lint rule.** ESLint would work and adds a dependency, a config
surface, and a second place a rule can be disabled. A test file needs none of that and fails in the
suite everyone already runs.

## Consequences

The new static boundary gate will fail on the four dynamic imports the day it lands, and three of
them (`diff.ts`) are a genuine violation to fix rather than an exception to grant. The fourth
(`pulse-worker` → reflector) is load-bearing and needs a decision: either the reflector's interface
moves to `contracts` so core can depend on it legally, or the contract grows an explicit, documented
exception. Granting the exception silently — by leaving it invisible — is the thing this record
exists to stop.

Rule 1 costs precision. A regex over source text cannot resolve `import(someVariable)`, and a gate
that reads only literal specifiers will miss a computed one. That gap is real, and stating it is the
requirement; the alternative is a gate that quietly claims more coverage than it has.

Rule 3 means a mistyped selector now fails the build rather than disabling a rule. That will be
briefly annoying and is the correct trade: the first attempt at the todo24#P6 fix disabled the rule
by naming the vault's column instead of the in-memory field, and it looked like a success.

`Open:` whether `conducks guard` should fail on the layer contract at all today. It currently reports
`rank_violations=458` as "pre-existing, tracked" and passes. That is defensible for a finding nobody
has triaged and indefensible as a permanent state — a number carried as acceptable for long enough
becomes invisible. Deciding it means triaging the 458 first, which is its own job. Carried by
todo25#P6 — ANSWERED there on 2026-07-30: all 458 were one false-positive pair (UNIT → ECOSYSTEM,
i.e. a file importing an npm package), caused by reading a containment ladder as a dependency one.
The rule was corrected rather than ratcheted, and `guard` no longer carries a findings line at all.

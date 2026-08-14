# 0088 — a generator is a function, and Swift's parameters are reachable
Status: Accepted
- Date: 2026-08-01
- Amends: 0087
- Builds: 0086
- Enforced by: tests/unit/core/instance-type-capture.test.ts (a standalone and an async generator each produce a node and record their parameters), tests/unit/core/languages/signature-go-rust-swift.test.ts (Swift parameters captured through the inline form, argument label kept, and a zero-parameter function)

## Context

Three gaps ADR 0087 stated rather than closed, plus one it created.

**A generator produced no node at all.** `function* g() {}` parses as
`generator_function_declaration`, a different node type from `function_declaration`, and no pattern
in any JS-family query file touched it. Not a missing signature — a missing FUNCTION. Nothing calling
it could resolve, and dead-code analysis could never see it as defined.

It was reported as a JavaScript gap. It was not: TypeScript and TSX had the identical hole. **A
finding scoped to the file someone happened to be looking at is worth re-checking against its
siblings** — the report was accurate and its scope was wrong.

**Swift recorded no parameters.** tree-sitter-swift has no parameter-list node; parameters are
field-less children of `function_declaration`, sitting among its own name, return type and body. The
`@params` contract — one node whose children ARE the parameters — cannot express that.

**The regex fallback still wrote `returns: 'void'`.** The same fabrication ADR 0084 removed
everywhere else, surviving in the one path that has no AST to read.

## Decision

**A second capture form, and it is explicit rather than clever.**

| capture | meaning | used by |
|---|---|---|
| `@params` | a dedicated list node — every named child is a parameter | ten languages |
| `@params_inline` | the FUNCTION node, whose parameters sit among its other children | Swift only |

The inline form filters children by node TYPE. A shape-based guess — "a parameter is a child with a
type field" — would have silently dropped Ruby's bare `identifier` parameters, so the filter names
what it is looking for.

A repeated capture (`(parameter) @param`) was tried first and rejected: it produces one MATCH per
parameter, and every one of those would race to create the function node — the ordering bug ADR 0084
already paid for once. A quantified capture returns only the first parameter in this binding, which
was measured, not assumed.

Generators get their own pattern in all three JS-family files. The regex fallback now writes
`returns: null` — "not measured", which is what it is.

## Consequences

- **Swift immediately found a second grammar aliasing bug.** `parameter` exposes its TYPE under the
  `name` field as well as the name, so ADR 0087's grouped-name branch — written for Go's
  `func f(a, b string)` — emitted the type as a second parameter: `a: Int` became two parameters,
  `a` and `Int`. Fixed by excluding the type node by position, which costs Go nothing because there
  the type is a separate field. **A feature landing in a new language exercised an old branch in a
  way no existing language did.**
- An argument LABEL is kept with the name: `with b: String` records `"with b"`. Both are written, and
  the caller writes the label, so dropping either would misstate the call site.
- MEASURED: conducks 4,765 nodes / 16,439 edges (up from 4,686 / 16,222 — generators are now in the
  graph), dangling steady at 1.168%; subject-b 6,534 / 20,221, 0.381%. Both still verify **100%**
  against source on member-call edges (1,182 and 1,312). 1,281 tests green.
- Four mutations, each caught: removing the generator pattern, removing `@params_inline`, removing
  the inline type filter, and removing the Swift alias guard.
- **The backtick trap fired for the FIFTH time** while writing the generator comment, in all three
  files at once. This record first said the guard test failed to catch it. **That was wrong** — the
  guard catches it and names the file and line; it was never RUN, because `tsc` runs first and dies
  first. The defect was ORDER, not detection, and it is fixed in ADR 0089 by checking before the
  compiler rather than after it.
- A single unparenthesised arrow parameter (`const f = a => a`) still cannot be captured — the
  grammar emits no parameter node at all for that shape, in either JavaScript or TypeScript.

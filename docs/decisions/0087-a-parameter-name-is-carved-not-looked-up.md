# 0087 — a parameter name is carved out, not looked up
Status: Accepted
- Date: 2026-08-01
- Amended by: 0088
- Amends: 0086
- Builds: 0084
- Enforced by: tests/unit/core/instance-type-capture.test.ts, tests/unit/core/languages/signature-c-family.test.ts, tests/unit/core/languages/signature-dynamic.test.ts, tests/unit/core/languages/signature-javascript.test.ts, tests/unit/core/languages/signature-go-rust-swift.test.ts (each language asserts the measured name, including markers, grouped declarations and the annotation-only case)

## Context

ADR 0086 read a parameter's name from a field chain: `pattern`, else `name`, else the node's own
text. That was written against TypeScript and generalised on the evidence of five grammars. Extending
signature capture to eleven more languages produced **eight** findings, from four independent
workers, and they were not eight separate bugs — they were one wrong idea, failing in both
directions at once:

| language | grammar exposes | chain picked | result |
|---|---|---|---|
| Python `a: str` | **no** `name` field | node text | `"a: str"` — the type came with it |
| Ruby `*args` | **has** `name` field | that field | `"args"` — the marker was dropped |

An absent field forced the honest answer; a present one skipped it. The same shape cost PHP its `&$c`
and `...$rest` markers, and C its identifier entirely (`int a` → `"int a"`, because C hides the name
under a fourth field, `declarator`).

The chain also could not see two things at all: Go writes `func f(a, b string)` as ONE node with TWO
`name` children, so `b` was silently lost — an arity the graph would then state wrongly; and C's
`f(void)` idiom is one parameter node whose whole text is the type, recording a parameter named
`"void"` for a function that takes none.

Every one of these was REPORTED rather than patched, because ADR 0086 froze the helper before the
work fanned out. Four workers editing one shared function would have produced four incompatible
special cases for what is a single mistake.

## Decision

**Remove the annotation instead of hunting for the name.**

Take the parameter's own text and cut out the `type` node and any default value, by byte offset.
Whatever remains is the name, markers and all. The annotation sits on either side depending on the
language — a suffix in TypeScript, Python and Rust, a PREFIX in C, Go and Java — so whichever side
survives the cut is the answer. Nothing is guessed: the annotation's position is read from the parse
tree, which is the same principle as ADR 0084's "a declared type is read, not inferred".

| written | annotation | recorded | fixes |
|---|---|---|---|
| `a: str` (Python) | suffix | `a` | name no longer carries the type |
| `*args`, `&blk`, `k:` (Ruby) | none | verbatim | markers kept |
| `&$c`, `...$rest` (PHP) | none | verbatim | markers kept |
| `int a`, `char *p` (C) | **prefix** | `a`, `*p` | the `declarator` field is not needed |
| `void` (C `f(void)`) | whole node | *nothing* | zero parameters, not one |
| `a = 1` (JS) | default | `a` | default carved off |
| `a, b string` (Go) | one node, two names | `a`, `b` | arity is right |

Two rules keep it honest at the edges. A separator is trimmed **only where the cut exposed it**, so
Ruby's `k:` keeps its colon — no flag records that it is a keyword parameter, and `k` means something
else. And `?` is trimmed only when `optional` is already true, because a marker carried by a flag
would otherwise be stated twice.

## Consequences

- All eight findings are fixed by one rule with no per-language branching. Verified by running the
  real reflector over all eleven languages and reading the output, not by reasoning about it.
- **Six tests that PINNED the broken behaviour now assert the right answer.** The agents wrote them
  as `KNOWN GAP` cases asserting the measured-but-wrong value, which is exactly why the fix was
  cheap: the failure was already written down and executable, so the diff proves what changed.
- Mutation-checked in five places. Two mutations of note: removing the grouped-name branch breaks Go
  and nothing else; and the `to <= from` early-out is **not** load-bearing — the empty-name check
  below it catches the same case, and only removing BOTH breaks C's `f(void)`. It is kept for
  intent and labelled as redundant rather than left looking essential.
- **Swift still records no parameters.** tree-sitter-swift has no wrapper node for value parameters —
  they are field-less direct children of `function_declaration` — so there is nothing for `@params`
  to tag. Supporting it needs a node-TYPE filter over a captured parent's children, which is a
  contract change, not a query fix. Reported, not bodged; `dna.params` is `[]` for Swift and that is
  now a documented gap rather than a silent one.
- **A standalone JavaScript generator produces no node at all.** `function* g() {}` parses as
  `generator_function_declaration` and no pattern touches it. That is a hole in the graph, not a
  missing signature, and it is out of scope here.
- A single unparenthesised arrow parameter (`const f = a => a`) has no `formal_parameters` node in
  either JavaScript or TypeScript, so it cannot be captured under the current contract.

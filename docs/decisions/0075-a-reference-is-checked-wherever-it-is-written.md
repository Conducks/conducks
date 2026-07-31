# 0075 — a reference is checked wherever it is written, not only in a field
Status: Accepted
- Date: 2026-07-31
- Enforced by: tests/unit/domain/analysis/docs-board.test.ts (an invented phase number and an invented ADR number both fail the gate; a phase inside a `completed/` todo still resolves; a fenced example and a cross-tree address are left alone)

## Context

`docs-lint` resolved addresses in `- Builds:` and `- Depends:` and nowhere else. Every other
reference in a governed doc — and most references are written in prose — was unchecked text.

It cost twice in two days, both times caught by a human rather than by the gate:

- **ADR 0069** closed a paragraph with "Carried by todo29#P3." The file `todo29.md` did not exist
  when that line was written. The standard forbids inventing the number (§4), and the gate passed.
  ADR 0070, written the same hour under the same standard, got it right — it wrote "No todo carries
  this yet."
- **ADR 0060** pointed at `todo23#P5` after that phase had moved.

Both are the failure ADR 0058 named for `- Enforced by:` — a claim with nothing behind it — one
level out, in prose. A reference that resolves to nothing costs the next reader the search plus the
time they spend trusting it before starting the search (§1). That is worse than an admitted gap,
which costs one grep.

Measured before building: 53 `todoNN#PN` and 265 `ADR NNNN` references live in prose across this
repository's ADRs and todos. **All 318 resolve today** — so this rule is a guard against the next
one, not a cleanup of a backlog. That is worth saying plainly, because a new rule that passes on
first run usually means it is checking nothing. So it was mutation-checked rather than trusted: two
invented references were appended to ADR 0069, both were reported by name, and the file went back to
clean when they were removed.

```
Carried by todo99#P7 and see ADR 9999.        <- appended to ADR 0069
  prose names `todo99#P7`, which does not exist — never invent the number …
  prose names `ADR 9999`, which does not exist
```

The rule then caught this record while it was being written, for the same two examples quoted
outside a fence. They are fenced above for that reason, which is the rule behaving correctly rather
than an exemption.

## Decision

**A reference is resolved wherever it appears in a governed doc, prose included.** Two shapes are
checked and the third is deliberately not.

| shape | checked | why |
|---|---|---|
| `todoNN#PN` | yes | unambiguous; resolves against open **and** `completed/` todos |
| `ADR NNNN` | yes | the `ADR` prefix makes it an address, not a number |
| a bare `0069` | **no** | `0.05`, `1,500`, a byte count and a year are the same shape |

Three boundaries the implementation holds, each for a reason that would otherwise produce a false
failure:

1. **`completed/` counts.** `walkDocs` skips it because a closed record is not linted, but a closed
   record is still a real address — ADRs cite `todo24#P6` and `todo28#P4` constantly. Resolving
   against open todos alone would fail the gate on every correct reference to finished work.
2. **Fenced blocks are skipped**, consistent with every other rule (§5.1). An example showing the
   syntax is illustration, not an address.
3. **Qualified addresses are stripped first.** A `tree:todoNN#PN` address belongs to
   `crossTreeLint`, which knows what the other trees hold. Read here as well, the part after the
   colon would ALSO be tested as a same-tree address and fail against THIS tree's numbering — the
   exact confusion §4 exists to prevent, since numbers are per tree.

The bare-number exclusion is the honest half of this decision. A reference written as `0069` with no
prefix is still unchecked. Guessing which four-digit numbers are ids would fail the gate on
measurements, and a gate that fires on correct documents gets switched off.

## Consequences

- An invented or stale prose reference now fails the gate instead of surviving to the next reader.
  The two that shipped would both have been caught at write time.
- `RE` is exported from `docs-grammar` so the fence rule has one implementation rather than a second
  copy — the same reason ADR 0059 collapsed three edge-type lists into one record.
- **The standard was updated in the same change.** A gate rule the code enforces and §5.4 never
  mentions is precisely the prose-versus-parser drift `todo22#P4` tracks; adding a rule without
  listing it would have been this decision committing the fault it fixes.
- Writing "no todo carries this yet" is now the only correct way to admit an unclaimed consequence.
  It was already the standard's instruction; it is now the only thing that passes.
- A bare four-digit reference remains unchecked, by decision. If that gap ever costs something, the
  fix is to require the `ADR` prefix in governed prose rather than to start guessing.

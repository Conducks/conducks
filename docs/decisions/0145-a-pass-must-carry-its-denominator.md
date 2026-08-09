# 0145 — a pass must carry its denominator, and the type enforces it
Status: Accepted
- Builds: 0124
- Date: 2026-08-08
- Enforced by: src/contracts/verdict.ts (the `Verdict<T>` type — `clean` cannot be constructed without `examined`, and adding a variant breaks `renderVerdict` at compile time, verified by adding a fourth variant and seeing TS2366), tests/unit/contracts/verdict.test.ts, tests/integration/features/verdict-denominator.test.ts (advise, mutation-checked: laundering the denominator turns the two empty-case assertions red)

## Context

ADR 0124 established that "nothing to check is not a pass". It was written down, accepted, and then
violated at least eight more times. Measured on 2026-08-08: **17 of 132 memory entries are this one
defect**, and 32 `length === 0` branches sit in the CLI commands alone, each free to decide on its
own what to say when it holds nothing.

The instances are all the same sentence — nothing was examined, and that was reported as a negative
finding rather than as nothing:

| where | said | was true |
|---|---|---|
| a vault with 0 symbols | `Status: READY` / `SYNCHRONIZED` | nothing stored |
| `conducks_status` over MCP | `"stale": false` | no verdict in the payload at all |
| a file created after `watch` started | *(silence)* | git attributed no lines to an untracked path |
| a first analyze | a graph | edges missing versus a rebuild |
| a graph-load race | `SYMBOL_NOT_FOUND` | the graph was not loaded yet |
| `advise` | `✅ Structural Integrity is Pristine` | no denominator, and a crash when truly empty |
| `bench:health` | a green baseline | never ran a first analyze |
| a doc anchor | `clean` | never re-checked; ~57 lines stale |

The bottom half of that list is verification, not product: tests that compared `NaN` to `NaN`,
replicated the guard they were testing, or mocked away the singleton whose corruption WAS the bug.
**The checks shared the blind spot of the thing they checked**, which is why each fix felt like
progress while the next probe still found something.

## Decision

The rule stops being a principle and becomes a type. `src/contracts/verdict.ts`:

```ts
type Verdict<T> =
  | { kind: 'nothing-to-check'; why: string }
  | { kind: 'clean';   examined: number }
  | { kind: 'findings'; examined: number; found: readonly T[] }
```

`clean` cannot be constructed without a count. `nothing-to-check` is a separate variant rather than a
special case of clean. `renderVerdict` switches with no default, so a renderer that forgets the empty
case does not compile, and adding a fourth variant breaks every renderer at once instead of silently
falling through to whichever branch was written last — which is exactly how the MCP status payload
came to omit a verdict that the layer below it computed correctly.

`verdict()` decides emptiness of the DENOMINATOR before emptiness of the findings. That ordering is
the decision: asking "were there findings?" first makes an empty list look identical whether ten
thousand things were examined or none, and that inversion is present in every instance above.

`verdictToJson` always emits `checked`, including `0`. A machine reading `[]` or `{clean: true}` with
no denominator cannot tell a real pass from an absent one, and unlike a human skimming a terminal it
acts on the answer silently.

## Why not a lint

ADR 0089's build gate works because "a backtick inside a template literal" is an unambiguous
syntactic fact. "This branch lies about emptiness" is not: a grep for `length === 0` next to a success
string would fire on dozens of correct sites, and a gate that cries wolf gets switched off. The
constraint has to be visible to the compiler, not to a regex.

## Consequences

- `advise` is migrated as the proving surface: it now reads the denominator first, short-circuits an
  empty vault to a stated answer instead of walking an unmaterialised graph and dying on the
  `getAllNodes` guard, and reports `N symbol(s) examined` on a real pass.
- `advise --json` is a BREAKING shape change: `{status, checked, found}` rather than a bare array.
  Deliberate — the bare array carried the ambiguity this ADR exists to remove. Its one consumer
  (`phase1-commands.test.ts`) is updated.
- Remaining report surfaces are not yet migrated: `audit`, `prune`, `diff`, `supply-chain`, `arch`,
  `context`. They are stated as UNMIGRATED rather than left to be assumed done — this ADR would
  otherwise commit the error it describes.
- `coverage` (MCP) was on that list and is now migrated, on 2026-08-09 during todo53's walk. It earned
  the fix by producing exactly the defect predicted here: a coverage report matching nothing in the
  graph answered `{functions: [], summary: {total: 0, full: 0, dark: 0}}` — byte-identical to what a
  perfectly covered codebase returns. It now answers `status: nothing-to-check` with `why` naming the
  927 graph functions that were checked and matched none. This entry is edited rather than appended to
  because a list of what is still owed is only useful if it is current.
- Two test rules stand alongside the type, since a type cannot reach the verification half: a new
  check must be seen RED before its fix, and a test must never re-implement the thing it tests
  (export the real function and call it).

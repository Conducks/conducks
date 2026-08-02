# 0098 — only `this.` comes off a call target
Status: Accepted
- Date: 2026-08-02
- Builds: 0096, 0097
- Enforced by: the honest dangling classification — a bare `get`, `set` or `has` reappearing means the receiver is being discarded again

## Context

ADR 0096 made the real backlog visible and ADR 0097 removed the language's own names from it. What
remained was grouped by CAUSE, reading the source at each call site rather than guessing, and the
largest bare-callee entries were:

    31 get     26 set     18 t     16 has     12 values     7 delete

Not one of those is a symbol anybody wrote as a bare call. Reading the source:

    this.app.get('/', ...)                 -> target `get`
    this.gitRootCache.set(d, cached)       -> target `set`

`CallProcessor` stripped `this.` and then, if the remainder was still dotted, kept only the FINAL
property. `this.app.get` became `get` — a name that matches nothing, or matches some unrelated `get`
by the method-name fallback. The receiver was thrown away at parse time, so no later rule could
recover it however good it got.

The comment defending it said the collapse was "so IntraLinker can resolve it across imported files".
That was true of a same-file self-call (`this.helper()`), and wrong for everything with a field in
between.

## Decision

**Strip `this.` and nothing else.** `this.app.get(...)` keeps `app.get`.

A class FIELD is not harder than a local variable: it has a declared type or it does not, and the
typed-receiver rules (ADR 0082, 0084, 0090) already handle exactly that shape. Where the field's type
is unknown, the edge dangles as `app.get` — visible, attributable, and honest — instead of colliding
with every other `get` in the graph.

## Consequences

- **Bare `get`, `set`, `has` and `values` are gone: 0 edges each**, from 31, 26, 16 and 12.
- CALLS precision on conducks is **100.0%** (1 contradicted edge of 4,044 decided); overall 99.98%.
  mentorseed unchanged at 99.98%, oracle A 14/14 and B 7/7, 1,284 tests green.
- **The dangling rate ROSE, 4.686% → 4.793%, and that is the fix working.** A bare `get` that
  resolved to an unrelated method counted as resolved; `app.get` that cannot resolve counts as
  unresolved. Trading a wrong edge for an honest dangler moves the rate the wrong way and the graph
  the right way — which is exactly why ADR 0077 requires reading the rate beside what it is made of.
- **Those three were then fixed too, because none of them is a reference.** `super` names the base
  class through a KEYWORD and the heritage edge already records what that is — suppressed at
  emission. A generic type PARAMETER (`<T>`) is declared by the signature it appears in, so a
  reference to one points at its own declaration. And a call to a PARAMETER of the enclosing function
  (`new Promise((resolve) => resolve(x))`) names that function's own argument.
- MEASURED after all four: conducks **4.643%**, mentorseed **8.122%**. `super` and generic `T` are at
  ZERO. 24 `resolve`/`reject` edges survive, where the enclosing function is an inline arrow whose
  parameters are not recorded on any node — a smaller version of the same gap, left visible.
- Precision holds at **99.98%** on both subjects, oracle A 14/14 and B 7/7, 1,284 tests green.

# 0095 — an unverified edge is unknown, not correct
Status: Accepted
- Date: 2026-08-02
- Builds: 0085, 0090
- Enforced by: tools/verify-edges.mjs — run it against a vault; it exits non-zero when the source contradicts an edge

## Context

`tools/verify-resolutions.mjs` checked one shape: a CALLS edge landing on a class member. That is
**1,227 of 17,253 edges on this repository — 7.1%**. The other 93% had never been checked against
anything, and the reports quietly rounded that to "correct".

An unverified edge is not a correct one. It is an unknown one, and a wrong edge is invisible to every
count this project produces — it has both endpoints, it carries confidence, and every command reads
it as fact.

## Decision

**Verify five edge types by reading the FILES, and report what could not be decided.**

CALLS, CONSTRUCTS, ACCESSES, IMPORTS and TYPE_REFERENCE. Coverage **7.1% → 64%**.

| subject | edges | wrong | precision |
|---|---|---|---|
| conducks | 11,004 | 21 | **99.80%** |
| mentorseed | 13,633 | 65 | **99.51%** |

`unchecked` is its own column and is never folded into the pass count. A checker that quietly skips
the cases it finds hard reports 100% and means nothing; stating the undecided share is what keeps the
number honest.

Each check answers `wrong` only when the source positively CONTRADICTS the edge, and `unchecked` when
it cannot tell. Guessing in either direction makes the figure worse than not having one.

## Consequences

- **The checker was wrong three times before the graph was**, which is the discipline this repository
  keeps having to relearn:
  - `unit -> global::console` is supported by `console.log(...)`, not by `console(` — **619** false
    alarms;
  - JSX is a call, since `<Button />` compiles to `Button(...)` — **233** more, on a React subject;
  - a RENAMED import is called by its local name, so the target's own name never appears at the call
    site. That edge is right precisely BECAUSE of ADR 0085.
  Each was found by reading the flagged source rather than believing the count.
- **One real defect surfaced**, recorded as `todo32`: `interface MergeImpact` (lines 35–46) and
  `function mergeImpact` (line 62) collapse onto one lowercased id, and the survivor keeps the
  INTERFACE's span. Every call the function makes is then attributed to a block of type declarations.
  Six files on conducks carry this shape. `memory.md` knew the collision existed; nobody had measured
  what it costs, which is the difference between a recorded trap and a known one.
- The remaining 36% is `MEMBER_OF`, `DEPENDS_ON` and `PULSES_TO` — derived edges rather than resolved
  ones, so a source check is not the right instrument for them. Stated rather than counted.
- Neither tool runs in CI: both need a vault and a real subject. They are manual instruments, and
  that limit is worth repeating every time their numbers are quoted.

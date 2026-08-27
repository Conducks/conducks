# 0168 — a stale tick is marked, not destroyed

Status: Accepted
- Date: 2026-08-27
- Enforced by: plugins/checklist/src/lib.rs::a_tick_from_another_build_is_carried_and_named
- Amends: 0154

## Context

`conducks-visuals` §0 rule 6 said the testing page must **refuse** to restore
progress saved against a different build, and gave a good reason: *a tester
ticking tasks against last week's binary is worse than an untested build,
because it produces confidence.*

The build id is a git hash, stamped at compile time. So "a different build" is
**every commit**, including a commit that touches nothing but markdown.

Measured, on ForgeTerm, on 2026-08-27: eight commits in one afternoon while the
maintainer was working through the checklist. Each one cleared his ticks. The
plugin reported it correctly and politely — *"Ticks from build 340b896f were
dropped — this is build 4e432aa7"* — and the work was gone anyway.

A rule that makes a multi-hour pass impossible while anyone is committing stops
the testing it exists to protect.

## Decision

**A tick from another build is CARRIED, and marked with the build that made it.**

- It is drawn differently — amber and hollow rather than green and filled, with
  the short hash beside the task id — and it does not count toward this build's
  tally.
- The copied report prints it as `- [~] F1.T1 … (tested on build <hash>, not
  this one)`, so a report can never claim a stale tick as current.
- Touching a carried task settles it on the current build, whichever way it
  goes. Unticking is the tester saying it is not done, and leaving the old
  build's yes beside that would put two answers on one task.
- A carried tick keeps naming the build it was MADE under, not the one it was
  last read on. Otherwise every rebuild writes its own hash over the answer and
  the mark degrades to "carried from the build before this one" — true of
  everything, and therefore saying nothing.
- A NOTE is what the tester wrote. It is never build-specific, so it is carried
  whole and unmarked.

**Rejected: keep the ticks silently.** That is the thing rule 6 refuses, and
correctly: a pass that reads as complete when half of it was verified against a
binary that no longer exists is worse than no pass.

**Rejected: keep a tick only when its task's TEXT is unchanged.** A better proxy
than the build hash, and still a proxy — the wording of a task says nothing
about the code beneath it, so a stale tick would still read as current.

**Rejected: leave the rule alone.** It was defensible right up until somebody
tried to use it beside an active branch, which is the only condition it was ever
going to meet here.

## Consequences

- The stamp is still what makes any of this work: it is what the mark NAMES.
  Rule 6's last line — a stamp nobody checks is decoration — still holds; the
  check is now "which build", not "this build or nothing".
- Both surfaces had to change, and neither may drift from the other: the plugin
  in `plugins/checklist` and the generated page in `scripts/visuals/testing.mjs`.
  The page's storage keys already carried the build, so a rebuild made the old
  ticks invisible rather than deleting them — a different mechanism with the
  same effect on a tester, and the same fix.
- `system.css` gains an `li.carried` family, added identically to every repo
  that shares the file, as `conducks-visuals` §0 requires of any new class.
- Paste-to-restore no longer refuses another build's JSON. It restores it
  carried, and says so.

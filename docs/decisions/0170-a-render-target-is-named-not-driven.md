# 0170 — a render target is named, not driven

*Numbered 0166 for one afternoon. Another session in this repository took the
same number an hour later, and `docs-lint` did not notice — two records at one
address, which is the one thing a number has to prevent. Renumbered here rather
than there because the other 0166 already has a record building on it, and a
record nobody else cites is the cheaper one to move. The gate that would have
caught it is `no two records share a number`, added the same day.*

Status: Accepted
- Date: 2026-08-27
- Enforced by: tests/unit/domain/docs/testing-page.test.ts
- Builds: 0154, 0155

## Context

ADR 0154 split the visuals standard's source from its render, and ForgeTerm now draws the testing
checklist in a terminal pane from the same `testing.md` the browser page is generated from. That
left an open question in ForgeTerm's own todo (`forgeterm:todo18#P4`), parked by the user for four
months of nothing happening: *teach conducks to choose a render target, ForgeTerm first and the
browser as the fallback.*

It was parked with its own warning: **writing the fallback before the thing it falls back from has
earned its place is how an abstraction ends up serving one caller.** Phase 4 had already decided
that the mirror graph explorer and the architecture pages STAY in the browser, so the checklist was
the only thing a render-target abstraction would ever route.

Measured before building: ForgeTerm has no control channel. Its session server speaks a protocol
for shells — spawn, write, resize, scroll — and nothing in it opens a pane. Adding one means a new
`Request`, the window acting on it, a CLI to send it, and a `proto::VERSION` bump. That bump
restarts every running shell in every window.

## Decision

**conducks names the target. It does not drive it.**

`conducks testing` reports where the checklist is and how far through it anyone is. Inside ForgeTerm
it names the chord that draws it as a pane; anywhere else it opens the browser.

The one fact needed is already in the environment: ForgeTerm exports `FORGETERM=1` into every pane
it starts, so a process inside one can know it without asking anything.

**Rejected: a control channel.** It is what the parked task literally asked for, and it costs a
protocol message, a new outside-in command surface to keep safe, and every user's running shells —
to save one keystroke. A person who has just been told the chord can press the chord.

**Rejected: dropping it.** The question is real. Someone in a terminal that can draw the checklist
should not be sent to a browser, and until now they were.

**Rejected: opening the browser from inside ForgeTerm anyway.** It works, and it teaches the wrong
thing — that the pane is a curiosity rather than the better surface.

## Consequences

- The count comes from the SOURCE, never the rendered page. Counting the derived artefact makes the
  number wrong for exactly as long as somebody has edited the source without re-running the
  generator, which is the moment it is most likely to be read.
- A shell ForgeTerm did not start gets the browser even when a ForgeTerm window is open elsewhere on
  the machine. That is the right answer rather than a gap: the pane would open in a window the
  person is not looking at.
- `FORGETERM_PLUGIN_CHORD` is a constant in this repository describing another one's keymap. It is
  the price of not having a control channel, and it is one line — named so that if ForgeTerm's
  chords move again (they did once, in its ADR 0041) there is one place to follow.
- A repository with no `docs/visuals/testing.md` is reported as having no checklist and exits 0.
  `conducks-visuals` §0 builds that page only where a human is testing by hand, so its absence is a
  finished state and not a broken one.

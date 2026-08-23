# Testing — Fixture Repo
Provenance: authored — same document as base.md, except F1's two tasks were RENUMBERED: T1 and T2
kept their ids but swapped text, exactly what happens when someone inserts or removes a task in the
middle of a feature and slides every id after it instead of appending. Used only by
testing-parser.test.ts to prove `detectRenumbering` catches this against base.md.

## The window
chrome that has to earn its pixels

### F1 — The bar across the top
- How: One row, full window width.
- Note: A known gap, carried on purpose so the parser is proven to read it.
- [ ] F1.T1 Nothing is drawn under the traffic lights.
- [ ] F1.T2 The row runs edge to edge. — Pass: no gap on either side, at any window width.

### F2 — A feature with no note and one task with no Pass clause
- How: Nothing to set up.
- [ ] F2.T1 A task whose own wording is already what a pass looks like — nothing else to check.

## Anything else

### F3 — General impressions
- How: Anything not covered above.
- [ ] F3.T1 Overall feel — does anything look wrong, slow, or out of place?
- [ ] F3.T2 Anything you expected to exist and could not find?

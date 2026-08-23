# Testing — Fixture Repo
Provenance: authored — a small standalone source exercising every construct of the testing.md
grammar (todo74#P1). Both readers — the JS parser here and the Rust reader todo74#P3 will add — are
tested against this exact file, so it must never be edited casually: change it and both suites move.

## The window
chrome that has to earn its pixels

### F1 — The bar across the top
- How: One row, full window width.
- Note: A known gap, carried on purpose so the parser is proven to read it.
- [ ] F1.T1 The row runs edge to edge. — Pass: no gap on either side, at any window width.
- [ ] F1.T2 Nothing is drawn under the traffic lights.

### F2 — A feature with no note and one task with no Pass clause
- How: Nothing to set up.
- [ ] F2.T1 A task whose own wording is already what a pass looks like — nothing else to check.

## Anything else

### F3 — General impressions
- How: Anything not covered above.
- [ ] F3.T1 Overall feel — does anything look wrong, slow, or out of place?
- [ ] F3.T2 Anything you expected to exist and could not find?

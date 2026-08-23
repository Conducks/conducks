# Fixture Page
Provenance: authored — malformed on purpose: a table with no "---" separator row, used only by
pages-parser.test.ts to prove the renderer refuses rather than silently treating the second data
row as a header.

A short sub line.

| left header | right header |
| row one, left | row one, right |

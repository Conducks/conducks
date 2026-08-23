# Fixture Page
Provenance: authored — malformed on purpose: a `:::meta` block with no closing `:::`, used only by
pages-parser.test.ts to prove the parser refuses rather than silently swallowing the rest of the
document into the block.

A short sub line.

:::meta
This block is never closed.

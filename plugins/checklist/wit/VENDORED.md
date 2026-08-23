# This contract is a COPY, and here is exactly what guards it

`plugin.wit` is vendored byte-for-byte from ForgeTerm, which owns it. Two copies
of one contract is the failure ADR 0154 exists to end, so it is written down
rather than left to be discovered.

**What the check catches:** `plugin.wit.sha256` records the bytes this plugin was
built against. `cargo test` verifies the file still hashes to it, so an accidental
local edit to the copy fails a test rather than compiling into a silent fork.

**What it does NOT catch, and nothing here can:** ForgeTerm changing the contract.
This repository does not know where that repository is, and hard-coding a path
would break on every machine but one. When the upstream contract moves, someone
re-vendors this file and re-records the hash. Until then the copy is stale and
this repository cannot tell.

That asymmetry is the stated debt. It is narrower than "two copies, unguarded",
and it is not a gate on the thing that matters most.

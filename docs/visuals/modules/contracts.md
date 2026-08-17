# contracts — the vocabulary every layer may name

**Layer:** the bottom one. `contracts/` imports nothing in this codebase; everything else may import
it, including `interfaces/cli`, which may not reach `core` (ADR 0005).

**Read at `7c11bc4`.**

**Responsibility:** the words the layers share — the canonical kind ladder, what counts as a source
extension, what counts as a test file, the prism types parsing produces and graph stores, and the
verdict shape a command prints.

**Boundaries:** vocabulary, not logic. A predicate lives here when the QUESTION is shared, never
because the implementation was convenient — `tryResolveSymbol` is here because the CLI and the MCP
surface must resolve a symbol id the same way, not because it is a utility.

## It used to be two layers, and that was the defect

`src/types/` and `src/contracts/` both existed, and thirteen language packs imported
`types/language-plugin` — the single most-imported file in either folder. Two homes for one idea
means every new type is a coin toss, and the answer drifts.

They are one folder now. Two things went the OTHER way, into parsing, because only parsing used them:
`language-plugin` and `capture-tags`. A shared layer holding something one feature uses is the same
mistake pointing the other direction.

## What counts as a test is decided by the PATH

`contracts/test-path.ts` answers it, and it is path-based for a reason that cost real answers: the
reflector computes an `isTest` flag per file and writes it into node metadata, and the persisted
metadata carries no such key. So `properties.isTest` is `undefined` on every graph loaded from the
vault — which is every graph a read command sees.

Three consumers trusted that flag. Two were therefore no-ops that LOOKED like working filters:
`status` ranked a Python test file as the repository's top structural hotspot while filtering
`!isTest`, and the test aligner marked test nodes themselves as covered-by-a-test.

The rule is deliberately BROAD on directories and NARROW on names: any `/tests/` segment is a test
tree in every language conducks parses, while a bare `test` prefix is claimed only for a filename.
`testing/` is not a test tree — it routinely holds real source, and claiming it would silently drop
that code from every filter.

## The kind ladder is additive, and a declared rung needs a producer

`mapToCanonical` turns a grammar's capture into a rung. A rung nothing emits is not a reservation —
it is a row that makes the table wrong, and it hid a real defect: six different language constructs
were all tagged `@isPackage`, so PACKAGE's only nodes on this repository were a C# and a PHP
namespace while NAMESPACE — read by four consumers — had none at all (ADR 0100).

Two capture tags have been removed for exactly this reason since. A tag with no producer is
deleted, not carried.

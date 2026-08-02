# 0106 — a rename edits references, not whole files
Status: Accepted
- Date: 2026-08-02
- Builds: 0099, 0105
- Enforced by: tests/integration/features/rename-safety.test.ts (dry run writes nothing; declaration, import and call site all rewritten; an unrelated same-named function in another file untouched; string literals and comments untouched; a colliding new name refused with nothing written; an unknown symbol refused)

## Context

`rename` is the only thing this project does that WRITES to a user's source. A wrong answer anywhere
else misleads a reader; a wrong answer here edits code they did not ask about, and the only record
is their VCS diff.

Measured against expectations written first (`CONDUCKS/oracle/EXPECTED-RENAME.md`) on a throwaway
fixture: **6 of 11**. All five failures were predicted from reading the engine.

The class is named "Graph-Verified Refactoring". The write step used no graph information at all:

```js
content.replace(new RegExp(`\\b${escapedName}\\b`, 'g'), newName)
```

The graph chose the FILES; a regex chose the EDITS. And the file list itself was wrong — alongside
the upstream edges it added **every node in the project whose `name` matched**, a name test rather
than a reference test. What that produced, verbatim from the fixture diff:

```diff
 src/phone.ts    ← a DIFFERENT function that merely shares the name
-export function validate(i: string): boolean {
+export function checkEmail(i: string): boolean {

 src/caller.ts
-  console.log('validate failed');      ← a string literal
+  console.log('checkEmail failed');

 src/email.ts
-/** the word validate must survive in this comment. */   ← a comment
+/** the word checkEmail must survive in this comment. */
```

And renaming `target` onto an existing `existing` produced a file declaring `existing` **twice**,
under the message `✅ Successfully renamed`.

Every one of those is the same missing thing: the writer knew WHICH FILES and nothing about WHERE.

## Decision

**A reference site is a file AND a line, and only sites the graph points at are edited.**

1. **Sites come from edges.** The declaration's own `lineStart`, plus each upstream edge's
   `properties.line`. The name-match branch is deleted — a same-named symbol in another file is a
   different symbol.
2. **A reference with no line is a refusal, not a skip.** An unedited call site is a broken build,
   so the command names it and writes nothing rather than doing part of the job.
3. **A collision is a refusal.** If `newName` already exists in an affected file, stop — two
   declarations of one name is not recoverable from the tool's own output.
4. **Within a line, strings and comments are skipped.** Restricting to referenced lines is most of
   the fix but not all: a declaration usually sits under a doc comment naming it, and a call can
   share a line with a string. A small scanner, not a regex — quoting rules cannot be expressed as
   one, and a regex that half-handled them would fail silently on the cases it missed, which is the
   failure mode being fixed.

Position data has existed since ADR 0099 filled `edges.lineNumber`. This is the first consumer of
it, and the argument that ADR made — a position is a number, not a node — is what makes this
possible without a per-statement graph.

Rejected: (a) keep the whole-file regex and add a comment/string filter — it would still rewrite the
unrelated `phone.ts`, which is the serious defect; (b) re-parse each file with tree-sitter at rename
time to find exact byte offsets — more precise, and the right eventual answer, but it duplicates the
resolution the graph has already done and is a much larger change than the one this defect needs.

## Consequences

- **6/11 → 11/11.** The regression test was **run against the unfixed build first and failed 3 of
  6** (three cases pass either way because they cover behaviour that was already correct).
- Verified twice from a clean fixture to confirm determinism. An earlier apparently-broken result
  during this work turned out to be an artefact of my own test sequence — an incremental analyze
  mid-scenario — not the engine. Re-running from scratch is what separated the two.
- **`rename` had no symbol resolution at all**, found by the test rather than by reading. Node ids
  are lowercased on write (CONDUCKS-4), and `rename` passed the user's string straight to
  `getNode` — so a real-cased path, which is what an editor shows and what every macOS temp
  directory contains, reported "not found" for a symbol that exists. It was also the only command
  that could not take a bare name. `resolveSymbol` now tries the verbatim id, then the lowercased
  id, then the bare name, and `rename` uses it like every other command.
- That fix reaches `context` too, which shares `resolveSymbol` and had the same gap.
- **Still not handled: a renamed import.** `import { validate as check }` binds one name to another,
  and rewriting the original at the import line is correct while the local `check` must not change.
  The current engine edits the line the IMPORTS edge names, which is right for the common form; the
  aliased form is untested and unclaimed. Recorded rather than asserted.
- Ten commands now carry expected answers written before they ran, and **every one had at least one
  defect**. This is the only one where the defect edited files.

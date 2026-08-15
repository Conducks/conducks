# todo31 — move language queries out of TypeScript template literals
Status: todo
- Acceptance: a backtick in a query file is an ordinary character; `scripts/check-query-backticks.mjs` and its guard test are deleted as unnecessary rather than disabled.

## Context

Every language's tree-sitter patterns live in a TypeScript template literal, so a backtick anywhere
inside — including in a `;;` comment, which is the natural way to name a grammar node in prose —
terminates the string. `tsc` then reports `TS1005: ',' expected` pointing at query text, which names
nothing useful.

**It has fired SEVEN times in two days.** ADR 0089 added a pre-build check that names the file and
line before the compiler runs, and it has caught 7 of 7 — the residual cost is about twenty seconds
each time, down from a full debug cycle.

That is a mitigation, not a fix. A hazard that keeps firing is a design problem, and the gate's
success is the reason it is tolerable rather than the reason it is fine.

## Phase 0 — the decision, and why it is NOT being taken yet

- [x] PRICED: 13 files, 1,681 lines. The contract does not change — `queryScm: string` stays, and a
      file read yields a string. A non-TS copy step ALREADY exists in the build (`cp -r src/resources/*`),
      so extending it is trivial
- [x] The real risk is RUNTIME PATH RESOLUTION across `build/`, jest, and spawned workers — a class of
      bug this repository has already paid for more than once (build aliases, the resources copy, the
      worker script path). Trading a twenty-second annoyance for that risk today is a bad trade
- [-] Do it now — dropped: the gate has removed the cost that would justify it, and the migration's
      risk is concentrated in exactly the area that has broken before

## Phase 1 — the triggers that should reopen this

- [>] It fires inside a PATTERN BODY rather than a comment. The guard's narrow assumption — that only
      prose carries backticks — would then be false, and the gate would be catching less than it appears
- [>] A second person works on these files — waits on that person existing. They would be inheriting a hazard they did not choose,
      and "the gate catches it" is a poor answer to someone meeting it for the first time
- [>] The queries need tooling the string form cannot give — syntax highlighting, a tree-sitter
      formatter, or a query linter. All three exist for `.scm` and none for a `.ts` string
- [>] ADDED 2026-08-15 — THE GATE ITSELF BECAME A DEFECT SOURCE, which none of the three triggers
      above anticipated. Phase 0 rests on "the gate has removed the cost", and that is now a claim
      about a script that has grown and has already been silently wrong once.
      What happened: extracting the shared ECMAScript patterns created a query file that is not
      `<lang>/queries.ts`, and the gate walked directories only — so the ONE file three grammars
      depend on was the one file it could not see. Fixing that revealed the deeper assumption: it
      took the span from the first backtick to the file's LAST one, correct for one literal per file
      and wrong for two. Rewriting it to scan literal-by-literal then BROKE DETECTION ENTIRELY,
      because a stray backtick genuinely ends the literal, so "scan to the next unescaped backtick"
      stops exactly where the offence starts. It was caught only by mutation-testing the gate.
      A mitigation that silently stops mitigating is worse than the hazard it covers, because the
      hazard announces itself and a dead gate does not. This does not reopen the migration on its
      own — the RISK Phase 0 named (runtime path resolution across build/, jest and spawned workers)
      is unchanged, and nothing measured today speaks to it. It is recorded so the next reader
      weighs a gate that needs its own mutation tests, not the twenty-second annoyance of 2026-08-05

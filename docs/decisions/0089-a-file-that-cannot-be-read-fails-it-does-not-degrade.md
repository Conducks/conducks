# 0089 — a file that cannot be read fails, it does not degrade
Status: Accepted
- Date: 2026-08-01
- Builds: 0070, 0088
- Enforced by: tests/unit/core/parsing/parse-failure.test.ts (an invalid query, an unregistered parser and a valid file each behave as decided, and the error carries file, language and reason as fields), scripts/check-query-backticks.mjs (run by `npm run build` before tsc)

## Context

Six error paths in `reflect()` — no parser, a parse crash, a missing grammar, a query that would not
compile, a query that compiled to nothing, and a query that crashed against the tree — all did the
same thing: fall back to a 147-line regex extractor ("Gnosis") that produced nodes and almost no
edges.

**This is the worst failure mode available.** The graph stays populated, so nothing looks broken, and
the file's symbols merely appear to have no relationships — indistinguishable from code that
genuinely has none. Every downstream command then answers confidently from a graph that is missing
the file's edges. Worse, the fallback covered failures that are defects in THIS repository, not in
the file being read: a malformed query degraded to regex FOR EVERY FILE and the pulse still printed
a healthy node count.

The reporting was equally silent at the other end. `orchestrator.ts` skipped a failed file with a
bare `continue` — no count, no name, nothing. So even a real crash cost that file and said nothing.

**It never fired on either measured subject.** Instrumenting all six sites and analyzing conducks and
subject-b produced zero hits. It was carrying no load and hiding the one thing worth knowing.

## Decision

**Delete the fallback. Throw a named `ParseFailure`, and report every one at the end of the pulse.**

`ParseFailure` carries the file, the language and the reason as fields, so a caller reports them
without parsing prose. Both callers already recorded a per-file failure rather than aborting, so one
unreadable file costs that file — and is now counted and named — instead of costing the truth about
every file like it.

The orchestrator prints what could not be read, and says plainly that those symbols and edges are
MISSING from the graph. A count is not enough on its own: the point is that the graph is incomplete,
which is exactly what the old path concealed.

**And the backtick check now runs before the compiler.** A backtick inside a query template literal
ends the string, and tsc reports `TS1005: ',' expected` pointing at query text — a symptom that names
nothing useful. It has cost a debugging round five times.

ADR 0088 recorded that the guard TEST had failed to catch the fifth occurrence. **That was wrong.**
The guard catches it and names the file and line exactly — verified by planting one. It had simply
never been RUN, because the workflow typechecks first and tsc dies first. The defect was ORDER, not
detection, so the fix is a pre-build check rather than a rewrite of a working guard. ADR 0088 is
corrected in place, because it stated a fact about the world that was false.

## Consequences

- 147 lines of regex extractor deleted, plus the six branches feeding it.
- MEASURED: conducks 4,752 nodes / 16,402 edges after removal, against 4,765 / 16,439 before. The
  small drop is SELF-ANALYSIS — conducks analyzes its own source, and the deleted method's nodes went
  with it. Dangling steady at 1.171%, `audit` green.
- **The regex path was also the last place still fabricating a signature**, writing `returns: 'void'`
  for symbols it never measured. Deleting it finishes what ADR 0084 started.
- A language with no tree-sitter grammar now fails outright instead of producing edgeless nodes. That
  is the intended trade: a smaller graph that is true beats a fuller one that is not. Nothing in the
  supported set is affected, since the fallback never fired.
- `npm run check:queries` runs the backtick check alone; `npm run build` runs it first.
- **A machine with no C++ toolchain now fails at PREFLIGHT, once.** Native tree-sitter is the only
  parse path and an optional dependency that compiles from source; without it every file would throw
  and bury the one fact that matters under thousands of identical errors. The orchestrator checks
  before the first file and refuses with the install command, saying plainly that it will not write
  an empty graph that looks real. That machine used to get a regex graph — which is precisely the
  outcome this record rejects.
- **A wrong diagnosis nearly bought a rewrite of a working guard.** Prove a tool is broken by RUNNING
  it against the failure before recording that it missed one — the correction is in memory.md, since
  the habit generalises past this guard.

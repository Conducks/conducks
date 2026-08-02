# 0116 — a supplied file is not what it claims

Status: Accepted
- Date: 2026-08-03
- Builds: 0114, 0115
- Enforced by: tests/integration/features/coverage-commands.test.ts (11 assertions — run against the unfixed build first: 1 control passed and all 10 defect assertions failed)

## Context

`coverage` and `coverage-view` are the first commands in the todo37 sweep whose **primary input is a
file the user supplies** rather than the graph. That gives ADR 0114's standing question — *what does
this print when its input is damaged rather than absent?* — a second meaning: a file that parses as
JSON and is not an istanbul report.

Measured before any change:

| command | measured |
|---|---|
| `coverage package.json` | *"No BEHAVIOR nodes matched the coverage file. (Ran `analyze` on this repo first?)"* — **exit 0**, and the named cause is wrong |
| `coverage cov.json --vs-baseline` | three functions printed as **"(BROKE)"** in red, **exit 0** |
| `… --vs-baseline --json` | `--json` accepted and silently ignored |
| `coverage coverage/lcov.info` | *"Missing coverage file"* — about a file that was supplied |
| `coverage-view missing.json` | error printed, **exit 0** |
| `coverage-view cov.json --out --watch` | wrote a 344 KB HTML file literally **named `--watch`** |
| `coverage-view` file summary | the **mean of per-function percentages** — `server.ts` reads 48% where the line fill is 80% |
| `cd src && conducks coverage …` | a raw `DUCKDB_NODEJS_ERROR` object, and a `.conducks/` **created** in `src/` |

## Decision

**A file that is not a coverage report is refused by name.** `parseIstanbul` checks the shape before
walking it: every field was read defensively (`d.statementMap || {}`), so any JSON object produced an
empty report and bound nothing. The message that followed sent the user to re-run `analyze` — the one
thing that was already correct. A report with **zero entries keeps its own message**, because that is
a real report saying nothing was instrumented: a fact about the test run, not an error.

**When a real report binds nothing, show one path from each side.** *"The report bound to none of
this project's 860 functions — report names X, graph holds Y. Those are different trees."* Naming
which of the two is wrong is the only thing a reader can act on.

**A regression gate that cannot fail gates nothing.** `--vs-baseline` exits non-zero when anything
regressed, and honours `--json` — which was read after that branch returned, so it was dropped for
the one mode a script most wants.

**A flag is never a filename.** `--out` took the next argv entry unconditionally.

**A coverage path is a path, not a suffix.** Selecting the argument with `.endsWith(".json")` meant a
report saved under any other name was not seen at all.

**A file summary is a LINE fill, not a mean of percentages.** The mean lets a covered three-line
helper outvote a dark three-hundred-line function.

**A READ never creates.** Two places brought a `.conducks/` into being as a side effect of a run that
then failed: `ensureVaultOpen` mkdir'd unconditionally, and the log sink mkdir'd its parent to hold
`mcp.log`. The directory left behind reads as a project on the next run — which is how a wrong answer
becomes durable. Both are now gated on a write session, and a read with no vault gets a sentence.

**One walk, not two.** The CLI anchored the vault at `cwd` verbatim while `discoverRoot` walked up
independently, so one directory inside a project the two disagreed. The CLI now asks the bootstrapper
for the root before creating persistence, and the walk is memoized — it is asked twice per run, and
the fallback warning printed twice, which reads as two problems.

**The message, not the object.** The CLI's top-level handler passed `err` to `console.error` and
printed the driver's internals. This is the same leaked-driver shape ADR 0115 fixed for `resonance`,
here on the path every command falls through. The stack stays behind `--verbose`.

## Consequences

- **10 of 11 assertions failed against the unfixed build**; the eleventh is the control that binds a
  real report, and it passed throughout — a check that could not have disagreed is worth nothing
  (ADR 0112).
- **The last two defects are not `coverage`'s.** They were found by running it from `src/`, and they
  belong to persistence, the log sink and the CLI dispatcher — so every command is fixed by them.
  Measuring one command found a defect in the path all thirty-nine share.
- `runCli` in the integration helpers now takes a **timeout**. Writing the `--out --watch` assertion
  hung `spawnSync` forever and the whole suite died on jest's timeout with no failing assertion to
  read. A killed child returns a null status, which reads as a non-zero exit — which is what a hang
  deserves.
- `coverage-view`'s copy of the node SELECT is gone; both commands take it from `registry.coverage.nodes`.
- Two commands measured, two with defects. The sweep stands at **ten for ten**.
- No regression: **1,363 tests green**, edge precision unchanged.

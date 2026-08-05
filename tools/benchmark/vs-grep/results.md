# Benchmark A — results, scored against the pre-registered truth

Run 2026-08-05 on `scraper` @ 8e558ca. Raw outputs in `raw/` — the judgement axes are a person's,
and a number nobody can audit is a claim, not a measurement. Truth was hand-derived BEFORE the run
(`tasks.md`, committed first).

## Scoreboard

| task | recall | noise | self-contained | round trips | verdict |
|---|---|---|---|---|---|
| T1 define | grep 1/1 · conducks 1/1 | grep 0 · conducks 1 echo row | conducks (signature + doc under the hit) | 1 · 1 | tie, conducks richer |
| T2 literal string | grep 2/2 · conducks 0/2 | — | — | 1 · 1 | **grep, as predicted** — the graph stores symbols, not strings |
| T3 who calls X | grep 10/10 · **conducks 0/10** | grep 1 (the def) | — | 1 · 1 | **grep. conducks FAILED** |
| T4 indirect impact | grep n/a · **conducks 0** | — | — | grep ≥3 · — | **nobody**. conducks' flagship task, lost |
| T5 what does X do | both reach the docstring | grep carries code fragments | conducks (prose, one shot) | 1 · 1 | conducks |
| T6 find by purpose | conducks names `RetryDecision` in 10 rows · grep 42 lines / 14 files | conducks 6 weak rows · grep ~30 lines | conducks (doc line per hit) | 1 · 1 | conducks on noise; NEITHER surfaced the executor (`batch_runner.py`) |
| T7 noise test | truth: nobody calls it. conducks 0 (correct) · grep's `\bclassify\(` found only the def (correct) | 0 · 0 | — | 1 · 1 | tie — both competent forms beat the naive `rg classify` |
| T8 unused exports | conducks lists `classify` as unimported — matches the independent T7 derivation | buried in ~190 rows | partially | 1 · grep UNANSWERABLE | conducks, only entrant |

## The two findings that matter more than the scoreboard

### 1. `impact` returned 0 callers for a function with 10 measured call sites

Every one of the 10 truth sites calls it as `paths.resolve_project_path(...)` — through the module
alias, which is the NORMAL Python call form. Those calls sit in the 2,897 dangling references this
subject carries (1,827 of which name an in-repo symbol — measured earlier). The receiver is never
resolved, so the edge never lands, so upstream impact is empty.

**On Python, conducks currently loses its flagship question to grep.** todo42 (receiver-type
resolution) is not an incremental improvement; it is the difference between winning and losing T3/T4,
and this benchmark is the regression test for it.

### 2. A true zero and a broken zero print the SAME output

T7's `impact classify` printed `0 Symbols affected` — CORRECT, nobody calls it. T3's
`impact resolve_project_path` printed `0 Symbols affected` — WRONG, ten callers exist. The reader
cannot tell these apart. This is CONDUCKS-37 (a green tick over an empty set) in its most expensive
form: the honest answer and the resolution failure wear the same clothes. `impact` should state what
it examined — "0 of 16,674 edges reach this symbol; 2,897 references in this graph are unresolved and
one of them may be yours."

Also recorded: `--depth` does not exist on `impact` (the pre-registered T4 command was wrong as
written); `prune`'s finding was correct but arrived buried in ~190 question rows; and `query --doc
retry` found the vocabulary (`RetryDecision`) but not the executor, because `batch_runner.py`'s
docstrings never say the word.

## What this changes

| action | why |
|---|---|
| todo42 jumps the queue | it decides T3/T4, the investor question |
| `impact` zero-result honesty | separate "nobody calls this" from "nothing resolved to this" |
| re-run after todo42 | tasks.md is now the fixed measure; same truth, same commands |

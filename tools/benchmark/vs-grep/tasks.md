# Benchmark A — conducks vs grep, pre-registered

Subject: `scraper` @ 8e558ca (frozen, ADR 0135). Written BEFORE either tool ran — a benchmark scored
after the fact scores whatever happened. Ground truth was hand-derived from the source with `rg`,
which biases the truth TOWARD grep: every truth item is by construction something grep can reach, so
conducks matching it is the strong direction of the claim.

The measure is not milliseconds. Grep wins wall-clock always and that is not the claim. Four axes:

- **recall** — of the hand-derived true answers, how many appeared
- **noise** — results returned that are NOT answers
- **self-contained** — can the reader decide from the output alone, without opening a file
- **round trips** — invocations to reach a decision

Grep gets its best realistic form per task (`rg` with the flags a competent developer types), and the
tasks grep should WIN are in the set and reported.

## T1 — where is `resolve_project_path` defined? (expected winner: grep)

- Truth: `src/foundation/paths.py:23`, one definition.
- grep: `rg -n "def resolve_project_path" -t py`
- conducks: `query resolve_project_path --limit 5`

## T2 — where is the literal `"data/logs"` used? (expected winner: grep)

- Truth: `src/core/logging_setup.py:13` and `src/core/logging/logger.py:161`. Two sites.
- grep: `rg -n '"data/logs"' -t py`
- conducks: `query "data/logs" --limit 10` — expected to LOSE: the graph stores symbols, not string
  literals. If it returns nothing relevant, that is the honest result and is reported as a loss.

## T3 — who calls `resolve_project_path`? (contested)

- Truth, hand-derived: 10 call sites in 9 files —
  `specialists/scholarships/specialist.py:96,97` · `specialists/google_maps/specialist.py:122` ·
  `foundation/job_runner.py:122,291` · `core/logging_setup.py:13` · `core/logging/logger.py:161` ·
  `core/output/writer.py:208` · `core/mapper/adaptive_specialist.py:77` ·
  `tests/foundation/test_job_runner.py:29`.
- grep: `rg -n "resolve_project_path\(" -t py` then subtract the `def` line by eye.
- conducks: `impact resolve_project_path`
- Score self-contained on: does the output name the ENCLOSING FUNCTION per site, or only the file?

## T4 — what breaks if `resolve_project_path` changes, INCLUDING indirect? (expected winner: conducks)

- Truth for the indirect chain, hand-derived: `setup_logging` (`core/logging_setup.py:13`) calls it,
  and `foundation/job_runner.py:99` calls `setup_logging` — so job_runner is a SECOND-HOP dependent.
- grep: structurally cannot in one query. The honest grep protocol is recursive: grep the callers,
  then grep each caller's name. Round trips counted accordingly.
- conducks: `impact resolve_project_path --depth 2`
- Score: does the second hop (`job_runner` via `setup_logging`) appear at all, and is it MARKED as
  indirect?

## T5 — what does `setup_logging` do? (expected winner: conducks on round trips)

- Truth: its docstring — "Sets up a centralized logger that outputs to both console and a per-run
  file. Returns the path to the created log file."
- grep: `rg -n -A 4 "def setup_logging" -t py` — reaches the text, in fragment form.
- conducks: `explain setup_logging`

## T6 — find the thing that HANDLES RETRIES, name unknown (expected winner: conducks)

- The developer knows the concept, not the name. Truth, hand-derived: the retry executor is
  `core/queue/batch_runner.py` (`for attempt in range(1, self._retry_max_attempts + 1)` at :57);
  the decision vocabulary is `RetryDecision` in `core/errors/error_types.py:27`; the config knobs are
  `retry_max_attempts` / `retry_backoff` in `foundation/base_interfaces.py:185`.
- grep: `rg -in "retry" -t py` — expected to hit many files (the word appears in comments, enums,
  configs); the reader filters by eye.
- conducks: `query --doc retry`

## T7 — who calls `classify` (the error classifier)? the NOISE test (contested)

- Truth, hand-derived: NOBODY in-repo calls it directly except the re-export in
  `core/__init__.py:20`. Every other "classify" in the codebase is a DIFFERENT symbol —
  `_classify_role`, `classify_anchor`, `_classify_domain`, `classify_http`.
- grep: `rg -n "classify" -t py` returns them all; the competent form `rg -n "\bclassify\("` still
  cannot separate `self._classify_role(` from `classify(`  without reading.
- conducks: `impact classify` — the graph knows they are different symbols. Score NOISE hard on both.

## T8 — which exports does nobody use? (grep: unanswerable)

- grep has no protocol for this short of scripting negation over every export, which is a program,
  not a query. Reported as UNANSWERABLE rather than scored zero — a zero implies it tried.
- conducks: `prune`
- Truth: not fully derivable by hand at this size; scored on whether `classify` (T7's finding — an
  export with no in-repo caller) appears, which was derived independently first.

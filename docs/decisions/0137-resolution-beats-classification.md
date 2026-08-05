# 0137 — resolution beats classification

Status: Accepted
- Date: 2026-08-05
- Builds: 0012, 0108, 0135
- Enforced by: tests/unit/core/parsing/python-import-resolution.test.ts; tools/benchmark/vs-grep/tasks.md T3/T4 are the regression measure

## Context

The vs-grep benchmark's headline finding (todo44#P6): `impact resolve_project_path` answered **0
callers** against 10 hand-measured call sites. Every caller reaches the function through
`from foundation import paths` — and every in-repo Python import on the frozen subject was recorded
as `DEPENDS_ON ecosystem::…`, an external dependency. The whole module tree of a Python project was
classified as a supply chain.

Three defects stacked, each hiding the next:

1. **`classifyOrigin` speaks npm.** It is a pure function over the specifier string, and its
   vocabulary is Node's: a bare word that is not a Node core module is a third-party dependency.
   Every bare Python import is a bare word. The pipeline honoured the classification and **never
   consulted the language's own resolver** — the branch that calls `imports.link()` was unreachable
   for any import classified external.
2. **`PythonResolver` compared one canonicalized side against one raw side.** It lowercased its
   candidate and asked `allFiles.includes(...)` — so on any repository whose absolute path contains
   an uppercase letter (every macOS home directory), NO candidate could ever match. Even when
   consulted, it always answered nothing. Invisible, because an unresolved import reads as an
   ordinary external dependency.
3. **`@named_import` was captured and consumed nowhere.** `from foundation import paths` binds the
   MODULE `foundation/paths.py`, and only that file's presence in the unit's import scope makes
   `paths.resolve_project_path(...)` resolvable. The capture carrying this sat dead in the query.

## Decision

**A specifier that RESOLVES to an in-repo file of the same language family is internal, whatever the
string-level classifier says.** Only the provider's own specialized resolver may overturn the
classification — it answers with an exact module-path match or not at all. The generic fallback chain
(basename, prefix) stays out of the decision: ADR 0070 records what fuzzy matching does to a bare
specifier.

**The standard library never resolves in-repo.** The moment bare-import resolution worked, the
proximity walk bound `import logging` to the subject's own `core/logging/__init__.py` — a wrong edge
minted by the fix itself. `PYTHON_STDLIB` (the importable module names — a different set from the
builtins vocabulary in `built-ins.ts`: `print` is a builtin and not importable, `logging` is
importable and not a builtin) is refused before the walk. The qualified form (`core.logging`) and
relative imports still reach an in-repo package that shares a stdlib name.

**A named import that is a module imports that module's file.** For namespace-semantics providers,
`from <pkg> import <name>` where `<pkg>.<name>` resolves to a real file pushes a second IMPORTS
relationship for that file, so the linker's import scope carries it and member calls on the binding
resolve through the existing 3c path. A named symbol import resolves to no file and changes nothing.

## Consequences

Measured on the frozen subjects (ADR 0135), before → after:

| measure | before | after |
|---|---|---|
| scraper cross-file resolutions | 4,217 | 5,016 |
| scraper unresolved references | 2,897 | 2,106 (17.4% → 12.6%) |
| `impact resolve_project_path` | 0 symbols | **11 symbols, 8 files, direct/indirect marked, source line per site** |
| edge precision (source-verified) | 99.94% | 99.93% — +1,066 newly checkable edges, 1 new wrong |
| orchestrator / sofie | — | byte-identical, the change is namespace-semantics-gated |

**The fix made conducks see a REAL cycle it was blind to:** `foundation/__init__ → job_runner →
logging_setup → foundation/__init__`, verified hop by hop in the source — and the authors knew, which
is why `job_runner.py:98` does its import INSIDE the function, the classic Python cycle-break. The
baseline's `cycles 0 → 1` is a finding appearing, not a regression: a graph that resolves nothing
reports no cycles, which is ADR 0077's denominator lesson wearing a new face.

What is NOT fixed here: `import x.y as z` aliased submodule receivers, `__init__` re-export chains
followed transitively, and the TypeScript side of receiver typing (todo42 proper). T5-of-truth
`tests/test_job_runner.py:29` resolves through the package `__init__` re-export surface and appears;
the deep-chain acceptance in todo42 stays open.

# 0065 — a query is compiled once per language, not once per file
Status: Accepted
- Enforced by: tests/unit/core/parsing/query-cache.test.ts
- Date: 2026-07-31

## Context

ADR 0061 profiled `reflect()` after fixing the git-subprocess duplication it was written to fix, and
left one item open: `createQuery` — tree-sitter query compilation — was 7.7% of the original profile
and roughly 15% of the smaller total left after that fix, the largest remaining non-git cost, and
never measured on its own. `todo21` Phase 12 carried it forward as: "tree-sitter queries look to be
compiled per FILE rather than once per LANGUAGE. Fixed when a profile shows query compilation once
per language per pulse, and the parse stage is timed before and after."

Reading the call site confirms it. `GrammarRegistry.createQuery(lang, source)` at
`src/lib/core/parsing/grammar-registry.ts:204` calls `new NativeParser.Query(nativeLang, source)`
with no cache. Its only caller, `src/lib/domain/analysis/reflector.ts:162`, calls it once per file:
`grammars.createQuery(lang, provider.queryScm)`. Both arguments are per-language constants — `lang`
comes from `grammars.getLanguage(provider.langId)`, and `GrammarRegistry.loadLanguage()` sets each
langId's entry exactly once (`if (this.languages.has(langId) ...) return;` guards re-entry), so it is
the same object for the life of the process. `queryScm` is a `readonly` class field on each
`NativeProvider` (`typescript/index.ts:24`, and one equivalent per language) — a fixed string, never
built per file. So a 299-file TypeScript pulse compiled the identical query 299 times.

## Decision

`GrammarRegistry` now caches compiled `Query` objects in `queryCache: Map<any, Map<string, any>>`,
keyed first on the `lang` object passed to `createQuery`, then on the `source` string. The first call
for a given (lang, source) pair compiles and stores; every later call for the same pair returns the
stored object.

**Keyed on the `lang` object's identity, not on `langId`.** `createQuery(lang: any, source: string)`
receives no langId — its caller (`reflector.ts`) does not pass one, and that file is owned by another
agent on this run, so its call signature could not change. Rather than add a langId parameter no
caller would populate, or reverse-scan the registry's `languages` map to recover one, the cache keys
directly on the value already in hand. This also makes the cache correct by construction rather than
by an assumption: it does not need "one query string per language" to hold, because it never conflates
two different `lang` objects even if two languages happened to carry byte-identical `queryScm`
strings. Nesting `source` under `lang` (rather than concatenating them into one key) avoids building a
composite string key out of a query body that can run to several KB.

**Not chosen: keying on `langId`.** Cheaper to look up and easier to reason about in isolation, but it
requires either changing `createQuery`'s signature — which only its unowned caller could then
populate — or a linear reverse-lookup through `this.languages` on every call, trading a compile for a
scan. The object-identity key needs neither and is already correct for the one caller that exists.

**Not chosen: keying on `source` alone.** Simpler still, but wrong if two languages ever share query
text — nothing rules that out (`tsx` and `typescript` already share a native package,
`tree-sitter-typescript`, in `loadLanguage`'s switch) — and a same-content collision would silently
hand one language's compiled matcher to another's node types.

**No invalidation is implemented, and none is needed within a process.** The two long-running hosts
for this registry are the MCP server and the file watcher. Neither can change what is cached here: a
`lang` grammar object is set once per process (`loadLanguage`'s guard), and `queryScm` is a `readonly`
field on a provider class, not data read from a file — nothing on disk changing during a process's
life changes either cache key or its value. A grammar upgrade or a query rewrite requires a new
process (a new native module load), which starts with an empty cache.

## Consequences

Measured directly rather than estimated, same machine: 299 `createQuery` calls for the TypeScript
grammar and its real query source (`TypeScriptProvider().queryScm`), before and after this change —

| | before (uncached) | after (cached) |
|---|---|---|
| total, 299 calls | 4,694.64 ms | 18.26 ms |
| mean per call | 15.701 ms | 0.061 ms |

The measurement script is throwaway and was not committed (kept in `/private/tmp`, per this run's
rules); it loads the real registry and provider, times a loop of `createQuery` calls, and was run
twice against the un-cached code (by temporarily deleting the cache lookup/store lines, restoring them
after) and against the cached code. This is per-call compilation cost, not a full-pulse timing —
Phase 12's remaining task, re-measuring the whole parse stage, is explicitly out of scope for this
change (owned by another task in the same phase) and is not claimed here.

`- Enforced by:` pins the identity-cache invariant: repeated `createQuery(lang, source)` calls with
the same arguments return the SAME object, proven red first by temporarily removing the cache and
watching the assertion fail (`Object.is` inequality on the second call), then green again with the
cache restored.

`Open:` the full-pulse re-measurement this ADR's numbers feed into — whether the ~15.6 ms saved per
avoided recompile is still worth 13.5% of a shrinking parse-stage total — is carried by
`todo21#Phase12`'s third task, not answered here.

# 0077 — a declared package refuses the fallback, it does not answer in its place
Status: Accepted
- Date: 2026-08-01
- Enforced by: tests/unit/core/parsing/declared-package-resolution.test.ts (a declared package specifier whose last segment matches a project file resolves to neither, a scoped package is looked up by both segments, and an undeclared specifier still reaches the fallback)

## Context

Two defects met in `ImportProcessor.resolve()` and produced a third.

**`registerExternalPackage()` had no production caller.** `context.isExternalPackage()` therefore
answered `false` for everything, so step 2 of the resolver — the external-package check — was dead
code that looked live. Manifests ARE read, by `essenceLens.refract()`, but in step 3 of the pulse:
AFTER the wave that resolves imports. At the only moment the question is asked, nothing had been
told the answer.

**The package name was computed wrong for scoped packages.** `specifier.split('/')[0]` turns
`@playwright/test` into `@playwright`, which is not a package, so a scoped package could never have
matched even once the set was populated.

With step 2 dead, a bare specifier fell through to step 4, the basename fallback. On mentorseed:

| specifier | matched | reality |
|---|---|---|
| `next/headers` | `packages/core/security/server/headers.ts` | Next.js, not the project's file |
| `vitest/config` | `packages/core/config/server/config.ts` | vitest, not the project's file |

Six IMPORTS edges, each a WRONG edge rather than a missing one. ADR 0070 refused exactly this trade
for alias specifiers; this is the same failure one specifier-shape over.

## Decision

**A declared package makes step 4 REFUSE. It does not answer in step 4's place.**

The obvious fix — let step 2 fire and return `{ kind: 'external_dependency' }` — was built first and
**measured as a regression**, which is why this record exists at all:

| | nodes | edges | dangling | rate |
|---|---|---|---|---|
| before | 5,997 | 19,014 | 194 | 1.02% |
| step 2 answers (rejected) | 3,182 | 6,179 | **99** | **1.60%** |
| step 2 refuses (shipped) | 6,002 | 19,008 | **182** | **0.96%** |

Package level is coarser than what the graph already had. Left to fall through, an unresolved
external specifier is induced as `lib::<pkg>::<symbol>` — a node per imported SYMBOL, which is what
makes "who uses `useState`" answerable. Answering at package level collapsed every named external
import into one link and destroyed two thirds of the graph.

**The dangling count improved while the rate worsened.** 194 → 99 reads as a win in isolation and is
the signature of a denominator being destroyed. Any change reported by a count alone can hide this;
the rate and the totals have to be read together.

So the manifest is used for the one bit it is actually authoritative about: this specifier names a
package, therefore a project file sharing its last path segment is a coincidence. Refuse, and let
induction keep the symbol-level answer.

Manifests are now read BEFORE the wave, in `orchestrator.analyze()`, from EVERY manifest in the tree
rather than the root one — on a monorepo `next` is declared in `app/package.json` and the workspace
root declares nothing. The names travel into the workers the same way global symbols do, because a
worker builds its own `AnalyzeContext` and anything the main thread does not send is knowledge the
worker does not have.

## Consequences

- Six wrong edges are gone and 12 dangling targets with them, at no cost to graph size: 6,002 nodes
  against 5,997, and 19,008 edges against 19,014. conducks on itself is unchanged (4,134 nodes,
  1.16%) and `audit` still passes.
- Step 2's early return still exists and is still effectively unreachable, now by DESIGN rather than
  by accident, and the reason is written at the branch. Anything that makes it fire again should
  re-run the A/B above first.
- Scoped package names are now computed from both segments everywhere the check is used.
- `essenceLens.declaredDependencies()` reads names only. Versions and node creation stay in
  `refract()`, so there is still one place that builds ECOSYSTEM nodes.
- **Undeclared external packages are unaffected** — a specifier no manifest mentions still reaches
  the fallback and can still be basename-matched onto a project file. That is the remaining share of
  this failure and it is not fixed here, because refusing on shape alone would break the languages
  step 4 exists for, where a bare specifier legitimately names a project module.

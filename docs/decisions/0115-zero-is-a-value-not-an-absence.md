# 0115 — zero is a value, not an absence
Status: Accepted
- Date: 2026-08-02
- Builds: 0103, 0111, 0114
- Enforced by: tests/integration/features/phase1-commands.test.ts (entropy and cohesion refuse an unknown symbol and resolve a bare name; resonance refuses a non-project without leaking a driver error; flows offers --json; advise reports no container as a hub) — run against the unfixed build first, all 7 failed

## Context

Five commands measured together in the todo37 sweep: `flows`, `entropy`, `cohesion`, `resonance`,
`advise`. Every defect found is one shape — **a confident answer where there was no answer.**

| command | measured |
|---|---|
| `entropy zzzNoSuchSymbol` | `0.0000`, `0` authors, `0.00%` risk, **exit 0** |
| `entropy IntraLinker` | the same zeros for a REAL class — the raw argument went to the domain as a literal id and nothing resolved a bare name |
| `cohesion zzzA zzzB` | `0.00%` similarity, **exit 0** |
| `resonance /tmp` | a raw DuckDB object — `code: 'DUCKDB_NODEJS_ERROR', errorType: 'Binder'` — **exit 0** |
| `advise` | a REPOSITORY and a DIRECTORY as its two top "monolithic hubs" |

**Zero is a legitimate value for entropy and for similarity.** That is exactly why it must never be
printed for a symbol the graph does not hold: nothing distinguishes "measured, and it is zero" from
"there was nothing to measure".

## Decision

**A measurement requires a subject.** `entropy` and `cohesion` resolve their arguments through the
same path every other symbol command uses, and refuse — non-zero exit — when the graph does not hold
them. `cohesion` names which of the two was missing. When entropy IS zero for a real symbol, the
output says why: *"no authorship history for this symbol; entropy is 0 because nothing was
measured."*

**A driver error is not an answer.** `resonance` validates the target holds a synapse before
querying, and catches what remains rather than letting it print itself.

**Schema drift gets a sentence instead of a stack.** There is no version in the vault, so a database
written by an older conducks fails on the first SELECT naming a column that did not exist then.
`persistence.query` now translates exactly that signature — `Referenced column "x" not found` — into
*"this vault predates the current conducks schema … rebuild it with `conducks analyze`"*. Nothing
else is reinterpreted; guessing at causes is how a wrong diagnosis gets printed with confidence.

**Containment is not coupling.** `advise` skips container kinds when hunting monolithic hubs. Every
file in a repository depends on the repository — reporting it as a hub to "consider splitting" is
advice nobody can act on, and it is the same containers-outrank-code shape ADR 0103 fixed in
`context`.

**`flows` states what it hid.** A single-symbol flow is not a flow and was skipped silently, so a
project whose flows were all single-member printed a heading and nothing.

`--json` added to all five.

## Consequences

- All seven regression assertions were **run against the unfixed build first and all seven failed**.
- **An existing test was pinning the fabrication.** `cli.test.ts` ran `entropy some::symbol` — an id
  no node has — and asserted the output contained "Structural Entropy". It passed because the
  command printed a header above fabricated zeros. Reversed: it now asserts the refusal, and a real
  symbol is measured separately. That is the third test this session found requiring a wrong answer,
  after ADR 0099's rank characterization and ADR 0100's reachability test.
- Five commands measured, five with defects. Combined with `entry` (ADR 0113) and `list`/`link`
  (ADR 0114), the sweep stands at **eight for eight**.
- The standing question from ADR 0114 — *what does this print when its input is damaged rather than
  absent* — found four of the five. It is worth asking of every remaining command before running it.
- No regression: 1,352 tests green, edge precision **99.98%**.

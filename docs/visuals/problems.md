# Problems
Provenance: authored — a concern page. It makes no code claims of its own; every measurement it cites is anchored on the canvas or in the module note that owns it.

A defect, its evidence, and who owns it. A block on the canvas that IS one links here.

:::elsewhere
**This page was empty for a while, and the sentence saying so outlived it.** The ADR 0150 core campaign found and FIXED its defects in the same pass — inheritance producing no edge in three languages, a linker that could never run, a monitor re-implementing git, a filter that was a no-op. Each is in the note of the feature that owned it, with the measurement that found it and the mutation that proved the fix, and none of them is here. What IS here is the other kind: a defect whose fix is a DECISION rather than a patch, so it cannot be closed in the pass that found it. p1 was resolved that way and is kept as the record of how.
:::

## p1 — the mirror test enforces half its rule

**Background.** ADR 0148 says every MCP tool is also a CLI command, and where both exist they mirror. `tests/architecture/paired-surfaces.test.ts` is named as its enforcer.

**What is wrong.** The test checks that a pair does not DRIFT. It never checks that the pair EXISTS. `tests/architecture/paired-surfaces.test.ts:71` reads `if (!fs.existsSync(cliFile)) continue;` with the comment *"MCP-only tool: nothing to drift from"* — so a tool with no CLI twin is skipped rather than failed, and the rule's first half is unenforced.

**What it let through.** `conducks_graph_query` (`src/interfaces/tools/tools/synapse.ts:796`) runs raw SELECT against the vault and has no CLI command anywhere. That is precisely what ADR 0148's own text says must not exist — *"an agent must never be able to ask something a person cannot, because the CLI is where a person checks what the agent did."*

**The complication.** ADR 0007:21 decided to KEEP `graph_query` MCP-only, on purpose, and pre-dates 0148. ADR 0148 never cites 0007. So the two records disagree and neither is stamped against the other. This is a decision to make, not only a test to fix: either 0148 gains a stated exception with 0007's reasoning, or `graph_query` gains a CLI twin.

**Resolved 2026-08-23 by ADR 0157.** The test now asks the question it was skipping: every MCP tool must have a CLI command or a granted reason not to, with the grant naming the record that argued it. `conducks_graph_query` is granted on ADR 0007's reasoning, which 0148 never cited. A second case fails if a granted tool later gains a CLI command, so the exception cannot outlive its gap. Both cases were run against the pre-fix list and both failed.

## p2 — a domain service that is required to exist and reached by nothing

**Background.** ADR 0028 deleted DAAC and named `mirror.engine.ts` as its replacement. `tests/unit/adr-invariants.test.ts` asserted that file exists, so the ADR could not silently rot.

**What was wrong.** Nothing called it. `MirrorEngine` — 232 lines — was referenced only by its own one-line barrel re-export in the same folder; the two other mentions in `src/` were historical comments. The `mirror` registry slice uses `GatewayService` in `domain/analysis` instead.

**Why no tool caught it.** `conducks prune` did not flag it, and correctly so by its own rule: the barrel export is an incoming edge, so the symbol is not an orphan. A door nobody opens keeps everything behind it alive.

**Why it was not simply deleted.** An ADR-pinned test required the file. Removing it meant amending ADR 0028 first, which is a decision rather than a cleanup — and ADR 0054 had already tried the deletion, hit that test, and restored the file rather than make the call in a cleanup pass.

**Resolved 2026-09-05 by ADR 0190.** The guard was protecting a filename after its subject had moved. ADR 0079 lifted the clustering rule 0028 actually cared about into `src/lib/core/graph/cluster-rule.ts`, which retired the one cost 0054 had named for keeping the engine — and nothing reopened the question for three months. 0190 deletes the engine, its barrel, its folder and its 16 tests, and repoints 0028's invariant at the RULE rather than the file. A third case asserts `lib/domain/visual` does not come back. Each of the three was mutation-checked and fails on its own case and no other.

## p3 — a test borrows one command to set up another

**Background.** The rule: one tool must not depend on another; shared logic underneath both is the legitimate exception. In production this holds — verified 2026-08-23 across all 35 command files: none imports another command, constructs another command class, or shells out to the `conducks` binary.

**What is wrong.** It does not hold in the fixtures. `tests/integration/features/kinetic.test.ts:26` defines `resolveId()`, which runs the `query` command purely to obtain a symbol id that could be written directly as `path::name`. Five `impact` and `trace` cases depend on it, so deleting `query` breaks tests for tools that do not use `query`.

**The same shape, already fixed once.** `drift`'s tests called `conducks rename --confirm` to manufacture a renamed symbol. Production coupling was zero; only the fixture broke when ADR 0156 removed the command. The fixture now edits the file directly (`tests/integration/features/helpers.ts:74`).

**The test that separates a violation from the exception:** *is the fixture command the only way to produce that state?* `analyze` appears in 118 fixtures and is legitimate — nothing else writes the vault. `bootstrap-docs` before `docs-lint` is legitimate for the same reason. `docs-lint` inside `record-command.test.ts:59` is not a fixture at all; it is the assertion, and the test's whole claim is that `record`'s output conforms to the grammar. `query` inside a `trace` test meets none of those.

**Fixed 2026-08-23.** `resolveId()` is now `idOf(file, name)` — the partial `path::name` form every command accepts. The fixture already knew which file it wrote each symbol into, so the lookup bought nothing and cost a dependency on a third tool.

What core still does not claim is on the canvas under [what this band does not show](architecture.html#scope), and in [holding](holding.html). Those are limits and unmeasured areas — not defects with an owner, which is what this page is for.

:::elsewhere
When the read band is drawn and the first defect in it survives the walk, it lands here with an id so a block can point at it declaratively. A block that is merely NEAR a defect must never link to one — that reads as an accusation and sends the reader to the wrong page.
:::

## p4 — every Rust `#[test]` is reported as dead code

**Background.** `prune` exempts a symbol invoked by convention rather than called — an entry point has no caller in the graph and is not dead (ADR 0104). The languages with an oracle behind them get this right.

**What is wrong.** Rust does not. Re-measured 2026-09-07 on this repository: `conducks prune .` returns 8 ORPHANs, and **seven of them are `#[test]` functions**, all in `plugins/checklist/src/parser.rs` — every `#[test]` in that file and nothing else. The eighth is `FilterOperator` in `src/lib/domain/analysis/filter-builder.ts`, unrelated. The 2026-08-29 reading was 10 and 9, the extra two being `#[test]` functions in a generated bindings file beside it. That file no longer exists — its wit-bindgen output was inlined into `plugins/checklist/src/lib.rs` — so those two left the report with the file, not with a fix. Its path is deliberately not written here: it would be an anchor the gate must resolve, and it cannot.

**Why it is the whole of Rust's orphan report.** A `#[test]` function is invoked by the harness, which is exactly the entry-point shape conducks already exempts elsewhere. Nothing in the Rust pack marks the attribute, so the graph sees a function nobody calls and prune answers the question it was asked, correctly, from a graph that is missing a fact.

**Why nothing caught it.** Rust is one of the nine grammars with no test subject and no oracle — `c cpp csharp go java php ruby rust swift`. They are known to PARSE and are not known to capture the right things (Band 1, `noora`). This is the first measured consequence of that gap rather than a new one, and it is what the gap looks like from the outside: a tool that is 0-false-positive on its four scored languages, and 90% false positives on one that is not.

**The root cause is one level deeper than this entry said, and it is not a Rust problem.** Measured 2026-09-05 against the vault, re-checked 2026-09-07: `plugins/checklist/src/parser.rs:177` opens a `#[cfg(test)] mod tests`, and the graph does hold a NAMESPACE node for it — and **every `#[test]` function written inside it is parented to the file's UNIT node rather than to that module**. So the containment that would identify them exists in the source and not in the graph.

**Seven was an undercount, because the same defect answers to two different category names.** Measured 2026-09-07: `plugins/checklist/src/lib.rs` holds **19** `#[test]` functions, every one of them reported by `prune`, and not one of them as an ORPHAN. They arrive as UNIMPORTED_MODULE instead — a crate root has no importer, so the file-level verdict fires first and the symbol-level one never runs. The four sampled nodes are identical in the graph either way: parented to `::unit`, zero incoming edges. **26 `#[test]` functions are misreported here, not 7**, and the split is what hid it — a reader auditing ORPHANs sees a small Rust problem, and the larger half is filed under a heading about imports.

It generalises. Across the whole vault, **not one node of any language has a NAMESPACE parent** — 9,757 parented nodes, zero. Three kinds are produced and never contain anything:

| kind | nodes | ever a parent |
|---|---|---|
| NAMESPACE | 16 | 0 |
| PACKAGE | 2 | 0 |
| INFRA | 2 | 0 |

Every other kind is used as a parent. ADR 0100 established that every declared kind has a PRODUCER; this is the next question it did not ask — a kind can have a producer and still be inert.

Two live rules already assume the containment that is missing. `cluster-rule.ts:28` counts NAMESPACE among the three kinds that end its upward walk, and `dead-code.ts:623` accepts NAMESPACE as a valid parent kind. Neither branch can fire today, and neither fails — they are simply never reached, which is why nothing has ever reported this.

**Owner.** Unassigned, and the fix is NOT the language-pack capture this entry originally proposed. A `#[test]` marker would not survive anyway: `src/contracts/test-path.ts` records that `properties.isTest` is absent from the persisted schema, so a parse-time flag reads `undefined` on every command that loads from the vault — `prune` included. The fix is containment, it spans every grammar rather than Rust, and it still should not land before there is a subject to score it against — a fix on an unmeasured grammar is the same unverified change as the defect. `todo77` owns the campaign that would give it one.

## p5 — duplicate of p1, resolved

**This entry restated p1** — same test, same tool, same conflict between the two records — and was
written while p1 already carried its resolution. It is kept rather than deleted, because a defect
recorded twice under two ids is itself worth knowing about: the second copy said `Owner. Unassigned`
for weeks after the first said `Resolved`, and a reader landing on p5 would have gone looking for
work that was already done.

**Resolved by the same change as p1 (ADR 0157).** The skipping line p5 quoted has moved — it is now
at `tests/architecture/paired-surfaces.test.ts:94` and is correct there, because it belongs to the
DRIFT check, which cannot compare a pair that does not exist. The existence question is asked by a
separate case at `tests/architecture/paired-surfaces.test.ts:115`, "every MCP tool has a CLI command,
or a granted reason not to", with `MCP_ONLY` naming each granted exception and the record that
granted it. `conducks_graph_query` is one of those entries rather than a silent omission.

## p6 — three findings about the test suite that no gate covers

**Background.** These were read off the code during the 2026-08-23 census and drawn on the canvas under a container called WHAT NOTHING ENFORCES. That container was not a feature — it was a findings list wearing a feature's shape — so it left the canvas on 2026-09-07 and the findings landed here, which is where `references/features.md` §4 says they always belonged.

**Tests borrow one tool to set up another — fixed, and listed here as the shape to watch for.** `tests/integration/features/kinetic.test.ts` ran `query` inside `resolveId()` purely to obtain an id that could have been written as `path::name`. It is `idOf(file, name)` today (`kinetic.test.ts:40`), the same fix p3 records. The borrow is invisible until someone deletes the borrowed tool — the same shape as the rename/drift coupling fixed on 2026-08-23. This entry claimed it was still live after p3 already recorded the fix.

**Not every borrow is coupling, and the difference matters.** `tests/integration/features/record-command.test.ts:59` runs `docs-lint` as the ASSERTION, not as setup: "writes a file that passes docs-lint" has no other way to be stated. `analyze` appears in 118 fixtures for the same reason — nothing else writes the vault. A rule that forbade all borrowing would delete these too.

**A guard outlived the file it named.** `src/lib/core/graph/cluster-rule.ts` holds the rule ADR 0028 cares about, moved there by ADR 0079 — which left `MirrorEngine` an empty delegation of 232 lines that `prune` could not flag, because its own barrel re-export counts as an incoming edge. ADR 0190 deleted it on 2026-09-05 and repointed 0028. **Fixed**, and kept here because the mechanism is not: a barrel re-export still hides a dead symbol from `prune`, and nothing measures how many others it hides.

**Owner.** Unassigned — for the third only. The first is fixed (above) and the second was never a defect; the third names a live blind spot in `prune` that no one has sized.

# Problems
Provenance: authored — a concern page. It makes no code claims of its own; every measurement it cites is anchored on the canvas or in docs/deep_clean.md.

A defect, its evidence, and who owns it. A block on the canvas that IS one links here.

:::elsewhere
**This page was empty for a while, and the sentence saying so outlived it.** The ADR 0150 core campaign found and FIXED its defects in the same pass — inheritance producing no edge in three languages, a linker that could never run, a monitor re-implementing git, a filter that was a no-op. Each is in `docs/deep_clean.md` with the measurement that found it and the mutation that proved the fix, and none of them is here. What IS here is the other kind: a defect whose fix is a DECISION rather than a patch, so it cannot be closed in the pass that found it. p1 was resolved that way and is kept as the record of how.
:::

## p1 — the mirror test enforces half its rule

**Background.** ADR 0148 says every MCP tool is also a CLI command, and where both exist they mirror. `tests/architecture/paired-surfaces.test.ts` is named as its enforcer.

**What is wrong.** The test checks that a pair does not DRIFT. It never checks that the pair EXISTS. `tests/architecture/paired-surfaces.test.ts:71` reads `if (!fs.existsSync(cliFile)) continue;` with the comment *"MCP-only tool: nothing to drift from"* — so a tool with no CLI twin is skipped rather than failed, and the rule's first half is unenforced.

**What it let through.** `conducks_graph_query` (`src/interfaces/tools/tools/synapse.ts:796`) runs raw SELECT against the vault and has no CLI command anywhere. That is precisely what ADR 0148's own text says must not exist — *"an agent must never be able to ask something a person cannot, because the CLI is where a person checks what the agent did."*

**The complication.** ADR 0007:21 decided to KEEP `graph_query` MCP-only, on purpose, and pre-dates 0148. ADR 0148 never cites 0007. So the two records disagree and neither is stamped against the other. This is a decision to make, not only a test to fix: either 0148 gains a stated exception with 0007's reasoning, or `graph_query` gains a CLI twin.

**Resolved 2026-08-23 by ADR 0157.** The test now asks the question it was skipping: every MCP tool must have a CLI command or a granted reason not to, with the grant naming the record that argued it. `conducks_graph_query` is granted on ADR 0007's reasoning, which 0148 never cited. A second case fails if a granted tool later gains a CLI command, so the exception cannot outlive its gap. Both cases were run against the pre-fix list and both failed.

## p2 — a domain service that is required to exist and reached by nothing

**Background.** ADR 0028 deleted DAAC and named `mirror.engine.ts` as its replacement. `tests/unit/adr-invariants.test.ts:106` asserts the file exists, so the ADR cannot silently rot.

**What is wrong.** Nothing calls it. `MirrorEngine` (232 lines) is referenced only by its own barrel re-export at `src/lib/domain/visual/index.ts:1`; the two other mentions in `src/` are historical comments. The `mirror` registry slice uses `GatewayService` in `domain/analysis` instead.

**Why no tool caught it.** `conducks prune` does not flag it, and correctly so by its own rule: the barrel export is an incoming edge, so the symbol is not an orphan. A door nobody opens keeps everything behind it alive.

**Why it is not simply deleted.** An ADR-pinned test requires the file. Removing it means superseding or amending ADR 0028 first, which is a decision rather than a cleanup.

**Owner.** Unassigned — this one needs a decision, not a patch. Deleting `MirrorEngine` means amending or superseding ADR 0028 first, because its enforcing test requires the file.

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

**What is wrong.** Rust does not. Measured 2026-08-29 on this repository: `conducks prune .` returns 10 ORPHANs, and **nine of them are `#[test]` functions** — seven in `plugins/checklist/src/parser.rs`, two in `plugins/checklist/src/bindings.rs`. That is every `#[test]` in both files and nothing else. The tenth is `FilterOperator` in `src/lib/domain/analysis/filter-builder.ts`, unrelated.

**Why it is the whole of Rust's orphan report.** A `#[test]` function is invoked by the harness, which is exactly the entry-point shape conducks already exempts elsewhere. Nothing in the Rust pack marks the attribute, so the graph sees a function nobody calls and prune answers the question it was asked, correctly, from a graph that is missing a fact.

**Why nothing caught it.** Rust is one of the nine grammars with no test subject and no oracle — `c cpp csharp go java php ruby rust swift`. They are known to PARSE and are not known to capture the right things (Band 1, `noora`). This is the first measured consequence of that gap rather than a new one, and it is what the gap looks like from the outside: a tool that is 0-false-positive on its four scored languages, and 90% false positives on one that is not.

**Owner.** Unassigned. The fix is a language-pack capture, not a special case in `dead-code.ts`, and it should not land before Rust has a subject to score it against — a fix on an unmeasured grammar is the same unverified change as the defect. `todo77` owns the campaign that would give it one.

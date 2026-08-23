# Problems
Provenance: authored — a concern page. It makes no code claims of its own; every measurement it cites is anchored on the canvas or in docs/deep_clean.md.

A defect, its evidence, and who owns it. A block on the canvas that IS one links here.

:::elsewhere
**Empty on purpose, and that is a claim about process rather than about quality.** The ADR 0150 core campaign found and FIXED its defects in the same pass — inheritance producing no edge in three languages, a linker that could never run, a monitor re-implementing git, a filter that was a no-op. Each is recorded in `docs/deep_clean.md` with the measurement that found it and the mutation that proved the fix. None is open, so none is listed here.
:::

## p1 — the mirror test enforces half its rule

**Background.** ADR 0148 says every MCP tool is also a CLI command, and where both exist they mirror. `tests/architecture/paired-surfaces.test.ts` is named as its enforcer.

**What is wrong.** The test checks that a pair does not DRIFT. It never checks that the pair EXISTS. `tests/architecture/paired-surfaces.test.ts:71` reads `if (!fs.existsSync(cliFile)) continue;` with the comment *"MCP-only tool: nothing to drift from"* — so a tool with no CLI twin is skipped rather than failed, and the rule's first half is unenforced.

**What it let through.** `conducks_graph_query` (`src/interfaces/tools/tools/synapse.ts:796`) runs raw SELECT against the vault and has no CLI command anywhere. That is precisely what ADR 0148's own text says must not exist — *"an agent must never be able to ask something a person cannot, because the CLI is where a person checks what the agent did."*

**The complication.** ADR 0007:21 decided to KEEP `graph_query` MCP-only, on purpose, and pre-dates 0148. ADR 0148 never cites 0007. So the two records disagree and neither is stamped against the other. This is a decision to make, not only a test to fix: either 0148 gains a stated exception with 0007's reasoning, or `graph_query` gains a CLI twin.

**Owner.** Unassigned. Found 2026-08-23 during the tool-surface census.

## p2 — a domain service that is required to exist and reached by nothing

**Background.** ADR 0028 deleted DAAC and named `mirror.engine.ts` as its replacement. `tests/unit/adr-invariants.test.ts:106` asserts the file exists, so the ADR cannot silently rot.

**What is wrong.** Nothing calls it. `MirrorEngine` (232 lines) is referenced only by its own barrel re-export at `src/lib/domain/visual/index.ts:1`; the two other mentions in `src/` are historical comments. The `mirror` registry slice uses `GatewayService` in `domain/analysis` instead.

**Why no tool caught it.** `conducks prune` does not flag it, and correctly so by its own rule: the barrel export is an incoming edge, so the symbol is not an orphan. A door nobody opens keeps everything behind it alive.

**Why it is not simply deleted.** An ADR-pinned test requires the file. Removing it means superseding or amending ADR 0028 first, which is a decision rather than a cleanup.

**Owner.** Unassigned. Found 2026-08-23.

## p3 — a test borrows one command to set up another

**Background.** The rule: one tool must not depend on another; shared logic underneath both is the legitimate exception. In production this holds — verified 2026-08-23 across all 35 command files: none imports another command, constructs another command class, or shells out to the `conducks` binary.

**What is wrong.** It does not hold in the fixtures. `tests/integration/features/kinetic.test.ts:26` defines `resolveId()`, which runs the `query` command purely to obtain a symbol id that could be written directly as `path::name`. Five `impact` and `trace` cases depend on it, so deleting `query` breaks tests for tools that do not use `query`.

**The same shape, already fixed once.** `drift`'s tests called `conducks rename --confirm` to manufacture a renamed symbol. Production coupling was zero; only the fixture broke when ADR 0156 removed the command. The fixture now edits the file directly (`tests/integration/features/helpers.ts:74`).

**The test that separates a violation from the exception:** *is the fixture command the only way to produce that state?* `analyze` appears in 118 fixtures and is legitimate — nothing else writes the vault. `bootstrap-docs` before `docs-lint` is legitimate for the same reason. `docs-lint` inside `record-command.test.ts:59` is not a fixture at all; it is the assertion, and the test's whole claim is that `record`'s output conforms to the grammar. `query` inside a `trace` test meets none of those.

**Owner.** Unassigned. Found 2026-08-23.

What core still does not claim is on the canvas under [what this band does not show](architecture.html#scope), and in [holding](holding.html). Those are limits and unmeasured areas — not defects with an owner, which is what this page is for.

:::elsewhere
When the read band is drawn and the first defect in it survives the walk, it lands here with an id so a block can point at it declaratively. A block that is merely NEAR a defect must never link to one — that reads as an accusation and sends the reader to the wrong page.
:::

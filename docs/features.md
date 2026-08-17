# Features — conducks

## Full Structural Pulse — `conducks analyze [path]`
- Purpose: Build the whole symbol graph for a codebase in one pass, so every other command answers from a stored graph instead of re-reading the source.
- Intent: Repos this large make single-threaded, incremental-only parsing impractical — the pulse trades a one-time scan cost for near-instant queries afterward.

## Structural Taxonomy (System 1 — containment) — built by `conducks analyze`
- Purpose: Model code as a containment tree whose deepest routinely-emitted node is the function (BEHAVIOR), so a query lands on a unit an engineer actually reasons about.
- Intent: Keeps the graph at architectural altitude. Emitting every local variable floods the graph (~72% ATOM on a real repo) and buries the signal; edge-gating keeps only the atoms that are load-bearing. (ADR 0012/0013 — cut DATA, edge-gate ATOM.)
- Shape: Ten rungs, 0-9 — ecosystem, repository, package, namespace, directory, unit, infra, structure, behavior, atom. Every one has a producer, and a sub-line position is a line number on the edge rather than a node kind. (ADR 0099/0100 — cut STATEMENT and BRANCH, repair NAMESPACE.)

## Boundary / Supply-Chain Classification (System 2 — data flow) — built by `conducks analyze`, read via `conducks supply-chain`
- Purpose: Give every reference that leaves the repo an origin — internal, stdlib, or third-party dependency — so "what does this project actually depend on" is a graph query, not a manifest read.
- Intent: "Edge classification, not node count, tells architecture health." A dependency only matters once you know it is third-party and versioned; without origin, the supply-chain surface is invisible. (ADR 0014.)

## Structural Health Status — `conducks status`
- Purpose: Answer "is the graph I am about to query sound, and where is the weight in this codebase" in one screen — node/edge counts, density, staleness, top hotspots by structural gravity.
- Intent: Cuts the number of round-trips an agent needs before it can start reasoning about a codebase. `conducks_status` with `mode: "map"` adds the detected entry points for first-contact orientation.

## Staleness Detection — reported by `conducks status`, and on every MCP result
- Purpose: Tell the reader the persisted graph no longer matches the current git state, before they act on it.
- Intent: Silent staleness is worse than an explicit warning — an agent reasoning over a drifted graph gives confidently wrong answers, so every tool result carries the flag rather than expecting the caller to ask.

## Live Watch Mode — `conducks watch`
- Purpose: Keep the graph in sync while a developer is actively editing, re-inducting only the file that changed.
- Intent: Full pulses are too slow to run on every save, and a graph that is only correct right after a manual `analyze` is a graph nobody trusts.

## Hash-Gated Saves — automatic, inside `conducks watch`
- Purpose: Dismiss a file event whose content is byte-identical to what the graph already holds, before any parsing happens.
- Intent: An autosave, a formatter run on focus loss and a `git checkout` all fire change events carrying nothing new, and the full incremental job costs the same for those as for a real edit — 236ms against 0.7ms to ask. The gate may cost time and never correctness, so every unknown falls through to doing the work.

## Cross-Project Monitor — `conducks monitor`
- Purpose: One report over every project that has run `conducks setup`: whether its graph is behind its code (which files, and which modules), whether its docs break the grammar, and which architecture notes describe code that has changed since they were last reviewed.
- Intent: Conducks is a platform, and each project was an island — nothing knew which projects existed, so nothing could answer "which of my repos has fallen behind". It reports and exits 0 by decision: a monitor that analyzes, edits or fails a build gets switched off, and then it reports nothing at all.

## Module Doc Review — `conducks monitor --dismiss`, surfaced by `conducks docs-status`
- Purpose: Flag an architecture note whose module changed, and let the flag be cleared either as "checked, still accurate" or with the address of the ADR, todo or note where an enhancement's intent landed.
- Intent: A bug fix should not demand a doc edit, but a change that adds a capability and records nothing has thrown away the reason it was made. The dismissal is bound to the hash of the code it was checked against, so it expires when the module changes again — an escape hatch, not a mute button.

## Docs Board — `conducks docs-status`, MCP `conducks_docs`
- Purpose: Show the open threads in the authored docs — each decision that still owes work, the todo phases building it, the next task in each, and what is blocked by what — without opening every file.
- Intent: Finding what an accepted decision left unbuilt otherwise means reading every record bottom-up. It is a summary and a set of links, never a copy of the docs: every line is an address (`todo09#P2`) or a state, so it cannot drift into a second version of them.

## Docs Grammar Gate — `conducks docs-lint`, live via `conducks watch`
- Purpose: Fail a doc that breaks the standard — a wrapped value, a duplicate phase number, a link pointing at a record that does not exist, a supersede that abandons unbuilt work — and report hygiene separately without failing.
- Intent: A standard nothing enforces is advice. Hygiene is split from grammar because a gate that fails on housekeeping gets switched off.

## Visual Anchor Gate — `conducks visuals-lint`
- Purpose: Check every anchor a diagram makes against the working tree — the file resolves to exactly one place, the line exists, the symbol is still defined, and a constant written in the page is still the value the code assigns. An ambiguous abbreviation fails instead of resolving to a guess.
- Intent: A picture is a claim about code at a moment, and it decays silently — the more precise it looks, the more it is trusted. The filesystem is the source of truth and not the vault, because a graph keyed to the last pulse would let a lying page report clean, and a false green is worse than no gate (ADR 0138, ADR 0035).

## Mirror Live Sync — `conducks mirror` (with `conducks watch` running)
- Purpose: Push graph changes to connected dashboard clients as they land, so the picture on screen matches the code on disk.
- Intent: A dashboard that needs a manual refresh loses the value of watch mode — the two are meant to be used together.

## Symbol Query — `conducks query <pattern>`
- Purpose: Turn a half-remembered name into a canonical, addressable symbol ID that every other command accepts.
- Intent: Agents need a precise handle on "this exact symbol," not a text match — grep cannot disambiguate an overloaded or shadowed name, and every downstream command needs the ID, not the string.

## Symbol Listing — `conducks query "*"`
- Purpose: Full inventory of indexed symbols ordered by structural gravity, for reading a codebase top-down instead of searching for something you already know the name of.
- Intent: Supports triage — a human or agent who wants "show me the heaviest things here" rather than "find X".

## Workspace Listing — `conducks list`
- Purpose: Show the anchored workspace and any federated projects linked into it.
- Intent: The anchor is implicit in every other command and invisible until something answers from the wrong project. One command that states which vault is being read turns that from a debugging session into a glance.

## Entry Point Detection — `conducks entry`
- Purpose: Show where execution actually begins — routes, CLI handlers, mains — ranked by gravity, across frameworks.
- Intent: Orients a reader who has never seen the repo toward real starting points instead of making them guess from file names.

## Guarded Query Language — `conducks query --mode template --template <id>`, MCP `conducks_query` / `conducks_graph_query`
- Purpose: Offer named, parameterised query templates for the questions people actually ask, so the common analyses are one call instead of hand-written SQL.
- Intent: Templates keep `pulseId` system-controlled and turn expensive graph traversals into indexed SQL scans. The escape hatch (`conducks_graph_query`) accepts a raw statement but refuses anything that is not a `SELECT`, so exploration never becomes a write path.

## Path Tracing — MCP `conducks_trace` with `mode: "path"` and a `target`
- Purpose: Find the shortest functional bridge between two named symbols, weighting each hop by how strong the structural relationship is.
- Intent: "How does A reach B" is a common but tedious question to answer by walking a call graph by hand; risk-weighting favours the path that matters over the merely shortest one.

## Impact / Blast Radius Analysis — `conducks impact <symbol> [upstream|downstream]`
- Purpose: Answer "what breaks if I touch this" before the edit, with a risk band and the affected symbols ordered by structural distance.
- Intent: Lets a reader judge the cost of a change without already knowing the codebase. Depth is a cumulative edge-weight budget, not a hop count, so a chain of cheap inheritance edges reaches further than a chain of imports.

## Symbol Neighbourhood — `conducks context <symbol> [--radius <n>] [--include-atoms] [--limit <n>]`, MCP `conducks_context`
- Purpose: The scored neighbourhood around a symbol — what is near it, ranked by `confidence x 1/(depth+1) x 1/(canonicalRank+1)`, with the callers named first and the declaration line under each row. Containers and ATOMs are excluded by default because a folder outranking every function in it buries the answer (ADR 0103).
- Intent: ONE implementation behind both surfaces (todo57). These were two different features under one name until 2026-08-13 — a flow trace against a scored BFS, sharing 44 names out of 2,407 against 83 on the same symbol. The tool spends a token budget on the answer and the CLI spends a line count; that difference is rendering, the answer is not.

## Execution & Data Flow Tracing — `conducks trace <symbol> --flow`, `conducks flows`
- Purpose: Group symbols into named execution units and follow where a value comes from and where it ends up.
- Intent: Reconstructing a pipeline by reading call sites one at a time does not scale; this answers "where does this data come from" as a single question.

## Composite Risk Explanation — `conducks explain <symbol>`
- Purpose: Break a symbol's risk into named, weighted signals — gravity, complexity, authorship entropy, churn, fan-out, fallback — so the number can be argued with.
- Intent: A single risk score is not actionable. Showing which signal dominates tells a reviewer what to fix; the weights are published (see Tunables) so nobody has to reverse-engineer them from a score.

## Authorship Entropy — `conducks entropy <symbol>`
- Purpose: Measure how concentrated a file's authorship is, as a Shannon entropy over git author distribution.
- Intent: Single-author code is a bus-factor risk that no structural metric can see; entropy makes it comparable across a repo without reading blame by hand.

## Structural Cohesion — `conducks cohesion <symbolA> <symbolB>`
- Purpose: Score how alike two symbols' structural neighbourhoods are, as a starting point for consolidation.
- Intent: Answers "do these two things do the same shape of work" from topology rather than from naming conventions, which lie.

## Structural Integrity Audit — `conducks audit [--history=<window>]`
- Purpose: Run a fixed set of architectural sanity checks — import cycles, hub overload, orphan exports — plus the project's own declared rules, and report violations.
- Intent: Encodes house rules as enforceable checks instead of tribal knowledge that erodes as a team changes. `--history` reads several past pulses so the answer can be "trending better or worse", not only "bad today".

## Structural Advisory — `conducks advise`
- Purpose: Turn metrics into concrete suggestions — split candidates, hidden coupling, unpinned or heavy dependencies, stability risks.
- Intent: A risk score alone does not tell you what to do next; the advisor names an action per finding.

## Co-Change / Architectural Lies Detection — `conducks advise`
- Purpose: Find files that keep changing together in git history despite having no structural edge between them.
- Intent: Surfaces coupling the code graph is blind to — two files can be tightly coupled in practice while looking independent on paper.

## Policy Verification — `conducks audit`
- Purpose: Check the graph against the project's declared structural laws (`config/sentinel.json`) and give a yes/no answer.
- Intent: A convention nobody can check is a convention that decays; declaring rules as data means a reviewer never re-verifies them by hand.

## CI Regression Guard — `conducks guard [--threshold=N]`
- Purpose: Compare structural entropy against a historical baseline and exit non-zero when the codebase has decayed past a threshold the team picks.
- Intent: Catches architectural regressions, not just failing tests, before they merge — the threshold is the team's tolerance made explicit.

## Layer Contract Enforcement — `conducks guard`
- Purpose: Hard-block any dependency edge that runs upward across the architecture's layers — contracts → core → domain → composition → interfaces — on every run, catching imports and calls alike, type-only imports included.
- Intent: A layer contract nobody enforces is a diagram, not a rule. Enforced since 2026-07-25, after routing 74 pre-existing illegal edges through composition to reach a clean baseline (ADR 0005).

## Graph-Verified Rename — `conducks rename <symbol> <newName>`
- Purpose: Rename a symbol across every proven caller in one operation, showing the plan before it writes.
- Intent: Text-based renames miss references and over-match unrelated ones; verifying against the call graph first means the edit set is the one the graph can defend.

## Dead Code Detection — `conducks prune`
- Purpose: Flag exported symbols that no proven edge reaches, as review candidates — excluding entry points and test fixtures. Exported VALUES are covered in one direction only, and deliberately: an exported constant nobody imports IS reported, because the graph now keeps its node, but a value IMPORT is never reported stale, because a bare read produces no edge and its use is invisible (todo63; reporting them was wrong more often than right — subject-c 20 → 10 findings).
- Intent: "Nothing calls this" is normally a guess; this makes it a checkable claim you can start from. It reports candidates for a human to confirm, never a delete list. It under-reports on purpose — a missed dead symbol costs a review pass, a wrong one costs a user their build, and `prune` is scored on both directions at once (`tests/integration/features/prune-precision.test.ts`) rather than on how much it finds.

## Supply-Chain Surface — `conducks supply-chain`
- Purpose: Report the dependency surface — stdlib vs third-party edges, packages ranked by how many files import them, versions joined live from the manifest, and packages imported but never declared.
- Intent: Turns the dependency graph into an actionable view of which packages are load-bearing and which are undeclared, without a separate SCA tool.

## Workspace Ledger — `conducks ledger`
- Purpose: A workspace survey with one letter grade — size, density, kind distribution, third-party surface, orphan dead weight — with each score deduction shown.
- Intent: A "state of the codebase" glance in one command, assembled from the pulse that already ran, with the arithmetic visible so the grade is arguable.

## Structural Diff — `conducks diff [--base <pulseId>] [--head <pulseId>]`
- Purpose: Compare two points in history structurally — symbols added, removed, modified, plus deltas in complexity and gravity. With no arguments it scores the risk of the current working changes.
- Intent: Reviewing a change by its lines misses shape changes; this reports what the change did to the structure.

## Longitudinal Drift Analysis — `conducks drift [prevPulseId] [--json]`
- Purpose: Track structural velocity and decay across many recorded pulses.
- Intent: A single snapshot cannot show direction — this answers "is the architecture getting healthier or worse over time".

## Directory-Aware Grouping — `conducks flows`
- Purpose: Group symbols into named behavioural processes so a reader sees "what this system does" as a handful of flows instead of thousands of functions.
- Intent: Neither the call graph nor the folder tree alone names a module's real boundary; a flow named after its entry point is the smallest unit a human recognises.

## Live Mirror Dashboard — `conducks mirror`
- Purpose: Interactive, force-directed view of the whole graph with zoom-aware labelling and click-to-focus paths.
- Intent: Some structural questions ("what is connected to what, at what scale") are faster to see than to query.

## Integrity Blueprint — `conducks status --blueprint`
- Purpose: One-screen integrity readout before committing — cycle count, orphan count, resonance, and the first violations.
- Intent: A pass/fail glance without opening the dashboard (ADR 0011).

## Test Coverage Overlay — `conducks coverage <coverage-final.json>`, `conducks coverage-view`
- Purpose: Bind an existing istanbul/c8 coverage report onto function spans in the graph, so coverage is reported per function and can be compared against a saved baseline. Conducks consumes a coverage report; it does not run tests or measure coverage itself.
- Intent: A percentage over a file says nothing about which capability is tested. Per-function fill, joined to the graph, turns coverage into "which behaviour is unverified" — and the baseline diff turns it into "which behaviour just lost its test". (ADR 0004.)

## Cross-Project Resonance — `conducks resonance <path>`
- Purpose: Score how structurally similar two codebases are from their topological signatures.
- Intent: Lets a team ask "is this new project shaped like the ones we already run" without a line-by-line comparison.

## Federated Repo Linking — `conducks link <path>`
- Purpose: Merge another repository's graph into the current one and resolve the edges that cross between them.
- Intent: Multi-repo systems have real structural connections a single-repo pulse cannot see; linking makes those connections queryable from one side.

## Authored Record Capture — `conducks record --type <type> "content"`
- Purpose: Append an authored note — a decision, a gotcha, an intent — into the matching `docs/<type>.md` in the conducks-docs grammar, from the terminal, at the moment it is decided.
- Intent: A fact that lives only in a conversation does not exist. Capturing it in one command removes the excuse for writing it "later", and the entry is written in the same grammar `docs-lint` checks.

## Docs Bootstrap — `conducks bootstrap-docs`
- Purpose: Scaffold the conducks-docs file set into `docs/`, leaving any file that already exists untouched.
- Intent: Removes the blank-page problem for a project adopting the standard, while never clobbering docs someone already wrote.

## Docs Progress Board — `conducks docs-status`, `conducks docs-lint`
- Purpose: Read the authored docs as data — todo phases and percentages, ADR states, feature/convention/memory counts — and fail a CI gate when a governed file breaks the grammar.
- Intent: Docs only stay trustworthy if something checks them; making the board queryable means "what work is in flight" needs no doc-by-doc read.

## First-Run Setup — `conducks setup`
- Purpose: Get a repo ready for conducks in one command — install the usage skills, register the MCP server, and write a starting exclusion file.
- Intent: Onboarding as a single command rather than a checklist of prerequisites nobody finishes.

## MCP Host Configuration — `conducks setup`, `conducks uninstall`
- Purpose: Write and remove the conducks entry in an MCP host's config, and the skills it installed, without hand-editing JSON.
- Intent: Setup and teardown are symmetric on purpose — an uninstall that leaves orphaned skills or a dead server entry behind is how a tool wears out its welcome. (ADR 0009.)

## MCP Server — `conducks mcp`
- Purpose: Expose the query and analysis surface to MCP-compatible agent hosts as typed tools.
- Intent: Lets a coding agent use conducks as a tool rather than as a human-operated CLI, with every tool annotated read-only so a host can reason about safety before calling. (ADR 0007.)

## Mutual Call Tangles (ARCH-6) — reported by `conducks audit`
- Purpose: Name the groups of symbols that call each other in a loop — `a → b → a` — separately from module import cycles, including tangles that live inside a single file.
- Intent: ADR 0017 removed these from ARCH-3 because a module cycle and two functions calling each other are different facts, which left them reported nowhere. They are a DISCOVERY and never fail an audit: mutual recursion is legal, a knot of six symbols with no entry order is worth a look, and only a human can tell those apart.

## Environment & Vault Check — `conducks doctor`
- Purpose: Verify the machine can actually run conducks — Node version, the DuckDB binding, WHICH parse path is live and how many grammars induced — and report whether a vault exists, how old its last pulse is, and whether a newer release exists.
- Intent: Most "conducks is broken" reports are environment, not logic. One command that names the failing prerequisite is cheaper than reading a stack trace. Since the native binding is optional and is the ONLY parse path, whether it loaded decides whether `analyze` can run at all — so doctor reports that as a failure, not a warning.

## Installing Without a Toolchain — `npm i -g conducks`, reported by `conducks doctor`
- Purpose: Install and run the CLI on a machine with no C++ toolchain. The vault binding is NAPI and always prebuilt (ADR 0149); the native `tree-sitter` binding compiles from source and is optional, so its absence never crashes the process at load — every use goes through one lazy loader.
- Intent: `npm i -g conducks` must not need a compiler. What absence costs is stated rather than hidden: without the binding there is NO parse path — ADR 0089 deleted the regex fallback — so `analyze` refuses with a named error and `doctor` reports `Parse path: NONE`. This entry used to promise degraded analysis; that capability no longer exists, and the promise outlived it by nine days until an alpine/musl install was measured.

## Deferred Graph Load — every read path
- Purpose: The structural graph materialises when something walks it, not when a process starts. A docs-only MCP session holds 92 MB instead of 435 MB; `conducks_status` holds 104 MB.
- Intent: The MCP stdio transport spawns one server per client SESSION, so the cost multiplies by however many sessions are open — three was 1.3 GB. Anything that walks the graph calls `ensureGraphLoaded()`; anything answering from SQL or files does not. Forgetting is loud on purpose, because a deferred graph reads as an EMPTY one. See ADR 0038.

## Update Notice — reported by `conducks doctor`
- Purpose: Compare the installed version against the latest GitHub release and hand back the upgrade command that matches how this copy was installed.
- Intent: It TELLS and never upgrades — a tool that rewrites its own install unprompted is a supply-chain surprise. It is also the only outbound network call in conducks, so it is cached for 24h in `~/.conducks/`, times out in 2s, swallows every failure, and can be switched off with `CONDUCKS_NO_UPDATE_CHECK=1`.

## Vault Compaction — runs inside `conducks analyze`
- Purpose: Rewrite the vault into a fresh database and swap it in, reclaiming the space DuckDB never returns. This repo's vault went 235.3 MB to 12.8 MB on the first pulse after it landed.
- Intent: It is a PULSE STEP and deliberately not a `conducks compact` command — a vault that only shrinks when someone remembers is a vault that grows, and the people worst affected never read the docs. A cheap `bloatRatio()` check (11 ms) gates the rewrite, so a healthy vault pays almost nothing, and the rewrite keeps its output only if it came out smaller. See ADR 0037.

## Vault Clean / Reset — `conducks clean`
- Purpose: Drop the vault and clear stuck process locks so a fresh pulse can run. Scoped to THIS project: a conducks process is evicted only when its working directory is under this project root, and one whose directory cannot be read is left alone.
- Intent: Schema changes and lock contention need a clean-slate escape hatch rather than manual file surgery in `.conducks/`. The scoping is a correction, not a nicety — it matched processes by entry point, which every conducks install shares, so `clean` in one repository killed a `watch` or an in-flight `analyze` in another (todo65). A command that kills must treat "I cannot tell whose this is" as "not mine".

## CLI Help System — `conducks help`
- Purpose: Present the commands grouped by what you are trying to do — discovery, landscape, behavioural, metrics, governance, historical, mutational, visual, system — with a worked example per group.
- Intent: A flat command list communicates nothing about intent; grouping by question type is how a new user finds the right command on the first try.

## Project Metadata Extraction — built by `conducks analyze`
- Purpose: Read manifest files (`package.json`, `requirements.txt`) as graph input, so declared dependencies and their versions are nodes like anything else.
- Intent: Without the manifest in the graph, the supply-chain view could not tell a declared dependency from an undeclared one, or attach a version to either.

## Structural Exclusions — `.conducksignore`, generated by `conducks setup`
- Purpose: Keep build output, vendored code, and dependency trees out of analysis by default, with a per-project override file.
- Intent: Without exclusions, generated and vendored code dominates every hotspot and risk ranking and drowns out the project's own code.

## File-Position Routes (Next.js app router) — built by `conducks analyze`
- Purpose: Recognise a route that no call expression declares — `app/api/plans/[id]/route.ts` exporting `GET` — so the served side of an endpoint is in the graph on the most common React stack.
- Intent: Every other route pattern matches the EXPRESS shape, a call naming its own path, and Next.js declares a route by where the file SITS. Measured on a real subject: 118 route files, ZERO route nodes — conducks could see who CALLED an endpoint and not who SERVED it, exactly where the cross-service pair is most used. A `[id]` segment becomes `:id` so a Next.js route is comparable with every other route in the graph, and a `(group)` directory is removed entirely because it contributes nothing to the URL — leaving it in produces a path that never matches a real request, which is worse than no route because it looks resolved.

## Declared-Type Member Resolution — built by `conducks analyze`
- Purpose: Bind `registry.get(...)` to `ServiceRegistry.get` when the variable was declared `new ServiceRegistry()`, so a call on an instance reaches the method it actually runs.
- Intent: The receiver was already resolved and the member was already a node; only the link between them was missing, and two variables accounted for 500 dangling edges on a real subject. A factory is resolved too, by reading the DECLARED return type of the method it calls, and the chain follows a re-export to the declaration and `extends` to the class that really declares the member. Nothing is inferred: a type that is written down is read, and a type that is not — an undeclared return, or a constructed one like `Promise<Foo>` — is refused. (ADR 0082, ADR 0084.)

## Declared Signatures — built by `conducks analyze`, reported by `conducks query`
- Purpose: Record what a function says it takes and returns, so `query` can answer with it and resolution can use it.
- Intent: The field existed and was the literal `void` for every function in every language — 4,267 nodes on a real subject asserting a type nobody had measured. An undeclared return is now `null` rather than `void`, because an absent annotation is not a claim that the function returns nothing, and collapsing the two is what made a readable type look unknowable. Parameters were the same fabrication — a literal empty list on every function, while the architecture doc pointed at that very field as where parameters live, so it read as "takes nothing" instead of "nobody looked". Both are measured now: names, declared types, optionality, rest markers and destructured patterns, for functions, methods and arrow functions. ELEVEN more languages followed, and they broke the first design: the name was looked up through a field chain, and the grammars disagreed in both directions at once — Python's typed parameter has no name field (so the type came with the name), Ruby's splat HAS one (so the `*` was dropped). The annotation is now CARVED OUT of the parameter's own text by byte offset, so whatever a grammar calls the identifier, what is left is the name — markers and all. Swift needed a second capture form, because its grammar has no parameter-list node at all. Generators were invisible entirely — a starred function produced no node, so nothing calling it could resolve. (ADR 0084, ADR 0086, ADR 0087, ADR 0088.)

## Regex Parsing Fallback — used by `conducks analyze`
- Purpose: Keep structural extraction producing CALLS and IMPORTS edges when a Tree-sitter grammar cannot load in a given environment.
- Intent: Precision is worth trading for a graph that still has edges — an environment-specific grammar failure should cost accuracy, not the whole language.

## Language Extraction — built by `conducks analyze`

- Purpose: Thirteen language front-ends (C, C++, C#, Go, Java, JavaScript, PHP, Python, Ruby, Rust, Swift, TypeScript, TSX), each capturing the constructs that carry that language's structure rather than a shared lowest common denominator — Go goroutines and channels as spawner-to-spawned edges, Rust lifetimes and trait impls as IMPLEMENTS and CONSTRAINS, Swift property wrappers and protocol conformance, PHP namespace aliases and `insteadof` trait conflicts, Ruby metaprogramming and Rails DSL (`attr_accessor`, `define_method`, `belongs_to`), C# LINQ and delegates.
- Intent: A graph that only understands functions and imports says the same thing about every codebase. What a Rails app IS lives in its DSL, and what a Go service IS lives in its concurrency, so a per-language capture is the difference between a call graph and a description.

## Performance Measurement — `npm run benchmark`

- Purpose: `tools/measure-pulse.mjs` spawns a real `conducks analyze` and reports wall time, cores
  used, peak RSS and the resulting graph size, over N runs from a cold vault. Peak memory comes from
  the KERNEL (`/usr/bin/time -l` on macOS, `-v` on GNU), never from sampling. It warns when wall
  time varies more than 15% across runs, and it fails loudly rather than printing a number it could
  not parse.
- Intent: three earlier attempts at this were each wrong in a way that looked like data. One
  sampled the wrong process and printed `peak_cpu=0%` every run. Its replacement sampled
  `ps -o %cpu` and reported "204% CPU" for a workload the kernel measures at 1.0 cores — sampling
  can both miss a peak and invent one. And `npm run benchmark` itself was broken for months under
  `node --loader ts-node/esm`, measuring in-process where it could never see process start, grammar
  loading, or peak memory. An instrument that reports confidently while measuring nothing is the
  failure this replaces.

## Diagnostics — env-gated, off by default

- Purpose: `CONDUCKS_MEM_TRACE=1 conducks analyze` prints RSS, heap, external and native memory at
  each stage of a pulse. `CONDUCKS_SQL_LOG=<file> conducks analyze` appends every write statement as
  one JSONL row, and `tools/replay-sql-log.mjs <log> <vault.db> [--shrink]` replays that log against
  a copy of the vault and delta-shrinks it to a minimal failing set.
- Intent: both exist because reasoning about this pulse repeatedly produced confident wrong answers.
  Five explanations of where its memory goes were written down before anything measured them and all
  five were wrong; four hand-built fixtures failed to reproduce a vault crash that the captured
  statement log reproduced on the first attempt. They are instruments for questions where reading
  the code is not enough — memory that is native rather than JavaScript, and storage behaviour that
  depends on surrounding churn. Off unless asked for, because a pulse should not pay for a
  diagnostic.

## Tunables

| knob | default | file:line | effect |
|---|---|---|---|
| symbol search limit | 10 | src/lib/domain/intelligence/index.ts:23 | how many symbols a fuzzy search returns |
| `conducks query --limit` | 10 | src/interfaces/cli/commands/query.ts:22 | CLI override of the search limit |
| `conducks_query` limit | 10 (1–500) | src/interfaces/tools/tools/synapse.ts:82 | MCP-side cap on returned symbols |
| `conducks_graph_query` statement guard | `SELECT` only | src/interfaces/tools/tools/synapse.ts:566 | any non-SELECT statement is rejected as `FORBIDDEN_QUERY` |
| `conducks_context` radius | 2 (1–10) | src/interfaces/tools/tools/synapse.ts:404 | BFS hops walked around the anchor symbol |
| `conducks_context` max_tokens | 8000 (accepts 100–100000) | src/interfaces/tools/tools/synapse.ts:434 (bounds :405) | token budget at which the context payload is truncated |
| `conducks_flows` min_members | 2 | src/interfaces/tools/tools/synapse.ts:608 | flows with fewer members are dropped as noise |
| `conducks_flows` limit | 20 (1–100) | src/interfaces/tools/tools/synapse.ts:609 | max flows returned |
| `conducks flows` noise floor | 2 members | src/interfaces/cli/commands/flows.ts:21 | CLI hides smaller flows; prints the first 5 members of each (:23) |
| `conducks_prune` limit | 50 (1–200) | src/interfaces/tools/tools/synapse.ts:678 | max dead-code findings returned |
| guard threshold | 0.1 | src/interfaces/cli/commands/guard.ts:18 | max tolerated entropy decay before `conducks guard` exits non-zero |
| `conducks_audit` guard threshold | 0.1 | src/interfaces/tools/tools/synapse.ts:238 | same gate, MCP side |
| `conducks_audit` archeology window | 5 (1–10) | src/interfaces/tools/tools/synapse.ts:240 | how many historical pulses the longitudinal mode reads |
| impact depth | 5 (1–10) | src/interfaces/tools/tools/kinetic.ts:68 | cumulative Dijkstra edge weight walked — not a hop count |
| impact weight budget (domain) | 5 | src/lib/domain/kinetic/impact.ts:17 | same budget where the traversal runs |
| impact Dijkstra edge weights | EXTENDS 0.5 · IMPLEMENTS 0.7 · CALLS 1.0 · CONSTRUCTS 1.2 · MEMBER_OF 1.5 · IMPORTS 2.0 · DEPENDS_ON 2.5 | src/lib/domain/kinetic/impact.ts:18-26 | lower weight = closer, so inheritance reaches further into the blast radius than an import at the same depth |
| impact risk bands | LOW <2 · MEDIUM <5 · HIGH <15 | src/lib/domain/kinetic/impact.ts:59-61 | how the summed inverse-distance score becomes a word |
| trace depth | 10 | src/lib/domain/kinetic/trace.ts:141 (traversal cap :79) | how far an execution trace walks |
| `conducks_impact` / `conducks_trace` page size | 10 | src/interfaces/tools/tools/kinetic.ts:83 / :150 | results are cut to 10 and flagged `truncated` (:93 / :153) |
| `conducks_diff` page size | 10 | src/interfaces/tools/tools/kinetic.ts:194 | deltas cut to 10 and flagged `truncated` (:208) |
| `conducks impact` print cap | 10 flat / 20 tree | src/interfaces/cli/commands/impact.ts:93 / :90 | how many affected symbols the CLI prints |
| composite risk weights | gravity .25 · complexity .35 · entropy .10 · churn .10 · fan-out .15 · fallback .05 | src/lib/domain/analysis/conducks-core.ts:228 | how `conducks explain` weighs each signal |
| composite risk weights (fallback symbol) | gravity .15 · complexity .30 · entropy .10 · churn .10 · fan-out .10 · fallback .25 | src/lib/domain/analysis/conducks-core.ts:227 | re-weighting applied once a symbol is recognised as fallback |
| hub-overload `max_fans` | 50 | config/sentinel.json:19 | a `src/registry` symbol with more fans than this is a Sentinel violation |
| incomplete-pulse warning | density < 0.5 with > 50 nodes | src/interfaces/cli/commands/status.ts:66 | when `conducks status` calls the persisted graph a partial pulse |
| mirror port | 3333 | src/interfaces/cli/commands/mirror.ts:28 | where the dashboard is served |

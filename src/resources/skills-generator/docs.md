<!-- description: Documentation standards for all services. Required files, writing rules, and how to keep docs current without bloat. -->

# Docs Guidance

> Every service is self-documenting. A new agent must be able to onboard from docs alone — no verbal handoff, no tribal knowledge.

---

## Required files

### Core (always exist — bootstrap these on session 1 if missing)

These five files are the minimum for any project. A cold agent reads them in this order at the start of every session.

| File | Purpose | Written when |
|---|---|---|
| `todo.md` | Active tasks with phases and acceptance criteria | Plan phase — before touching any file |
| `architecture.md` | Module map, file tree, dependency directions, forbidden imports | Whenever structure or contracts change |
| `conventions.md` | Non-negotiable rules for this service — ID, statement, reason | Agent detects and appends; user defines |
| `features.md` | What the system currently does — source of truth for capabilities | Immediately upon any capability change |
| `memory.md` | Critical gotchas and constraints that cannot be inferred from code | Written throughout the session, read first |

### On-Demand (create only when user explicitly asks)

| File | Purpose |
|---|---|
| `handover.md` | Full session state for the next agent — only needed for mid-task interruptions or multi-session tasks. Redundant in a 1-task-per-session model. |
| `implementation.md` | Running log of what was built — historical record, useful for PR descriptions |

### Conditional (create only when the project scope warrants it)

| File | When to create |
|---|---|
| `styling.md` | Any project with UI — defines design tokens and interaction rules |
| `business_plan.md` | If the project has a business model to record — append-only |
| `product_plan.md` | If there is a product roadmap that needs tracking — append-only |
| `creative_brief.md` | If the project involves branding or external design work |

### Archive directories

| Directory | Purpose |
|---|---|
| `completed/` | Completed todo files — move `todo.md` here as `todo{N}.md` when a phase closes |
| `legacy/` | Pre-migration docs that don't fit the standard but must not be lost |

---

### Multi-Service Structure

For multi-service projects, each service has its own `docs/` directory with its own core files. Shared concepts belong in the root `docs/`.

```
service1/
├── docs/
│   ├── todo.md
│   ├── architecture.md
│   ├── conventions.md
│   ├── features.md
│   └── memory.md
service2/
├── docs/
│   └── ...
```

---

## Rules

**DOCS-1 — Bootstrap on Session Start** `[severity: high]`
At the start of every session, verify that the five core files exist. If any are missing, create them from templates before doing anything else. Do not create on-demand or conditional files unless explicitly requested.

**DOCS-2 — Business and Product Plans are Append-Only** `[severity: high]`
Never edit or delete existing entries in `business_plan.md` or `product_plan.md`. The history of business and product intent is permanent. New entries are always appended at the bottom with a date and explicit user confirmation.

**DOCS-3 — Architecture Stays Current** `[severity: high]`
`architecture.md` must reflect the real state of the codebase at all times. Every file in the project must appear in the file tree. Every module's dependencies must be listed. Update it during execute phase — not after.

**DOCS-4 — Implementation Log is On-Demand** `[severity: high]`
Do not append to `implementation.md` unless the user asks. When they do, cover only what happened since the previous entry. Never edit previous entries.

**DOCS-5 — Handover is On-Demand** `[severity: high]`
Do not write `handover.md` unless the user asks. When they do, overwrite the entire file. Be specific, honest, and complete. In a 1-task-per-session model, `todo.md` and `memory.md` together replace handover — only write it for genuine multi-session or interrupted work.

**DOCS-6 — Conventions Grow Over Time** `[severity: medium]`
`conventions.md` is never finished. The agent appends to it when detecting patterns; the user defines rules at any time. Both are valid. Every rule must have an ID, a clear statement, and a reason it exists.

**DOCS-7 — Plain Markdown Only** `[severity: medium]`
All doc files use `#` and `##` headings, plain prose, and tables where structure helps. No nested bullet lists deeper than one level. No decorative formatting. Write for the next agent, not for a presentation.

**DOCS-8 — Memory is Terse** `[severity: medium]`
`memory.md` entries must be short. If an entry needs more than three or four lines, it belongs in `handover.md` or `architecture.md` instead. Memory is a quick-reference — not a log.

**DOCS-9 — Completed Todos Archive** `[severity: high]`
When a `todo.md` phase is completed, move it to `completed/todo{N}.md` where N is the next incremental number. Never delete completed todos — they are a historical record of what was built and why.

**DOCS-10 — Features File is the Capability Truth** `[severity: high]`
`features.md` documents what the system currently does — shipped, working capabilities only. It is not a roadmap. Future capabilities belong in `product_plan.md`. Read `features.md` before making any changes to understand what already exists. Update it the moment a capability ships or changes.

**DOCS-11 — Styling Guide Standards** `[severity: high]`
`styling.md` must define design tokens, typography scales, and interaction rules. It is the visual source of truth. Any UI change that breaks these tokens must either update the tokens or be reverted. Only create it if the project has UI.

**DOCS-12 — Creative Brief Integrity** `[severity: medium]`
`creative_brief.md` is required only for projects involving branding or external design. When created, it must follow the standard 8-section structure to ensure alignment between business goals and creative execution.

**DOCS-13 — Legacy Preservation** `[severity: low]`
The `legacy/` folder is for existing documentation that does not fit the standard required files but contains valuable context. Use it for pre-migration docs and old implementation notes that must not be lost.

---

## Writing standards

**Tone:** Write for the next agent, not for a human presentation. Be direct, specific, and terse. Name files and functions. Avoid vague summaries.

**What belongs where:**

| Content | File |
|---|---|
| What to do next | `todo.md` |
| What exists and how it connects | `architecture.md` |
| A rule the team follows | `conventions.md` |
| What the system currently does | `features.md` |
| A constraint that cannot be inferred from code | `memory.md` |
| The full current broken state | `handover.md` |
| What was completed and why | `implementation.md` |
| Visual tokens and UI rules | `styling.md` |
| Business strategy or market decisions | `business_plan.md` |
| Product vision or feature roadmap | `product_plan.md` |
| Creative and branding strategy | `creative_brief.md` |
| Deprecated but important history | `legacy/` |

**What never belongs in docs:**
- Marketing language or aspirational copy
- Explanations of what good code looks like (those belong in the governance tools)
- Duplicate information that already lives in another required file
- Placeholder text left from templates

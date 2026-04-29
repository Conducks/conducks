<!-- description: Documentation standards for all services. Required files, writing rules, and how to keep docs current without bloat. -->

# Docs Guidance

> Every service is self-documenting. A new agent must be able to onboard from docs alone — no verbal handoff, no tribal knowledge.

---

## Required files

### Single Application Structure
For single applications, use `docs/` at the project root:

| File | Purpose | Written when |
|---|---|---|
| `business_plan.md` | Business strategy, market positioning, and revenue models | On confirmed business direction — append only, never rewrite |
| `product_plan.md` | Product vision, user stories, and feature roadmap | On confirmed product direction — append only, never rewrite |
| `features.md` | Product features and specifications (source of truth) | Immediately upon any capability change |
| `architecture.md` | Module map, file tree, dependency directions, forbidden imports | Whenever structure or contracts change |
| `implementation.md` | What was built — a running log | Only when user explicitly asks |
| `handover.md` | Full session state for the next agent | Only when user explicitly asks |
| `conventions.md` | Non-negotiable rules for this service | Agent detects and appends; user defines |
| `styling.md` | High-fidelity source of truth for visual and interactive standards | At project start or when design tokens are defined |
| `creative_brief.md` | Strategy for branding, marketing, and creative direction | On project start or when engaging designers |
| `todo.md` | Phases and tasks with acceptance criteria | During plan phase, updated throughout |
| `completed/` | Historical completed todos (todo1.md, todo2.md, etc.) | When todos are completed |
| `legacy/` | Existing documentation that does not fit into the standard required files but must be preserved | When moving to the Conducks documentation standard |
| `memory.md` | Critical agent-only notes that must survive sessions | Agent appends during execute and memory phases |

> **Note:** Not every project needs every file. Create only the files relevant to the project's actual scope. A marketing website does not need `business_plan.md` if strategy lives elsewhere. A CLI tool with no UI does not need `styling.md`. Never create a file just to satisfy the table above — only create it when there is real content to record.

### Multi-Service Structure
For multi-service projects, each service has its own `docs/` directory:

```
service1/
├── docs/
│   ├── business_plan.md
│   ├── product_plan.md
│   ├── features.md
│   └── ... (all required files)
└── src/
    └── ...

service2/
├── docs/
│   ├── business_plan.md
│   ├── product_plan.md
│   ├── features.md
│   └── ... (all required files)
└── src/
    └── ...
```

Core shared concepts belong in the root `docs/` directory unless service-specific.

If any of these files are missing when a session starts, create them from templates before doing anything else.

---

## Rules

**DOCS-1 — Bootstrap on Session Start** `[severity: high]`
At the start of every session, verify that all required documentation files exist for the current scope (project root for single apps, service directory for multi-service). If any are missing, create them from templates immediately. Do not start work without its docs in place.

**DOCS-2 — Business and Product Plans are Append-Only** `[severity: high]`
Never edit or delete existing entries in `business_plan.md` or `product_plan.md`. The history of business and product intent is permanent. New entries are always appended at the bottom with a date and a confirmation that the user approved the update.

**DOCS-3 — Architecture Stays Current** `[severity: high]`
`architecture.md` must reflect the real state of the codebase at all times. Every file in the project must appear in the file tree. Every module's dependencies must be listed. Update it during execute phase — not after.

**DOCS-4 — Implementation Log is On-Demand** `[severity: high]`
Do not append to `implementation.md` unless the user asks. When they do, cover only what happened since the previous entry. Never edit previous entries.

**DOCS-5 — Handover is On-Demand** `[severity: high]`
Do not write `handover.md` unless the user asks. When they do, overwrite the entire file. Be specific, honest, and complete. The next agent's ability to start without confusion depends entirely on this document.

**DOCS-6 — Conventions Grow Over Time** `[severity: medium]`
`conventions.md` is never finished. The agent appends to it when detecting patterns; the user defines rules at any time. Both are valid. Every rule must have an ID, a clear statement, and a reason it exists.

**DOCS-7 — Plain Markdown Only** `[severity: medium]`
All doc files use `#` and `##` headings, plain prose, and tables where structure helps. No nested bullet lists deeper than one level. No decorative formatting. Write for the next agent, not for a presentation.

**DOCS-8 — Memory is Terse** `[severity: medium]`
`memory.md` entries must be short. If an entry needs more than three or four lines, it belongs in `handover.md` or `architecture.md` instead. Memory is a quick-reference — not a log.

**DOCS-9 — Completed Todos Archive** `[severity: high]`
When a `todo.md` is completed, move it to `completed/todo{N}.md` where N is the next incremental number (1, 2, 3, etc.). Never delete completed todos — they serve as historical record of what was built and why.

**DOCS-10 — Features File Structure** `[severity: high]`
Every project must have a `features.md` file (at `docs/features.md` for single apps, or per-service in multi-service projects) that follows the strict structure: Title headers for modules, detailed plain-text bullet points for capabilities, no formatting within bullets, immediate sync requirement, and source-of-truth status. Read `features.md` before making any changes to understand what capabilities exist.

**DOCS-11 — Styling Guide Standards** `[severity: high]`
`styling.md` must define design tokens, typography scales, and interactive affordances. It serves as the visual source of truth. Any UI change that breaks these tokens must either update the tokens or be reverted.

- Use `ResizeObserver` on the container element for any component whose rendering depends on available width (charts, conditional layouts, responsive tables). Do not use `window` resize events — flex and grid containers resize independently of the viewport.

**DOCS-12 — Creative Brief Integrity** `[severity: medium]`
`creative_brief.md` is required for projects involving branding or external design. It must follow the standard 8-section structure to ensure alignment between business goals and creative execution.

**DOCS-13 — Legacy Preservation** `[severity: low]`
The `legacy/` folder is used for existing documentation that does not fit into the new primary required files but contains valuable context. Use this to house pre-migration docs, old implementation notes, or unique project documentation that must not be lost during the transition to the Conducks standard.





---

## Writing standards

**Tone:** Write for the next agent, not for a human presentation. Be direct, specific, and terse. Name files and functions. Avoid vague summaries.

**What belongs where:**
- Business strategy or market decisions → `business_plan.md`
- Product vision or feature roadmap → `product_plan.md`
- A decision and why → `architecture.md`
- A constraint from outside the codebase → `memory.md`
- A rule the team follows → `conventions.md`
- The story of what changed → `implementation.md`
- Visual tokens and UI rules → `styling.md`
- Creative and branding strategy → `creative_brief.md`
- The current broken state → `handover.md`
- What to do next → `todo.md`
- What was completed → `completed/todo{N}.md`
- Deprecated but important history → `legacy/`

**What never belongs in docs:**
- Marketing language or aspirational copy
- Explanations of what good code looks like (those belong in the governance tools)
- Duplicate information that already lives in another required file
- Placeholder text left from templates
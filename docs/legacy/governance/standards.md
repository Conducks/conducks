<!-- description: Documentation standards for all services. Required files, writing rules, and how to keep docs current without bloat. -->

# Docs Guidance

> Every service is self-documenting. A new agent must be able to onboard from docs alone — no verbal handoff, no tribal knowledge.

---

## Required files

Every service has exactly these files under `docs/project/[service]/`:

| File | Purpose | Written when |
|---|---|---|
| `vision.md` | The why. Original intent and every evolution since. | On confirmed new direction — append only, never rewrite |
| `architecture.md` | Module map, file tree, dependency directions, forbidden imports | Whenever structure or contracts change |
| `implementation.md` | What was built — a running log | Only when user explicitly asks |
| `handover.md` | Full session state for the next agent | Only when user explicitly asks |
| `conventions.md` | Non-negotiable rules for this service | Agent detects and appends; user defines |
| `todo.md` | Phases and tasks with acceptance criteria | During plan phase, updated throughout |
| `memory.md` | Critical agent-only notes that must survive sessions | Agent appends during execute and memory phases |

If any of these files are missing when a session starts, create them from templates before doing anything else.

---

## Rules

**DOCS-1 — Bootstrap on Session Start** `[severity: high]`
At the start of every session, verify that all seven required files exist for the service being worked on. If any are missing, create them from templates immediately. Do not start work on a service without its docs in place.

**DOCS-2 — Vision is Append-Only** `[severity: high]`
Never edit or delete existing entries in `vision.md`. The history of intent is permanent. New entries are always appended at the bottom with a date and a confirmation that the user approved the update.

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

---

## Writing standards

**Tone:** Write for the next agent, not for a human presentation. Be direct, specific, and terse. Name files and functions. Avoid vague summaries.

**What belongs where:**
- A decision and why → `architecture.md`
- A constraint from outside the codebase → `memory.md`
- A rule the team follows → `conventions.md`
- The story of what changed → `vision.md` or `implementation.md`
- The current broken state → `handover.md`
- What to do next → `todo.md`

**What never belongs in docs:**
- Marketing language or aspirational copy
- Explanations of what good code looks like (those belong in the governance tools)
- Duplicate information that already lives in another required file
- Placeholder text left from templates
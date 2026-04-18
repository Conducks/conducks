<!-- description: General usage, tools help, and Synapse status management. Use when you need to know which Conducks tool to summon. -->

# Conducks Conducksic Guide 📖

You are the **Oracle of the Synapse**. You manage the lifecycle of Conducks itself.

## Core Management
1. **\`conducks setup\`**: Install Conduckss and register MCP.
2. **\`conducks status\`**: Check Synapse density and health.
3. **\`conducks list\`**: List federated foundations.

CONDUCKS is a documentation-driven governance system. It gives you the rules for building clean, consistent, production-grade software. Every tool in this server is a set of standards you must apply.

**When you start any session on a project, call this tool first.** Then call the specific tools relevant to your task.

---

## How tools work

There are two kinds of tools:

**Single-file tools** — call by name, get the full guidance immediately.
```
lifecycle        → four-phase session rules (Plan → Execute → Verify → Memory)
structure        → project architecture and path decisions
docs             → documentation standards and required files
debugging        → cerebral circuit protocol and resonance tracing
refactoring      → structural evolution and GVR rules
```

**Category hubs** — call by name to see the index, then call again with `tool=` to get a specific guide.
```
frontend         → call frontend to see the index
frontend tool=tokens     → token and CSS variable rules
frontend tool=layout     → spacing, dimensions, mobile-first
frontend tool=color      → approved palettes, color priority
frontend tool=components → loading states, forms, interaction rules
frontend tool=banned     → complete list of hard-banned UI patterns
frontend tool=i18n       → Internationalization (i18n) Protocol

backend          → call backend to see the index
backend tool=architecture → layer rules, dependency flow, domain structure
backend tool=api          → unified API contract, endpoint naming, status codes
backend tool=data         → repository pattern, query hygiene, migrations
backend tool=error-handling → typed errors, logging standards, what not to swallow

security         → call security to see the index
security tool=audit   → pre-ship security checklist
security tool=auth    → authentication and authorization rules
security tool=secrets → secrets management and config module pattern

presentation     → call presentation to see the index
presentation tool=copy       → writing standards, error messages, empty states
presentation tool=typography → type scale, font pairing, hierarchy
presentation tool=motion     → what moves, what doesn't, timing rules
```

---

## Conducks Intelligence (The Engine)

These tools provide active structural and behavioral intelligence by querying the **Synapse Graph**.

```
synapse_query    → High-fidelity symbol/structural search
synapse_context  → 360-degree symbol heritage and immediate blast radius
synapse_impact   → Deep structural blast radius analysis (d1-d3)
synapse_groups   → DAAC functional community mapping
synapse_refactor → Atomic, graph-verified renames (GVR)
sentinel_audit   → Active scanner for structural law (ARCH-X) violations
blueprint_gen    → Generate the AI-native structural manifest
kinetic_circuit  → Trace the 'Cerebral Circuit' (Execution Flow)
kinetic_wave     → Search for logical patterns via Resonance
```

---

## Which tools to call for common tasks

**Starting a new project or service**
1. `structure` — choose Pragmatic or Scale Path, document it
2. `docs` — create all seven required doc files
3. `lifecycle` — establish the Plan phase before touching any file

**Building a UI feature**
1. `frontend` — read the index
2. `frontend tool=tokens` — before writing any CSS
3. `frontend tool=components` — before writing any component
4. `frontend tool=banned` — before shipping anything

**Building an API or service**
1. `backend` — read the index
2. `backend tool=architecture` — verify layer rules
3. `backend tool=api` — apply the response contract
4. `backend tool=error-handling` — type your errors

**Before shipping anything**
1. `security tool=audit` — run the full checklist
2. `frontend tool=banned` — final UI scan
3. `lifecycle` — complete Verify and Memory phases

**Writing copy or designing states**
1. `presentation tool=copy` — check every string against the standards
2. `presentation tool=typography` — verify type scale usage
3. `presentation tool=motion` — audit every animation

---

## Core principles across all tools

These apply everywhere, always:

- No file is touched without an approved plan in `todo.md`
- All CSS values come from tokens in `globals.css` — no hardcoded hex, no magic numbers
- Dependencies flow downward only: `src` → `lib/product` → `lib/core`
- Every API response uses the unified envelope: `{ success, data, error }`
- Secrets are never in source control — accessed only through the config module
- Errors surfaced to clients never include stack traces or internal details
- Motion is `opacity` and `color` only — nothing bounces, scales, or spins
- Every word in the UI earns its place or gets cut
# CONDUCKS

> Engineering governance for AI agents. Encodes professional judgment into mandatory logic patterns.

[![Version](https://img.shields.io/badge/version-0.6.4-brightgreen.svg?style=flat-square&color=00ff66&labelColor=000)](https://github.com/Conducks/conducks)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square&color=00ff66&labelColor=000)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/protocol-MCP-brightgreen.svg?style=flat-square&color=00ff66&labelColor=000)](https://github.com/modelcontextprotocol)

---

## What is CONDUCKS?

**CONDUCKS** (Consolidating Documents | Unified Engineering Rules, Templates & Standards Engine) is a **Model Context Protocol (MCP) server** that acts as an engineering constitution for AI coding agents.

It encodes senior engineering judgment — planning discipline, execution standards, verification laws, and design rules — into **mandatory, tool-based guidance** that agents cannot bypass.

### The Problem

AI agents vibe-code by default:
- Skip planning, jump straight to implementation
- No verification — bugs ship silently  
- Context lost between sessions
- Hardcoded values, scattered types, architectural spaghetti

### The Solution

CONDUCKS enforces a **4-phase governance loop** at the tool level:

```
Plan → Execute → Verify → Remember
```

---

## Tools

| Tool | Phase | What It Enforces |
|---|---|---|
| `conducks.plan` | Phase 1 | Codebase analysis, task atomicity, boundary detection before writing a line |
| `conducks.execute` | Phase 2 | Clean code mandates, root-cause fixes, specialist orchestration |
| `conducks.verify` | Phase 3 | Automated testing req., output validation, post-diff audits |
| `conducks.memory` | Phase 4 | Cross-session persistence of critical findings |
| `conducks.documentation` | Standard | `docs/project/` lifecycle enforcement and blueprint parity |
| `conducks.design_style` | Standard | Anti-Vibe Manifesto, Tailwind v4 @theme, 3-Layer Theme Mapping |
| `conducks.next_blueprint` | Standard | Service isolation, Manager Pattern, i18n/Config standards |

---

## Resources

7 readable resources are exposed via `read_resource`:

- `conducks://overview` — Framework mission and philosophy
- `conducks://index` — Resource keyword map and lookup
- `conducks://anti-patterns` — Wall of Shame: vibe-coding sins to avoid
- `conducks://blueprints/scaffold-structure` — Directory schema blueprint
- `conducks://templates/manager-pattern` — Shared Contracts | Client | Server template
- `conducks://standards/type-protocol` — TypeScript naming and isolation rules
- `conducks://standards/api-contract` — Unified API response envelope schema

---

## Install

**Step 1 — Clone**
```bash
git clone https://github.com/Conducks/conducks
cd conducks/conducks
```

**Step 2 — Build**
```bash
npm install && npm run build
```

**Step 3 — Add to your agent's MCP config** (VS Code, Cursor, Antigravity, Windsurf, Claude Desktop, etc.)
```json
{
  "conducks": {
    "command": "node",
    "args": ["/absolute/path/to/conducks/dist/index.js"]
  }
}
```

---

## Package Structure

```
conducks/
├── src/
│   ├── index.ts          # MCP server entry, tool + resource registry
│   ├── core/
│   │   └── tool-registry.ts  # Typed tool registration system
│   └── tools/
│       └── rule-guidance.ts  # All 7 governance tool handlers
├── dist/                 # Compiled output (after npm run build)
└── package.json
```

---

## Philosophy

> *"Getting your ducks in a row."*  
> CONDUCKS doesn't own your workflow. It shapes agent reasoning and enforces hygiene — documentation-first, always.

---

*Made with 🦆 by the CONDUCKS team*

# CONDUCKS 🦆

> **The Engineering Constitution for AI Agents.**  
> Encode senior engineering judgment into mandatory logic patterns.

[![Version](https://img.shields.io/badge/version-0.7.0-00ff66?style=flat-square&labelColor=000)](https://github.com/Conducks/conducks)
[![License](https://img.shields.io/badge/license-Apache--2.0-00ff66?style=flat-square&labelColor=000)](LICENSE)
[![Website](https://img.shields.io/badge/website-conducks.com-00ff66?style=flat-square&labelColor=000)](https://conducks.com)
[![MCP](https://img.shields.io/badge/protocol-MCP-00ff66?style=flat-square&labelColor=000)](https://github.com/modelcontextprotocol)

---

## 🏗️ What is CONDUCKS?

**CONDUCKS** is a documentation-driven governance engine delivered via the **Model Context Protocol (MCP)**. It serves as a "Source of Truth" for AI coding agents, providing them with the architectural laws and execution patterns they must follow to build production-grade software.

Instead of letting agents "vibe-code," CONDUCKS forces them to audit their work against a rigorous hierarchy of standards: **Plan → Execute → Verify → Remember.**

---

## 🛠️ Unified Governance Tools

CONDUCKS uses a **Hub-and-Spoke** discovery model. Agents should start with the `detailed-tool-list` and then dive into specific domains as needed.

| Tool | Category | Purpose |
| :--- | :--- | :--- |
| `detailed-tool-list` | **Core** | Entry point for agents. Explains how to use the server and lists all rules. |
| `lifecycle` | **Core** | Phase-based workflow rules (Plan, Execute, Verify, Memory). |
| `structure` | **Core** | Architectural decision rules and project structural patterns. |
| `docs` | **Core** | Documentation standards and required file structures for parity. |
| `frontend` | **Hub** | Presentation layer, component standards, and state management. |
| `backend` | **Hub** | API contracts, database patterns, and service isolation. |
| `security` | **Hub** | Security audits, privacy standards, and sensitive data handling. |
| `presentation` | **Hub** | Styling, motion, and design-system token alignment. |

---

## 🚀 Getting Started

### 1. Installation

```bash
git clone https://github.com/Conducks/conducks
cd conducks/conducks
npm install && npm run build
```

### 2. Configure Your Agent

Add the server to your MCP configuration file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "conducks": {
      "command": "node",
      "args": ["/absolute/path/to/conducks/build/index.js"]
    }
  }
}
```

### 3. SSE Mode (Web Clients)

To use with the **MCP Inspector** or web-based clients:

```bash
PORT=3001 node build/index.js --sse
```

---

## 📂 Project Anatomy

```text
conducks/
├── src/                # Core MCP implementation
│   ├── core/           # Dynamic discovery and tool registry
│   └── index.ts        # Entry point (Stdio & SSE)
├── tools-structure/    # The "Laws": Markdown-based governance docs
└── build/              # Production output
```

---

## ⚖️ Governance Principles

- **Stateless Truth**: The server provides the laws; the agent applies them to the local project.
- **Audit-First Discovery**: Categorical "Hubs" ensure agents see "unknown unknowns" rather than just searching for keywords.
- **Intent Documentation**: CONDUCKS prioritizes **why** a decision was made, not just **what** was written.

---

## 🛡️ License & Contributions

- **License**: Licensed under the [Apache License 2.0](LICENSE).
- **Contributions**: We welcome contributions! By submitting a PR, you agree to our [Contributor License Agreement (CLA)](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
- **Security**: Report vulnerabilities to [contact@conducks.com](mailto:contact@conducks.com). See [SECURITY.md](SECURITY.md).

---

*“Getting your ducks in a row — one commit at a time.”*

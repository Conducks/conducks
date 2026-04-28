<!-- @format -->

# Universal Project Architecture Guidelines

## 1. Core Principle

This architecture enforces strict separation between Protocol Logic, Business Logic, and Infrastructure Machinery.

It is intentionally technology-agnostic:

- Folder names represent architectural roles, not vendor or protocol brands.
- External technologies are treated as replaceable adapters.
- If one protocol is replaced, only its adapter should change, not the system structure.

In Next.js, `src/app` is a framework-mandated exception for HTTP delivery. All other execution entry points should remain generic.

Every piece of code belongs to one of four layers:

| Layer                 | Role                    | Question It Answers                                 |
| --------------------- | ----------------------- | --------------------------------------------------- |
| Interfaces (Delivery) | Protocol adaptation     | How does the outside world talk to us?              |
| Domain (Meaning)      | Business logic          | What does this application do?                      |
| Core (Capability)     | Reusable infrastructure | What machinery enables it?                          |
| Registry (Bridge)     | Wiring and composition  | How are capabilities and domain services connected? |

---

## 2. Directory Structure

All folders are optional except those required by your framework.

```text
project-root/
├── src/
│   ├── app/                          # Delivery: HTTP routes/pages (Next.js requirement)
│   │
│   ├── interfaces/                   # Delivery: non-HTTP execution contexts
│   │   ├── tools/                    # Tool-based or RPC adapters
│   │   ├── cli/                      # Command-line adapter
│   │   ├── jobs/                     # Background processing adapter
│   │   └── webhooks/                 # Event callback adapter
│   │
│   ├── components/                   # Delivery: stateless presentation units
│   │
│   ├── registry/                     # Bridge: dependency wiring and manifests
│   │
│   ├── lib/
│   │   ├── domain/                   # Meaning: product/business rules
│   │   └── core/                     # Capability: generic infrastructure
│   │
│   ├── config/                       # Environment and runtime configuration
│   └── types/                        # Shared TypeScript declarations
│
├── public/                           # Static assets (if needed)
├── tests/                            # Unit/integration/end-to-end tests
└── package.json
```

Naming guideline:

- Prefer role-based names like `tools`, `jobs`, `events`, `cli`, `webhooks`.
- Avoid naming folders after a specific external technology.

---

## 3. Layer Responsibilities

### 3.1 Delivery Layer (`app/`, `interfaces/`, `components/`)

Responsibility:

- Accept protocol input.
- Translate protocol payloads to typed application inputs.
- Call Registry-exposed services.
- Translate results into protocol response formats.

Rules:

- Delivery may not import from `lib/domain` or `lib/core` directly.
- Delivery is orchestration and presentation only.
- No business rules in handlers, routes, commands, or tool callbacks.

### 3.2 Meaning Layer (`lib/domain/`)

Responsibility:

- Product semantics and decision-making.
- Workflows, invariants, and business validation.

Rules:

- Protocol-agnostic and UI-agnostic.
- Receives typed primitives and returns typed results.
- May import from `lib/core`.
- Must never import from Delivery layers.

### 3.3 Capability Layer (`lib/core/`)

Responsibility:

- Generic infrastructure and technical capabilities.

Examples:

- Database adapters, auth, logging, telemetry, caching, HTTP clients, parsing utilities.

Drop-in rule:
If code cannot be reused in another application with little or no rewrite, it likely belongs in `lib/domain`, not `lib/core`.

### 3.4 Bridge Layer (`registry/`)

Responsibility:

- Assemble core capabilities and domain services through explicit dependency injection.

Rules:

- No business logic.
- No protocol formatting.
- Central composition point used by all Delivery contexts.

---

## 4. Dependency Direction

Dependencies flow inward only:

`Delivery -> Registry -> Domain -> Core`

This direction is mandatory.

---

## 5. Strict Dependency Matrix

| Layer            | May Import From                          | Must Not Import From                               |
| ---------------- | ---------------------------------------- | -------------------------------------------------- |
| App / Interfaces | `components`, `registry`                 | `lib/domain`, `lib/core`                           |
| Components       | `registry` (shared providers/hooks only) | `app`, `interfaces`, `lib/domain`, `lib/core`      |
| Registry         | `lib/domain`, `lib/core`                 | `app`, `interfaces`, `components`                  |
| Domain           | `lib/core`, same-domain internals        | `app`, `interfaces`, `components`, sibling domains |
| Core             | `lib/core/*` only                        | all other layers                                   |

Note:
If one domain needs another domain, compose that interaction in `registry` or a dedicated orchestration service, not by direct cross-domain imports.

---

## 6. Registry Contract

`src/registry` is the only legal bridge from Delivery into Domain/Core.

Requirements:

- Register domain services.
- Instantiate required core providers.
- Inject dependencies explicitly.
- Export stable service contracts for Delivery use.

Example:

```typescript
// src/registry/index.ts
import { DatabaseManager } from '@/lib/core/database';
import { Logger } from '@/lib/core/logger';
import { MetricsEngine } from '@/lib/domain/metrics';

const db = new DatabaseManager();
const logger = new Logger();

export const metricsEngine = new MetricsEngine(db, logger);

export const registry = {
	metrics: metricsEngine,
};
```

---

## 7. Facade Pattern for Domain and Core

Each feature folder in `lib/domain` and `lib/core` exposes a strict public API via `index.ts`.

Example:

```text
src/lib/domain/metrics/
├── internal/
│   └── score-normalizer.ts
├── metrics.engine.ts
├── metrics.types.ts
└── index.ts
```

```typescript
// src/lib/domain/metrics/index.ts
export { MetricsEngine } from './metrics.engine';
export type { MetricsReport } from './metrics.types';
// Do not export internal/*
```

Benefits:

- Explicit boundaries.
- Easier testing and mocking.
- Stable contracts with low coupling.

---

## 8. Adapter Examples (Protocol-Agnostic Naming)

Bad (business logic inside adapter):

```typescript
// src/interfaces/cli/analyze.command.ts
export const runAnalyze = async (path: string) => {
	const files = fs.readdirSync(path);
	const dead = files.filter((f) => !f.includes('import'));
	console.table(dead);
};
```

Good (adapter delegates to Domain through Registry):

```typescript
// src/interfaces/cli/analyze.command.ts
import { registry } from '@/registry';

export const runAnalyze = async (path: string) => {
	const report = await registry.metrics.analyze(path);
	console.log(`Found ${report.totalDeadFiles} dead files`);
	console.table(report.deadFiles);
	return report;
};
```

```typescript
// src/interfaces/tools/dead-code.tool.ts
import { registry } from '@/registry';

export const deadCodeTool = {
	name: 'analyze_dead_code',
	schema: { path: 'string' },
	handler: async (args: { path: string }) => {
		const report = await registry.metrics.analyze(args.path);
		return {
			content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
		};
	},
};
```

The business logic remains in Domain regardless of adapter type.

---

## 9. Execution Flow

```text
Delivery Adapters (app, cli, tools, jobs, webhooks)
              -> Registry (composition and DI)
              -> Domain (business logic)
              -> Core (generic infrastructure)
```

---

## 10. Project-Type Adaptation

| Project Type        | Typical Included Folders                                                |
| ------------------- | ----------------------------------------------------------------------- |
| Multi-surface app   | `app`, `interfaces`, `components`, `registry`, `lib/domain`, `lib/core` |
| Headless backend    | `app/api`, `interfaces`, `registry`, `lib/domain`, `lib/core`           |
| Tool server only    | `interfaces/tools`, `registry`, `lib/domain`, `lib/core`                |
| CLI only            | `interfaces/cli`, `registry`, `lib/domain`, `lib/core`                  |
| Frontend-only shell | `app`, `components`, `registry`, `lib/core/http`                        |
| Package/SDK         | `lib/core`, optionally `registry`                                       |

---

## 11. Quick Placement Guide

| Concern                      | Folder              |
| ---------------------------- | ------------------- |
| HTTP route/page              | `app/`              |
| Command parsing/output       | `interfaces/cli/`   |
| Tool/RPC schema and handlers | `interfaces/tools/` |
| Background processing        | `interfaces/jobs/`  |
| Stateless UI                 | `components/`       |
| Business engine/rule         | `lib/domain/`       |
| Generic infrastructure       | `lib/core/`         |
| Dependency wiring            | `registry/`         |

---

## 12. Enforcement and Automation

Example ESLint restrictions:

```javascript
// eslint.config.js
export default {
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: [
					{
						group: ['@/lib/domain/*', '@/lib/core/*'],
						message:
							'Delivery layers must consume services through the Registry.',
					},
				],
			},
		],
	},
};
```

Optional lint-staged guard:

```json
{
	"lint-staged": {
		"src/lib/**/*.tsx": ["echo 'No .tsx files allowed in lib/' && exit 1"],
		"src/app/**/*.ts": ["eslint --fix"],
		"src/interfaces/**/*.ts": ["eslint --fix"]
	}
}
```

---

This architecture is designed for longevity: adapters can change, core structure should not.

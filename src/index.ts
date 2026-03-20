// MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Resource
} from "@modelcontextprotocol/sdk/types.js";

// Core imports
import { ToolRegistry } from "./core/tool-registry.js";

// Tool imports
import {
  lifecycleTool,
  docsTool,
  uiTool,
  architectTool
} from "./tools/guidance.js";

// Server configuration
const server = new Server(
  {
    name: "conducks",
    version: "0.6.4",
    title: "CONDUCKS: Consolidating Documents | Unified Engineering Rules, Templates & Standards Engine",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Initialize Registry
const registry = new ToolRegistry();

// Register Tools
registry.register(lifecycleTool);
registry.register(docsTool);
registry.register(uiTool);
registry.register(architectTool);

// Apply registry handlers to server
registry.applyTo(server);

// --- RESOURCE REGISTRY ---

const RESOURCES: Resource[] = [
  // 1. FOUNDATION (Core Philosophy & Meta)
  {
    uri: "conducks://foundation/overview",
    name: "[FOUNDATION] Framework Overview",
    description: "The mission statement for documentation-driven governance.",
    mimeType: "text/markdown",
  },
  {
    uri: "conducks://foundation/index",
    name: "[FOUNDATION] Resource & Keyword Index",
    description: "The 'Map' of the CONDUCKS server. Use this to find specific rules.",
    mimeType: "text/markdown",
  },
  {
    uri: "conducks://foundation/anti-patterns",
    name: "[FOUNDATION] Wall of Shame (Anti-Patterns)",
    description: "Common 'Vibe-Coding' mistakes and architectural sins to avoid.",
    mimeType: "text/markdown",
  },

  // 2. ARCHITECT (Structure & Standards)
  {
    uri: "conducks://architect/scaffold",
    name: "[ARCHITECT] Pure Directory Scaffold",
    description: "Detailed machine-readable architecture and directory schema.",
    mimeType: "text/markdown",
  },
  {
    uri: "conducks://architect/manager-pattern",
    name: "[ARCHITECT] The Manager Pattern",
    description: "Structural example of Shared Contracts | Client Hooks | Server Adapters.",
    mimeType: "text/markdown",
  },
  {
    uri: "conducks://architect/type-protocol",
    name: "[ARCHITECT] TypeScript Type Protocol",
    description: "Rules for naming, isolation, and interface usage.",
    mimeType: "application/json",
  },
  {
    uri: "conducks://architect/api-contract",
    name: "[ARCHITECT] Unified API Response Contract",
    description: "LEGO-brick schema for service communication.",
    mimeType: "application/json",
  },

  // 3. UI (Design & Manifesto)
  {
    uri: "conducks://ui/anti-vibe-manifesto",
    name: "[UI] Anti-Vibe Manifesto",
    description: "Mandatory rules for intentional vs vibe-coded design.",
    mimeType: "text/markdown",
  },

  // 4. DOCS (Internationalization & Process)
  {
    uri: "conducks://docs/i18n-keys",
    name: "[DOCS] i18n JSON Schema",
    description: "Key-naming conventions for localization files.",
    mimeType: "application/json",
  },

  // 5. VERIFY (Compliance & Audits)
  {
    uri: "conducks://verify/compliance-check",
    name: "[VERIFY] Local Compliance Auditor",
    description: "Bash script for manual verification of standards parity.",
    mimeType: "application/x-sh",
  }
];

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // --- FOUNDATION HANDLERS ---

  if (uri === "conducks://foundation/overview") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# CONDUCKS: Consolidating Documents\n\nCONDUCKS is a documentation-driven governance framework. It consolidates all engineering standards, philosophies, and mandatory rules into a unified guidance system.\n\n## Getting Your Ducks in a Row\n1. Consistently Consolidated: Use the guidance tools to retrieve standards from the system-wide 'Consolidated Documents'.\n2. Documentation-First: These tools ensure that every code change is backed by consolidated technical blueprints.\n3. Manual Blueprints: Every scaffold, contract, and schema is provided as a rule for YOU to implement.`
      }]
    };
  }

  if (uri === "conducks://foundation/index") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# CONDUCKS Resource & Keyword Index\n\n## Server Map\n- **Foundation**: \`conducks://foundation/overview\` | \`conducks://foundation/anti-patterns\`\n- **Architect**: \`conducks://architect/scaffold\` | \`conducks://architect/type-protocol\` | \`conducks://architect/api-contract\`\n- **UI**: \`conducks://ui/anti-vibe-manifesto\`\n- **Docs**: \`conducks://docs/i18n-keys\`\n- **Verify**: \`conducks://verify/compliance-check\`\n\n## Keyword Lookup\n- **Loading States** -> \`ui\` tool\n- **Z-Index/Layering** -> \`ui\` tool\n- **API Integration** -> \`architect\` tool\n- **Feature Tracking** -> \`docs\` tool\n- **Error Logging** -> \`lifecycle\` tool`
      }]
    };
  }

  if (uri === "conducks://foundation/anti-patterns") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# CONDUCKS Wall of Shame (Anti-Patterns)\n\nSTOP: If you are doing any of these, you are vibe-coding.\n\n- [ ] Direct DB calls from React Components.\n- [ ] Hardcoded HEX colors (Use design tokens).\n- [ ] Deeply nested ternaries in JSX (Extract to helper variables).\n- [ ] Coupling two microservices via shared internal types.`
      }]
    };
  }

  // --- ARCHITECT HANDLERS ---

  if (uri === "conducks://architect/scaffold") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# Core/Product Architecture Blueprint\n\nThis blueprint is adaptable to project scale. Follow the **Pragmatic Path** for small projects and the **Scale Path** for extraction readiness.\n\n## 1. Directory Structure\n- /config: Environment and tool configurations\n- /src/app: The Presentation Layer (Orchestration & UI)\n- /src/app/(home)/: Example feature folder for single-language\n  - page.tsx: Root page index\n  - components/: Page-specific components\n- /src/app/globals.css: **MANDATORY** Global styles and tokens.\n- /src/i18n: (Optional) Localization engine and dictionaries (\`/messages\`). **Ask user before implementing.**\n- /src/lib/product: SCALE-DEPENDENT Feature Engine (Domain-aware business logic)\n- /src/lib/core: SCALE-DEPENDENT Platform Engine (Domain-agnostic primitives)\n\n## 2. Downward Dependency Flow\n- **Target State**: \`app\` -> \`product\` -> \`core\`.\n- **App Layer**: Focuses on Next.js routing, layout shells, and UI composition. Imports from \`product\` and \`core\`.\n- **Product Layer**: (Scale-Only) Operates strictly within domain verticals (\`/cv\`, \`/billing\`).\n- **Core Layer**: (Scale-Only) Delivers generic, foundation-level solutions (Auth, DB).\n\n## 3. Mandatory Compliance\n- **globals.css**: All projects MUST centralize design tokens in \`src/app/globals.css\`. No hardcoded HEX in components.\n- **i18n Isolation**: If i18n is used, all user-facing text MUST reside in \`src/i18n/messages\`.\n- **App Structure**: Each route folder MUST contain its own \`page.tsx\` and \`components/\` directory for page-specific UI.\n- **Structural Integrity**: No upward imports allowed.`
      }]
    };
  }

  if (uri === "conducks://architect/manager-pattern") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# Template: Domain-Driven SOA\n\nThe Feature Engine (\`lib/product/\`) organizes business rules into strict, domain-aligned directories.\n\n### Directory Map (e.g., \`product/billing/\`)\n- \`repository.ts\`: Manages data persistence and database interactions.\n- \`service.ts\`: Orchestrates domain-specific business rules and processes.\n- \`utils/\`: Helper functions specific to this domain.\n- \`validation/\`: Schemas and verification logic for this domain.\n- \`/client\`: Browser-centric UI logic and hooks for this domain.\n- \`/server\`: Node environment logic and adapters.\n\n### Usage Standard\n- **Shared Primitives**: Consolidate cross-domain UI integrations and hooks into a designated \`product/_shared/\` directory.\n- **Context Isolation**: Clearly delineate browser-centric logic (\`/client\`) from Node environment logic (\`/server\`) within domains to ensure secure execution environments.`
      }]
    };
  }

  if (uri === "conducks://architect/type-protocol") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          schema: "TypeScript Type Protocol v1",
          conventions: {
            naming: "PascalCase for Interfaces/Types/Enums",
            preferred: "Interfaces for public APIs, Types for internal compositions",
            domain: "Prefix types with Domain Name if used in global scope (e.g., AuthUser, ApiError)"
          },
          isolation: {
            shared: "Must be 100% dependency-free. No OS-specific or browser-specific types.",
            barrel: "All types must be exported via index.ts or shared/index.ts"
          },
          prohibited: [
            "Any types (use unknown or explicit interfaces)",
            "Scattered process.env (must be defined in ConfigManager Schema)",
            "Direct hardcoded string literals for domain statuses (use Enums)"
          ]
        }, null, 2)
      }]
    };
  }

  if (uri === "conducks://architect/api-contract") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          schema: "Unified API Response v1",
          structure: {
            success: "boolean",
            data: "T | null",
            error: {
              code: "string (e.g., AUTH_UNAUTHORIZED)",
              message: "string",
              details: "any | optional"
            }
          },
          rule: "Every internal service must respond in this exact envelope."
        }, null, 2)
      }]
    };
  }

  // --- UI HANDLERS ---

  if (uri === "conducks://ui/anti-vibe-manifesto") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# Anti-Vibe Manifesto\n\nEnsure every UI choice is intentional. Refer to the system-wide rules.txt for specific visual red flags.`
      }]
    };
  }

  // --- DOCS HANDLERS ---

  if (uri === "conducks://docs/i18n-keys") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          schema: "i18n Naming Standard v1",
          pattern: "Namespace.Component.Action/Label",
          examples: [
            "Common.Button.Save",
            "Auth.Login.Title",
            "Settings.Theme.Toggle"
          ],
          rule: "Flat JSON is forbidden if it exceeds 2 levels. Consistent casing required."
        }, null, 2)
      }]
    };
  }

  // --- VERIFY HANDLERS ---

  if (uri === "conducks://verify/compliance-check") {
    return {
      contents: [{
        uri,
        mimeType: "application/x-sh",
        text: `#!/bin/bash\n# CONDUCKS Dependency Auditor\n\necho "Running Architectural Dependency Audit..."\n\n# Check for upward imports (Core importing Product or App)\ngrep -rE "import .* from '.*(product|app)/.*'" src/lib/core && echo "Violation: Core must not import from Product or App."\n\n# Check for upward imports (Product importing App)\ngrep -rE "import .* from '.*app/.*'" src/lib/product && echo "Violation: Product must not import from App."\n\n# Check for Hex Colors in TSX\ngrep -rE "#[0-9a-fA-F]{3,6}" src --include="*.tsx" && echo "Violation: Hardcoded HEX found in UI."\n\necho "Audit Complete."`
      }]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// --- SERVER LIFECYCLE ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CONDUCKS MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

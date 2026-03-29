import { Tool } from "../../core/registry/tool-registry.js";

/**
 * Conducks Documentation Layer
 * 
 * Exposes the 7 core pillars of project governance as MCP tools.
 */

export const conducks_lifecycle: Tool = {
  id: "conducks-lifecycle",
  name: "conducks_lifecycle",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve rules for the four-phase session lifecycle (Plan -> Execute -> Verify -> Memory).",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    phases: [
      { name: "Plan", goal: "Research, understand, and document the approach." },
      { name: "Execute", goal: "Implement the planned changes safely." },
      { name: "Verify", goal: "Validate behavior through tests and manual checks." },
      { name: "Memory", goal: "Update documentation and walkthroughs." }
    ]
  }),
  formatter: (res: any) => `## Conducks Lifecycle\n${res.phases.map((p: any) => `- **${p.name}**: ${p.goal}`).join('\n')}`
};

export const conducks_structure: Tool = {
  id: "conducks-structure",
  name: "conducks_structure",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve project architecture, layers, and folder organization rules.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    paths: ["Pragmatic Path (Small Projects)", "Scale Path (Modular Architecture)"],
    layers: ["src/ (Shell)", "lib/product/ (Domain Logic)", "lib/core/ (Shared Primitives)"]
  }),
  formatter: (res: any) => `## Conducks Structure\n**Paths:** ${res.paths.join(', ')}\n**Layers:** ${res.layers.join(' -> ')}`
};

export const conducks_docs: Tool = {
  id: "conducks-docs",
  name: "conducks_docs",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve documentation standards and required repository files.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    requiredFiles: ["README.md", "Task.md", "ADR.md", "Architecture.md", "Conventions.md"]
  }),
  formatter: (res: any) => `## Conducks Documentation\n**Required Files:** ${res.requiredFiles.join(', ')}`
};

export const conducks_frontend: Tool = {
  id: "conducks-frontend",
  name: "conducks_frontend",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve UI/UX tokens, layout, and component standards.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    tokens: ["Spacing (4px base)", "Colors (Approved variants)", "Typography (Scale)"],
    rules: ["Mobile-first", "No magic numbers", "Tokens-only CSS"]
  }),
  formatter: (res: any) => `## Conducks Frontend\n**Tokens:** ${res.tokens.join(', ')}\n**Rules:** ${res.rules.join(', ')}`
};

export const conducks_backend: Tool = {
  id: "conducks-backend",
  name: "conducks_backend",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve backend layer rules, data access, and API contract standards.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    layers: ["Controller", "Service", "Repository"],
    api: ["Unified Envelope {success, data, error}", "Typed Errors"]
  }),
  formatter: (res: any) => `## Conducks Backend\n**Layers:** ${res.layers.join(' -> ')}\n**API Standard:** ${res.api.join(', ')}`
};

export const conducks_security: Tool = {
  id: "conducks-security",
  name: "conducks_security",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve security audit checklist and secrets management rules.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    checks: ["No secrets in source control", "Config module pattern", "RBAC Verification"]
  }),
  formatter: (res: any) => `## Conducks Security\n**Audit Checks:** ${res.checks.join(', ')}`
};

export const conducks_presentation: Tool = {
  id: "conducks-presentation",
  name: "conducks_presentation",
  type: "tool",
  version: "1.0.0",
  description: "Retrieve standards for UI copy, typography, and motion rules.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => ({
    copy: ["Tone of Voice", "Error message clarity"],
    motion: ["Opacity/Color transitions only", "No bouncing"]
  }),
  formatter: (res: any) => `## Conducks Presentation\n**Copy:** ${res.copy.join(', ')}\n**Motion:** ${res.motion.join(', ')}`
};

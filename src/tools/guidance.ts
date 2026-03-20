import fs from "fs/promises";
import { Tool } from "../core/tool-registry.js";

// ─── File resolution ──────────────────────────────────────────────────────────

function guidancePath(filename: string): URL {
  return new URL(`../../tools-data/${filename}`, import.meta.url);
}

function templatePath(filename: string): URL {
  return new URL(`../../tools-data/templates/${filename}`, import.meta.url);
}

async function readGuidance(filename: string): Promise<string> {
  return fs.readFile(guidancePath(filename), "utf8");
}

async function readTemplate(filename: string): Promise<string> {
  return fs.readFile(templatePath(filename), "utf8");
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * lifecycle — returns the full lifecycle guidance, optionally filtered to one phase.
 */
export async function handleLifecycle(args: {
  phase?: "plan" | "execute" | "verify" | "memory";
}): Promise<string> {
  const content = await readGuidance("lifecycle.md");

  if (!args.phase) return content;

  // Extract just the requested phase section
  const headings: Record<string, string> = {
    plan: "## Phase: Plan",
    execute: "## Phase: Execute",
    verify: "## Phase: Verify",
    memory: "## Phase: Memory",
  };

  const heading = headings[args.phase];
  const start = content.indexOf(heading);
  if (start === -1) return content;

  // Find next same-level heading or end of file
  const after = content.indexOf("\n## ", start + heading.length);
  const section = after === -1 ? content.slice(start) : content.slice(start, after);

  return `# Lifecycle — ${args.phase}\n\n${section.trim()}`;
}

/**
 * docs — returns docs guidance plus the list of required templates.
 */
export async function handleDocs(args: {
  action: "create" | "update" | "audit";
  service_name: string;
}): Promise<string> {
  const guidance = await readGuidance("docs.md");

  if (args.action !== "create") return guidance;

  // For create, also include a summary of what templates to scaffold
  const templateNames = [
    "vision.md",
    "architecture.md",
    "implementation.md",
    "handover.md",
    "conventions.md",
    "todo.md",
    "memory.md",
  ];

  const templateList = templateNames
    .map((t) => `- docs/project/${args.service_name}/${t}`)
    .join("\n");

  return `${guidance}\n\n---\n\n## Files to create for "${args.service_name}"\n\n${templateList}\n\nCopy each from \`tools-data/templates/\` and replace \`[Service Name]\` with \`${args.service_name}\`.`;
}

/**
 * ui — returns the UI guidance.
 */
export async function handleUI(): Promise<string> {
  return readGuidance("ui.md");
}

/**
 * architect — returns the architecture guidance.
 */
export async function handleArchitect(args: {
  action: "setup" | "feature" | "refactor";
}): Promise<string> {
  const guidance = await readGuidance("structure-guide.md");

  const context: Record<string, string> = {
    setup:
      "> You are setting up a new service. Focus on ARCH-1 (document the path choice) and ARCH-4 (file tree) first.",
    feature:
      "> You are adding a feature. Focus on ARCH-3 (downward flow), ARCH-5 (feature verticals), and ARCH-6 (conventions own the import rules).",
    refactor:
      "> You are refactoring. Focus on ARCH-8 (refactor has its own task) — do not refactor without a plan entry and user awareness.",
  };

  return `${context[args.action]}\n\n${guidance}`;
}

/**
 * template — returns the raw content of a named template file.
 */
export async function handleTemplate(args: {
  name:
    | "vision"
    | "architecture"
    | "implementation"
    | "handover"
    | "conventions"
    | "todo"
    | "memory";
}): Promise<string> {
  return readTemplate(`${args.name}.md`);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const lifecycleTool: Tool = {
  name: "lifecycle",
  description:
    "REQUIRED at the start of every session and before each phase transition. " +
    "Call with no phase to read all four phases. Call with a specific phase " +
    "(plan | execute | verify | memory) to read only that phase's rules. " +
    "Always call with phase='plan' before writing any plan, " +
    "phase='execute' before writing any code, " +
    "phase='verify' before marking work done, " +
    "phase='memory' before ending the session.",
  inputSchema: {
    type: "object",
    properties: {
      phase: {
        type: "string",
        enum: ["plan", "execute", "verify", "memory"],
        description: "Which phase to read. Omit to read all phases.",
      },
    },
    required: [],
  },
  handler: handleLifecycle,
  formatter: (result: unknown) => result as string,
};

export const docsTool: Tool = {
  name: "docs",
  description:
    "Read documentation standards and required file structure. " +
    "Call with action='create' when starting a new service to get the full scaffold list. " +
    "Call with action='update' after any code or contract change to see what docs need updating. " +
    "Call with action='audit' to verify the current service docs are complete.",
  inputSchema: {
    type: "object",
    properties: {
      service_name: {
        type: "string",
        description: "Name of the service being documented.",
      },
      action: {
        type: "string",
        enum: ["create", "update", "audit"],
      },
    },
    required: ["service_name", "action"],
  },
  handler: handleDocs,
  formatter: (result: unknown) => result as string,
};

export const uiTool: Tool = {
  name: "ui",
  description:
    "Read UI and styling standards before touching any component, style, or token. " +
    "Call this whenever working on anything visual — components, CSS variables, spacing, loading states, or responsive layout.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: handleUI,
  formatter: (result: unknown) => result as string,
};

export const architectTool: Tool = {
  name: "structure",
  description:
    "Read structure-guide.md — the rules for architectural decisions. " +
    "Call with action='setup' when creating a new service or choosing a path. " +
    "Call with action='feature' when adding a new domain or module. " +
    "Call with action='refactor' before any structural reorganisation. " +
    "Distinct from architecture.md (the per-service living doc) — this is the rulebook, not the map.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["setup", "feature", "refactor"],
      },
    },
    required: ["action"],
  },
  handler: handleArchitect,
  formatter: (result: unknown) => result as string,
};

export const templateTool: Tool = {
  name: "template",
  description:
    "Retrieve the raw content of a document template. " +
    "Use when scaffolding a new service to get the correct starting content for each required file. " +
    "Available templates: vision, architecture, implementation, handover, conventions, todo, memory.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        enum: [
          "vision",
          "architecture",
          "implementation",
          "handover",
          "conventions",
          "todo",
          "memory",
        ],
        description: "Which template to retrieve.",
      },
    },
    required: ["name"],
  },
  handler: handleTemplate,
  formatter: (result: unknown) => result as string,
};
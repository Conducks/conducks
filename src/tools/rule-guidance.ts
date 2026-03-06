import { Tool } from '../core/tool-registry.js';

// --- ARGUMENT INTERFACES ---

interface PlanArgs {
  task_description: string;
}

interface ExecuteArgs {
  current_focus: string;
}

interface VerifyArgs {
  changes_made: string;
}

interface MemoryArgs {
  important_findings: string;
}

interface DocumentationArgs {
  service_name: string;
  action: 'create' | 'update' | 'audit';
}

interface DesignStyleArgs {
  context: string; // e.g., "Reviewing login page", "Designing new card component"
}

interface NextBlueprintArgs {
  action: 'setup' | 'feature' | 'refactor';
  description: string;
}

// --- RESULT INTERFACES ---

interface ToolResult {
  rules: string[];
  philosophy: string;
}

// --- HANDLERS ---

export async function handlePlan(args: PlanArgs): Promise<ToolResult> {
  return {
    philosophy: 'Consolidated Guidance: This tool provides the mandatory standards for Phase 1. Intent First, Code Second: No code should be touched until a clear plan is documented.',
    rules: [
      'Phase Prerequisite: None. This is the start of the lifecycle.',
      'Scaffold Blueprint: Use `read_resource` on `conducks://blueprints/scaffold-structure` to plan the directory tree.',
      'Research and Note-Taking: Take mandatory, file-specific notes for important findings during research.',
      'Task Atomicity: Break requests into small, checkable items in tasks/todo.md.',
      'Boundary Check: Identify all services or modules affected by the change.',
      'Approval Required: Get explicit user approval on the plan before execution.'
    ]
  };
}

export async function handleExecute(args: ExecuteArgs): Promise<ToolResult> {
  return {
    philosophy: 'Consolidated Guidance: This tool provides the mandatory standards for Phase 2. Tactical Excellence: Write clean, modular, and maintainable code.',
    rules: [
      'Phase Prerequisite: You must have a user-approved plan recorded in tasks/todo.md before starting execution.',
      'Contract Adherence: Refer to `conducks://standards/api-contract` for any service-to-service communication.',
      'Type Protocol: Adhere to the machine-readable rules in `conducks://standards/type-protocol`.',
      'Minimal Impact: Make the smallest change necessary to achieve the objective.',
      'Elegance: Use established design patterns; avoid vibe-coding or ad-hoc hacks.',
      'Subagent Orchestration: For complex multi-file changes, delegate to specialized subagents.',
      'Zero-Pollution: Do not leave temporary logs, commented-out code, or unused variables.',
      'Continuous Refactoring: Fix technical debt in the area you are working.'
    ]
  };
}

export async function handleVerify(args: VerifyArgs): Promise<ToolResult> {
  return {
    philosophy: 'Consolidated Guidance: This tool provides the mandatory standards for Phase 3. Trust but Verify: Every change must be proven correct before submission.',
    rules: [
      'Phase Prerequisite: You must have completed the tactical execution changes from Phase 2.',
      'Verification Gate: You MUST pass the "Definition of Done" hardware gates in `conducks://blueprints/scaffold-structure`.',
      'Mandatory Validation: Run `npm run build`, `npm run lint`, and unit tests before marking task as complete.',
      'Compliance Audit: Use the audit script pattern from `conducks://scripts/compliance-check` for local verification.',
      'Automated Testing: Run existing tests or create new ones if coverage is missing.',
      'Output Verification: Compare actual terminal/UI output against expected results.',
      'Diff Analysis: Review your own diffs for unintentional side-effects.',
      'Log Audit: Check system and application logs for new errors or warnings.'
    ]
  };
}

export async function handleMemory(args: MemoryArgs): Promise<ToolResult> {
  return {
    philosophy: 'Consolidated Guidance: This tool provides the mandatory standards for Phase 4. Cross-Session Persistence: Maintain critical knowledge across sessions.',
    rules: [
      'Phase Prerequisite: You must have successfully verified your changes in Phase 3.',
      'Critical Memory Capture: Log only vital learnings or blockers in tasks/memory.md immediately.',
      'Syntax Rule: Use .md files with # and ## headers only. Normal text style for all content.',
      'Context Preservation: Document the why clearly for future agents.',
      'Session Handover: Highlight traps or states the next agent MUST know.'
    ]
  };
}

export async function handleDocumentation(args: DocumentationArgs): Promise<ToolResult> {
  return {
    philosophy: 'Consolidated Guidance: This tool provides the mandatory standards for the Documentation Lifecycle. Modular Documentation: Every service must have a standalone blueprint.',
    rules: [
      'Standard Prerequisite: You must have completed the code or architectural changes that require documentation.',
      'Standard Structure (docs/project/): architecture.md (Global) | [service]/architecture.md | [service]/data_sources.md | [service]/features/ | [service]/TO_DO/',
      'Syntax Rule: Use .md files with # and ## headers only. Normal text style for all content.',
      'Doc-Code Parity: Update the documentation surface immediately after code or contract changes.'
    ]
  };
}

export async function handleDesignStyle(args: DesignStyleArgs): Promise<ToolResult> {
  return {
    philosophy: 'Guidance: Use the Anti-Vibe Manifesto for intentional design. Enforcement: Mandatory design tokens and global structure.',
    rules: [
      'Standard Prerequisite: Working on UI-facing code or design system tokens.',
      'Mandatory Standard: You MUST use `src/app/globals.css` for all global styles and CSS variables.',
      'Enforcement: No hardcoded HEX colors or random spacing values allowed.',
      'Functional Variable List (Mandatory): Projects MUST use the following semantic naming convention in `:root`:',
      '  --color-Layer-0 (Base background)',
      '  --color-Layer-1 (Section/Card background)',
      '  --color-Layer-2 (Elevated surface/Hover background)',
      '  --color-accent (Action color)',
      '  --color-vibrant (High-attention highlights)',
      '  --color-primary (Main brand text)',
      '  --color-secondary (Muted text)',
      '  --color-tertiary (Subtle text)',
      '  --color-placeholder (Input placeholders)',
      '  --color-success | --color-error | --color-warning | --color-info',
      'Theme Hierarchy: Preserve the structure: `:root` (Functional Variables) -> `@theme` (Tailwind Tokens) -> `.utilities` (Component Logic).',
      'Visual Standards: Adhere to strict 4pt or 8pt spacing systems.',
      'Technical Integrity: Mandatory loading skeletons; ensure mobile-first responsiveness.'
    ]
  };
}

export async function handleNextBlueprint(args: NextBlueprintArgs): Promise<ToolResult> {
  return {
    philosophy: 'Guidance: Patterns for scalable architecture. Enforcement: Correct layering and isolation.',
    rules: [
      'Scale-Awareness: Choose between "Pragmatic Path" (Small projects) or "Scale Path" (Extraction readiness).',
      'Enforcement: If using "Scale Path", `lib/core` and `lib/product` layers are mandatory.',
      'Architecture Flow: Ensure strict downward paths (App -> Product -> Core).',
      'Mandatory Structure: All projects must follow the `src/` layout defined in the scaffold blueprint.',
      'i18n Guidance: Multi-language is OPTIONAL. You MUST ask the user for their preference before setting up locale-based routing.',
      'i18n Standard: If using i18n, use `src/i18n/messages` for all localization dictionaries.',
      'Feature Engine: (Scale) Operate strictly within domain verticals (`lib/product/[domain]`).',
      'Platform Engine: (Scale) Build domain-agnostic primitives in `lib/core`.'
    ]
  };
}

// --- FORMATTERS ---

function formatResult(title: string, result: ToolResult): string {
  let output = `# ${title.toUpperCase()} GUIDANCE (MANDATORY RULES)\n\n`;
  output += `## Philosophy\n${result.philosophy}\n\n`;
  output += `## Rules to Implement\n`;
  result.rules.forEach(rule => {
    output += `${rule}\n`;
  });
  return output.trim();
}

// --- TOOLS EXPORTS ---

export const conducksPlanTool: Tool<PlanArgs> = {
  name: 'plan',
  description: 'CONDUCKS PHASE 1: Planning and Research. Retrieve mandatory rules for codebase analysis, task atomicity, and scoping. MUST be used before any code is modified.',
  inputSchema: {
    type: 'object',
    properties: { task_description: { type: 'string' } },
    required: ['task_description']
  },
  handler: handlePlan,
  formatter: (res) => formatResult('Plan', res)
};

export const conducksExecuteTool: Tool<ExecuteArgs> = {
  name: 'execute',
  description: 'CONDUCKS PHASE 2: Tactical Execution. Retrieve mandatory rules for clean code, root-cause fixes, and subagent orchestration during implementation.',
  inputSchema: {
    type: 'object',
    properties: { current_focus: { type: 'string' } },
    required: ['current_focus']
  },
  handler: handleExecute,
  formatter: (res) => formatResult('Execute', res)
};

export const conducksVerifyTool: Tool<VerifyArgs> = {
  name: 'verify',
  description: 'CONDUCKS PHASE 3: Verification. Retrieve mandatory rules for automated testing, output validation, and diff audits post-implementation.',
  inputSchema: {
    type: 'object',
    properties: { changes_made: { type: 'string' } },
    required: ['changes_made']
  },
  handler: handleVerify,
  formatter: (res) => formatResult('Verify', res)
};

export const conducksMemoryTool: Tool<MemoryArgs> = {
  name: 'memory',
  description: 'CONDUCKS PHASE 4: Cross-Session Persistence. Retrieve mandatory rules for recording critical findings in tasks/memory.md to prevent context loss.',
  inputSchema: {
    type: 'object',
    properties: { important_findings: { type: 'string' } },
    required: ['important_findings']
  },
  handler: handleMemory,
  formatter: (res) => formatResult('Memory', res)
};

export const conducksDocumentationTool: Tool<DocumentationArgs> = {
  name: 'documentation',
  description: 'CONDUCKS Lifecycle Documentation. Retrieve mandatory rules for enforcing the docs/project/ structure and blueprint parity.',
  inputSchema: {
    type: 'object',
    properties: {
      service_name: { type: 'string', description: 'Name of the microservice being documented.' },
      action: { type: 'string', enum: ['create', 'update', 'audit'] }
    },
    required: ['service_name', 'action']
  },
  handler: handleDocumentation,
  formatter: (res) => formatResult('Documentation', res)
};

export const conducksDesignStyleTool: Tool<DesignStyleArgs> = {
  name: 'design_style',
  description: 'CONDUCKS Design Audit. Retrieve mandatory rules for the Anti-Vibe Manifesto, Tailwind v4 @theme, and 3-Layer Theme Mapping.',
  inputSchema: {
    type: 'object',
    properties: { context: { type: 'string' } },
    required: ['context']
  },
  handler: handleDesignStyle,
  formatter: (res) => formatResult('Design & Style', res)
};

export const conducksNextBlueprintTool: Tool<NextBlueprintArgs> = {
  name: 'next_blueprint',
  description: 'CONDUCKS Architecture Audit. Retrieve mandatory rules for Service Isolation, Manager Pattern, and i18n/Config standards.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['setup', 'feature', 'refactor'] },
      description: { type: 'string' }
    },
    required: ['action', 'description']
  },
  handler: handleNextBlueprint,
  formatter: (res) => formatResult('Next.js Blueprint', res)
};

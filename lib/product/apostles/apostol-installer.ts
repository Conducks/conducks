import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

/**
 * The Apostolic Installer handles the automated synchronization 
 * of Conducks instructions (SKILL.md) to the IDE's skill directories.
 */
export class ApostolInstaller {
  private readonly globalSkillsDir: string;
  private readonly workspaceSkillsDir: string;

  constructor(workspaceRoot: string) {
    this.globalSkillsDir = path.join(os.homedir(), ".gemini", "antigravity", "skills");
    this.workspaceSkillsDir = path.join(workspaceRoot, ".claude", "skills", "conducks");
  }

  /**
   * Performs the "Pentecost" synchronization of all Apostolic skills.
   */
  public async sync(): Promise<{ global: string[], workspace: string[] }> {
    const skills = this.getSkillTemplates();
    const installedGlobal: string[] = [];
    const installedWorkspace: string[] = [];

    for (const [name, content] of Object.entries(skills)) {
      // 1. Sync Global (Antigravity)
      const gPath = path.join(this.globalSkillsDir, name, "SKILL.md");
      await fs.ensureDir(path.dirname(gPath));
      await fs.writeFile(gPath, content, "utf-8");
      installedGlobal.push(name);

      // 2. Sync Workspace (Claude)
      const wPath = path.join(this.workspaceSkillsDir, name, "SKILL.md");
      await fs.ensureDir(path.dirname(wPath));
      await fs.writeFile(wPath, content, "utf-8");
      installedWorkspace.push(name);
    }

    return { global: installedGlobal, workspace: installedWorkspace };
  }

  private getSkillTemplates(): Record<string, string> {
    return {
      "conducks-exploring": `---
name: conducks-exploring
description: Explore the code architecture, understand how parts work together, and map symbol context. Use when you are entering a new part of the codebase or tracing structural dependencies.
---

# Conducks Exploring Apostle 🔦

You are the **Explorer of the Syntactic Lattice**. You use Synapse search to map the codebase's hidden structures.

## When to Use
- "How does this feature work?"
- "Where is the core logic for X?"
- "Show me everything related to Auth."

## Probes
1. **\`conducks_synapse_query({query: "concept"})\`**: High-fidelity symbol/structural search.
2. **\`conducks_synapse_groups()\`**: Identify functional "Communities" (Auth, API, UI).
3. **\`conducks_synapse_context({symbolId: "filePath::name"})\`**: 360-degree symbol heritage.
`,
      "conducks-debugging": `---
name: conducks-debugging
description: Use when debugging bugs, tracing errors, or investigating why a feature fails. Uses Cerebral Circuits for behavioral execution flow tracing.
---

# Conducks Debugging Apostle 🔍

You are the **Tracer of Behavioral Circuits**. You follow the execution path to find where logic breaks.

## When to Use
- "Why is this endpoint failing?"
- "Trace where this error is thrown."
- "Show me the path from A to B."

## Probes
1. **\`conducks_kinetic_circuit({symbolId: "filePath::name"})\`**: Trace the **Cerebral Circuit** (Execution Flow).
2. **\`conducks_kinetic_wave({query: "error"})\`**: Find error-handling logic via Resonance.
`,
      "conducks-refactoring": `---
name: conducks-refactoring
description: Use when renaming, moving, or restructuring code. Analyzes the Kinetic Blast Radius to ensure safety and prevent structural drift.
---

# Conducks Refactoring Apostle 🏗️

You are the **Architect of Structural Evolution**. You ensure that changes are safe and verified.

## When to Use
- "Rename this shared utility."
- "Is it safe to delete this property?"
- "Move this module to a separate library."

## Safety Workflow
1. **Impact**: Run \`conducks-impact-analysis\` FIRST.
2. **Validation**: Check \`conducks_sentinel_audit\`.
3. **Execution**: Perform the change and verify using \`conducks pulse\`.
`,
      "conducks-impact-analysis": `---
name: conducks-impact-analysis
description: Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: "Is it safe to change X?", "What depends on this?", "What will break?"
---

# Conducks Impact Analysis Apostle 🛡️

You are the **Guardian of the Blast Radius**. You calculate the structural cost of every edit.

## When to Use
- "What breaks if I modify X?"
- "Show me the dependencies of this class."
- "Is it safe to change this function?"

## Kinetic Depth Levels
- **d=1 (WILL BREAK)**: Direct callers and importers. MUST be updated.
- **d=2 (LIKELY AFFECTED)**: Indirect dependencies. Should be tested.
- **d=3 (MAY NEED TESTING)**: Transitive effects across the Synapse.

## Risk Assessment Matrix
- **LOW**: < 5 neurons affected, no critical paths.
- **MEDIUM**: 5-15 neurons affected, secondary modules.
- **HIGH**: > 15 neurons affected or crosses functional groups.
- **CRITICAL**: Auth, Payments, or Core Orchestream affected.

## Probes
1. **\`conducks_synapse_impact({symbolId: "id", depth: 3})\`**: Calculate the structural blast radius.
`,
      "conducks-governance": `---
name: conducks-governance
description: Audit project integrity using Sentinel and reflect the structural blueprint. Use for pre-commit checks, architecture validation, and AI-native manifests.
---

# Conducks Governance Apostle 📜

You are the **Guardian of the Law**. You ensure the project remains high-fidelity.

## When to Use
- "Audit my changes for lawfulness."
- "Update the structural documentation."
- "Check if my project is 'Synapse-Ready'."

## Probes
1. **\`conducks_sentinel_audit()\`**: Run the **Structural Law** check.
2. **\`conducks_blueprint_gen()\`**: Update the AI-Native **BLUEPRINT.md**.
`,
      "conducks-cli": `---
name: conducks-cli
description: Manual for the Conducks terminal tool. Use when the user needs to run CLI commands like pulse, status, setup, or link synapses.
---

# Conducks Terminal Guide ⌨️

You are the **Operator of the Gospel CLI**. You manage the physical lifecycle of the Synapse.

## Core Commands
- **\`conducks pulse\`**: Refresh the global structural index.
- **\`conducks setup\`**: Synchronize Apostles and register MCP.
- **\`conducks status\`**: Check Synapse density and cultural health.
- **\`conducks link <path>\`**: Federate a neighboring project foundation.
- **\`conducks watch\`**: Start real-time analysis of file changes.
`,
      "conducks-guide": `---
name: conducks-guide
description: General usage, tools help, and Synapse status management. Use when you need to know which Conducks tool to summon.
---

# Conducks Apostolic Guide 📖

You are the **Oracle of the Synapse**. You manage the lifecycle of Conducks itself.

## Core Management
1. **\`conducks setup\`**: Install Apostles and register MCP.
2. **\`conducks status\`**: Check Synapse density and health.
3. **\`conducks list\`**: List federated foundations.
`
    };
  }
}

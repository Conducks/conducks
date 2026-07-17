import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

import { ConducksComponent } from "@/contracts/types.js";

/** Minimal oracle contract the installer needs — injected, not pulled from the composition root. */
export interface OracleLike {
  bootstrap(): Promise<void> | void;
  listSkills(): Array<{ id: string; description: string }>;
  getSkill(id: string): { content: string } | null | undefined;
}

/**
 * The Conducks Installer
 */
export class ConducksInstaller implements ConducksComponent {
  public readonly id = 'conducks-installer';
  public readonly type = 'analyzer';
  public readonly description = 'Handles the automated synchronization of Conducks instructions (SKILL.md) to the IDE.';
  private readonly globalSkillsDir: string;
  private readonly workspaceSkillsDir: string;

  constructor(
    workspaceRoot: string,
    private readonly oracle: OracleLike,
    private readonly fileSystem: any = fs
  ) {
    this.globalSkillsDir = path.join(os.homedir(), ".gemini", "antigravity", "skills");
    this.workspaceSkillsDir = path.join(workspaceRoot, ".claude", "skills", "conducks");
  }

  /**
   * Performs the "Pentecost" synchronization of all Conducksic skills.
   */
  public async sync(): Promise<{ global: string[], workspace: string[] }> {
    // Initialize the oracle to load skills dynamically
    await this.oracle.bootstrap();

    const skills = this.getDynamicSkillTemplates();
    const installedGlobal: string[] = [];
    const installedWorkspace: string[] = [];

    for (const [name, content] of Object.entries(skills)) {
      // 1. Sync Global (Antigravity)
      const gPath = path.join(this.globalSkillsDir, name, "SKILL.md");
      await this.fileSystem.ensureDir(path.dirname(gPath));
      await this.fileSystem.writeFile(gPath, content, "utf-8");
      installedGlobal.push(name);

      // 2. Sync Workspace (Claude)
      const wPath = path.join(this.workspaceSkillsDir, name, "SKILL.md");
      await this.fileSystem.ensureDir(path.dirname(wPath));
      await this.fileSystem.writeFile(wPath, content, "utf-8");
      installedWorkspace.push(name);
    }

    return { global: installedGlobal, workspace: installedWorkspace };
  }

  private getDynamicSkillTemplates(): Record<string, string> {
    const skills: Record<string, string> = {};
    const skillList = this.oracle.listSkills();

    // Map skill IDs to the expected names used by the installer
    const skillIdMapping: Record<string, string> = {
      'conducks-debugging': 'conducks-debugging',
      'conducks-refactoring': 'conducks-refactoring',
      'conducks-guide': 'conducks-guide',
      'conducks-exploring': 'conducks-exploring',
      'conducks-governance': 'conducks-governance',
      'conducks-impact-analysis': 'conducks-impact-analysis',
      'conducks-cli': 'conducks-cli'
    };

    for (const skill of skillList) {
      const detail = this.oracle.getSkill(skill.id);
      if (detail && skillIdMapping[skill.id]) {
        const targetName = skillIdMapping[skill.id];
        skills[targetName] = `---
name: ${targetName}
description: ${skill.description}
---

${detail.content}
`;
      }
    }

    return skills;
  }
}

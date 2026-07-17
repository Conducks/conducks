import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

import { fileURLToPath } from "node:url";
import { ConducksComponent } from "@/contracts/types.js";

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../resources/skills");

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
    private readonly fileSystem: any = fs
  ) {
    this.globalSkillsDir = path.join(os.homedir(), ".gemini", "antigravity", "skills");
    this.workspaceSkillsDir = path.join(workspaceRoot, ".claude", "skills", "conducks");
  }

  /**
   * Performs the "Pentecost" synchronization of all Conducksic skills.
   */
  public async sync(): Promise<{ global: string[], workspace: string[] }> {
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

  /**
   * Reads the conducks-usage skills straight from resources/skills/*.md (static content — no
   * oracle, no MCP tool). Each file carries its description in a leading
   * `<!-- description: ... -->` comment; the rest is the skill body.
   */
  private getDynamicSkillTemplates(): Record<string, string> {
    const skills: Record<string, string> = {};
    let files: string[] = [];
    try { files = this.fileSystem.readdirSync(SKILLS_DIR).filter((f: string) => f.endsWith('.md')); } catch { return skills; }

    for (const file of files) {
      const name = file.replace(/\.md$/, '');
      const raw = this.fileSystem.readFileSync(path.join(SKILLS_DIR, file), 'utf-8');
      const descMatch = raw.match(/<!--\s*description:\s*(.+?)\s*-->/);
      const description = descMatch ? descMatch[1] : `Conducks skill: ${name}`;
      const body = raw.replace(/<!--\s*description:[\s\S]*?-->\s*/, '').trimStart();
      skills[name] = `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
    }

    return skills;
  }
}

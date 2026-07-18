import fs from "fs-extra";
import path from "node:path";

import { fileURLToPath } from "node:url";
import { ConducksComponent } from "@/contracts/types.js";

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../resources/skills");

/**
 * The Conducks Installer
 */
export class ConducksInstaller implements ConducksComponent {
  public readonly id = 'conducks-installer';
  public readonly type = 'analyzer';
  public readonly description = 'Syncs the conducks-usage skills (SKILL.md) into the workspace .claude/skills/.';
  private readonly workspaceSkillsDir: string;

  constructor(
    workspaceRoot: string,
    private readonly fileSystem: any = fs
  ) {
    // ONE source (resources/skills/), ONE target: <workspace>/.claude/skills/<name>/SKILL.md.
    // Flat — Claude Code discovers only direct children of skills/; the old extra conducks/
    // nesting broke discovery. Claude-only by decision (ADR 0006); the old Antigravity global
    // target (~/.gemini/antigravity/skills) is dropped — multi-IDE targets return only when a
    // second consumer actually exists.
    this.workspaceSkillsDir = path.join(workspaceRoot, ".claude", "skills");
  }

  /**
   * Syncs all conducks-usage skills into the workspace.
   */
  public async sync(): Promise<{ workspace: string[] }> {
    const skills = this.getDynamicSkillTemplates();
    const installedWorkspace: string[] = [];

    for (const [name, content] of Object.entries(skills)) {
      const wPath = path.join(this.workspaceSkillsDir, name, "SKILL.md");
      await this.fileSystem.ensureDir(path.dirname(wPath));
      await this.fileSystem.writeFile(wPath, content, "utf-8");
      installedWorkspace.push(name);
    }

    return { workspace: installedWorkspace };
  }

  /**
   * Removes the conducks-usage skills this installer owns from the workspace .claude/skills/.
   * Scoped to the names in resources/skills/ — never touches skills conducks did not install.
   * Symmetric with sync(): setup installs them, uninstall removes them (no orphans left behind).
   */
  public async remove(): Promise<{ removed: string[] }> {
    const owned = Object.keys(this.getDynamicSkillTemplates());
    const removed: string[] = [];
    for (const name of owned) {
      const dir = path.join(this.workspaceSkillsDir, name);
      if (this.fileSystem.existsSync(dir)) {
        await this.fileSystem.remove(dir);
        removed.push(name);
      }
    }
    return { removed };
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

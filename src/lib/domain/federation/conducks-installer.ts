import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

import { fileURLToPath } from "node:url";
import { ConducksComponent } from "@/contracts/types.js";

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../resources/skills");

export type SkillScope = "global" | "local";

/**
 * Skills conducks used to ship and no longer does. Sync deletes these wherever it finds them.
 *
 * This is the one exception to "sync never deletes", and it has to be: a retired skill keeps
 * loading, keeps costing tokens, and keeps teaching guidance that was merged or dropped for a
 * reason. Leaving it is strictly worse than removing it. The list is explicit rather than
 * "anything conducks-* we do not ship", so a skill the user wrote themselves is never caught.
 */
const RETIRED_SKILLS = [
  // merged into conducks-workflows (2026-07-26)
  "conducks-debugging", "conducks-exploring", "conducks-governance",
  "conducks-impact-analysis", "conducks-refactoring",
];

export interface SyncReport {
  scope: SkillScope;
  dir: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Skills conducks no longer ships, deleted from this scope. */
  retired: string[];
}

/**
 * The Conducks Installer
 *
 * Conducks is a platform, not a per-repo dependency: the skills describe how to drive conducks
 * itself, so the natural home is `~/.claude/skills` — install once, every project sees it. A repo
 * can still pin its own copy (`--local`) when it needs to differ.
 *
 * SYNC NEVER DELETES. Names are stable, so an old copy is refreshed in place rather than removed and
 * re-created: an install that deletes first can leave a project with nothing if it fails halfway,
 * and deleting a directory the user may have edited is not the installer's call. Only the explicit
 * `uninstall` removes anything.
 *
 * Any scope that ALREADY holds conducks skills is refreshed on every sync, whether or not it was
 * asked for. A stale copy that keeps working is worse than no copy — it is guidance from an older
 * version that reads as current (CONDUCKS-15).
 */
export class ConducksInstaller implements ConducksComponent {
  public readonly id = 'conducks-installer';
  public readonly type = 'analyzer';
  public readonly description = 'Syncs the conducks-usage skills (SKILL.md) into ~/.claude/skills (global) and/or <project>/.claude/skills (local).';
  private readonly dirs: Record<SkillScope, string>;

  constructor(
    workspaceRoot: string,
    private readonly fileSystem: any = fs
  ) {
    // ONE source (resources/skills/), flat targets: <root>/.claude/skills/<name>/SKILL.md.
    // Flat because Claude Code discovers only direct children of skills/; the old extra conducks/
    // nesting broke discovery. Claude-only by decision (ADR 0006).
    this.dirs = {
      global: path.join(os.homedir(), ".claude", "skills"),
      local: path.join(workspaceRoot, ".claude", "skills"),
    };
  }

  public dirFor(scope: SkillScope): string { return this.dirs[scope]; }

  /** True when this scope already holds at least one skill conducks owns — so it must be kept fresh. */
  public isInstalled(scope: SkillScope): boolean {
    return Object.keys(this.getDynamicSkillTemplates())
      .some(name => this.fileSystem.existsSync(path.join(this.dirs[scope], name, "SKILL.md")));
  }

  /**
   * Writes every skill into each requested scope, plus any scope already holding an older copy.
   * Reports created / updated / unchanged so a no-op install says so instead of claiming work.
   */
  public async sync(scopes: SkillScope[] = ["global"]): Promise<SyncReport[]> {
    const targets = new Set<SkillScope>(scopes);
    for (const scope of ["global", "local"] as SkillScope[])
      if (this.isInstalled(scope)) targets.add(scope);

    const skills = this.getDynamicSkillTemplates();
    const reports: SyncReport[] = [];

    for (const scope of targets) {
      const report: SyncReport = { scope, dir: this.dirs[scope], created: [], updated: [], unchanged: [], retired: [] };
      for (const name of RETIRED_SKILLS) {
        const dir = path.join(this.dirs[scope], name);
        if (this.fileSystem.existsSync(dir)) {
          await this.fileSystem.remove(dir);
          report.retired.push(name);
        }
      }
      for (const [name, content] of Object.entries(skills)) {
        const file = path.join(this.dirs[scope], name, "SKILL.md");
        const existed = this.fileSystem.existsSync(file);
        let same = false;
        if (existed) {
          try { same = this.fileSystem.readFileSync(file, "utf-8") === content; } catch { same = false; }
        }
        if (same) { report.unchanged.push(name); continue; }
        await this.fileSystem.ensureDir(path.dirname(file));
        await this.fileSystem.writeFile(file, content, "utf-8");
        (existed ? report.updated : report.created).push(name);
      }
      reports.push(report);
    }
    return reports;
  }

  /**
   * Removes the conducks-usage skills this installer owns. Scoped to the names in resources/skills/
   * — never touches skills conducks did not install. Symmetric with sync(): setup installs them,
   * uninstall removes them (no orphans left behind). Defaults to every scope that has them, because
   * a partial uninstall leaves exactly the stale copy the sync rule exists to prevent.
   */
  public async remove(scopes?: SkillScope[]): Promise<Array<{ scope: SkillScope; dir: string; removed: string[] }>> {
    const targets = scopes ?? (["global", "local"] as SkillScope[]).filter(s => this.isInstalled(s));
    const owned = [...Object.keys(this.getDynamicSkillTemplates()), ...RETIRED_SKILLS];
    const out: Array<{ scope: SkillScope; dir: string; removed: string[] }> = [];

    for (const scope of targets) {
      const removed: string[] = [];
      for (const name of owned) {
        const dir = path.join(this.dirs[scope], name);
        if (this.fileSystem.existsSync(dir)) {
          await this.fileSystem.remove(dir);
          removed.push(name);
        }
      }
      out.push({ scope, dir: this.dirs[scope], removed });
    }
    return out;
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

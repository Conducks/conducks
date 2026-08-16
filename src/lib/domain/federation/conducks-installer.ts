import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

import { fileURLToPath } from "node:url";

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
  // merged into `conducks` (2026-08-16) — all three answered one question, "how do I use conducks",
  // and split it across three loads: what it is, which command, which probe sequence.
  "conducks-cli", "conducks-guide", "conducks-workflows",
];

export interface SyncReport {
  scope: SkillScope;
  dir: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Skills conducks no longer ships, deleted from this scope. */
  retired: string[];
  /**
   * Skills removed because the GLOBAL copy is authoritative and this one duplicated it. Only ever
   * populated for the `local` scope — see the class doc for why a duplicate is a defect.
   */
  superseded: string[];
}

/**
 * The Conducks Installer
 *
 * Conducks is a platform, not a per-repo dependency: the skills describe how to drive conducks
 * itself, so there is ONE home — `~/.claude/skills`. Install once, every project sees it.
 *
 * GLOBAL IS THE ONLY SCOPE (ADR 0029). A repo-local copy is not a pin, it is a duplicate: Claude Code
 * discovers `~/.claude/skills` AND `<repo>/.claude/skills`, so a project holding both loads every
 * skill twice and pays for the same guidance twice. Nothing in these skills is project-specific —
 * they describe conducks' own CLI and tools — so there is nothing a local copy could legitimately
 * differ on.
 *
 * SYNC DOES NOT DELETE, with two deliberate exceptions: a RETIRED skill (see `RETIRED_SKILLS`) and a
 * SUPERSEDED local copy. Both are cases where leaving the file is strictly worse than removing it —
 * one teaches guidance that was dropped, the other double-loads. Everything else is refreshed in
 * place, because an install that deletes first can leave a project with nothing if it fails halfway.
 * Only the `local` scope is ever pruned this way; a global copy is the authority, never the duplicate.
 *
 * The global scope is refreshed on every sync whether or not the caller asked. A stale copy that keeps
 * working is worse than no copy — it is guidance from an older version that reads as current
 * (CONDUCKS-15).
 */
export class ConducksInstaller {
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
   * Installs every skill globally, and prunes a repo-local copy if one exists.
   *
   * Reports created / updated / unchanged so a no-op install says so instead of claiming work. The
   * local report is only returned when there was actually something to prune — an untouched project
   * gets one report, not two.
   */
  public async sync(): Promise<SyncReport[]> {
    const skills = this.getDynamicSkillTemplates();
    const reports: SyncReport[] = [this.emptyReport("global")];
    const global = reports[0];

    await this.pruneRetired("global", global);

    for (const [name, content] of Object.entries(skills)) {
      const file = path.join(this.dirs.global, name, "SKILL.md");
      const existed = this.fileSystem.existsSync(file);
      let same = false;
      if (existed) {
        try { same = this.fileSystem.readFileSync(file, "utf-8") === content; } catch { same = false; }
      }
      if (same) { global.unchanged.push(name); continue; }
      await this.fileSystem.ensureDir(path.dirname(file));
      await this.fileSystem.writeFile(file, content, "utf-8");
      (existed ? global.updated : global.created).push(name);
    }

    // A local copy is a duplicate, not a pin: it double-loads against the global one. Remove the
    // skills conducks owns and leave everything else in that directory alone.
    const local = this.emptyReport("local");
    await this.pruneRetired("local", local);
    for (const name of Object.keys(skills)) {
      const dir = path.join(this.dirs.local, name);
      if (this.fileSystem.existsSync(dir)) {
        await this.fileSystem.remove(dir);
        local.superseded.push(name);
      }
    }
    if (local.superseded.length || local.retired.length) reports.push(local);

    return reports;
  }

  private emptyReport(scope: SkillScope): SyncReport {
    return { scope, dir: this.dirs[scope], created: [], updated: [], unchanged: [], retired: [], superseded: [] };
  }

  private async pruneRetired(scope: SkillScope, report: SyncReport): Promise<void> {
    for (const name of RETIRED_SKILLS) {
      const dir = path.join(this.dirs[scope], name);
      if (this.fileSystem.existsSync(dir)) {
        await this.fileSystem.remove(dir);
        report.retired.push(name);
      }
    }
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

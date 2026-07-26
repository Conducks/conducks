import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Conducks — Project Registry
 *
 * The list of project roots that use conducks, at `~/.conducks/projects.json` (todo17 Phase 2).
 *
 * Without it every project is an island: nothing knows which projects exist, so nothing can answer
 * "which of my repos has a graph that has fallen behind its code". `conducks setup` is the natural
 * place to record a root, because it is the one command every project runs first.
 *
 * `~/.conducks/` is the same global home the update notice already uses, and the sibling of the
 * `~/.claude/skills` the installer writes to (ADR 0029) — one machine-level home per concern.
 *
 * Deliberately a plain JSON file, not a database: it is a short list a human may want to read, hand-edit
 * or delete, and a corrupt or missing file must degrade to "no projects" rather than an error, because
 * nothing else in conducks depends on it.
 */

export interface RegisteredProject {
  /** Absolute path. The identity of a project — one entry per root, no duplicates. */
  root: string;
  name: string;
  /** Epoch ms of the first `conducks setup` in this root. */
  registeredAt: number;
  /** Epoch ms of the most recent `conducks setup`. Answers "is this project still in use". */
  lastSetupAt: number;
}

interface RegistryFile {
  version: 1;
  projects: RegisteredProject[];
}

export class ProjectRegistry {
  private readonly filePath: string;

  /** `home` is injectable so tests never touch the real `~`. */
  constructor(home: string = os.homedir()) {
    this.filePath = path.join(home, ".conducks", "projects.json");
  }

  public get path(): string { return this.filePath; }

  /**
   * Every registered project. Returns [] for a missing, unreadable or malformed file — a registry
   * nobody has written to yet is the normal first-run state, not a failure.
   */
  public list(): RegisteredProject[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as RegistryFile;
      if (!Array.isArray(parsed?.projects)) return [];
      return parsed.projects.filter(p => typeof p?.root === "string" && p.root.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Records a root, or refreshes `lastSetupAt` if it is already there. Idempotent: running `setup`
   * twice must not produce two entries.
   *
   * Returns whether this was a new project, so the caller can say "registered" rather than
   * "registered" every single time.
   */
  public register(root: string, name?: string): { added: boolean; total: number } {
    const absolute = path.resolve(root);
    const projects = this.list();
    const now = Date.now();

    const existing = projects.find(p => path.resolve(p.root) === absolute);
    if (existing) {
      existing.lastSetupAt = now;
      this.write(projects);
      return { added: false, total: projects.length };
    }

    projects.push({
      root: absolute,
      name: name ?? path.basename(absolute),
      registeredAt: now,
      lastSetupAt: now,
    });
    this.write(projects);
    return { added: true, total: projects.length };
  }

  /** Drops a root. Used by `uninstall`, and by the monitor when a root no longer exists on disk. */
  public forget(root: string): boolean {
    const absolute = path.resolve(root);
    const projects = this.list();
    const remaining = projects.filter(p => path.resolve(p.root) !== absolute);
    if (remaining.length === projects.length) return false;
    this.write(remaining);
    return true;
  }

  /**
   * Registered roots that no longer exist on disk. Reported, never auto-removed: a missing root is
   * usually an unmounted volume or a moved checkout, and silently forgetting it loses the record of a
   * project the user still has.
   */
  public missingRoots(): RegisteredProject[] {
    return this.list().filter(p => !fs.existsSync(p.root));
  }

  private write(projects: RegisteredProject[]): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload: RegistryFile = { version: 1, projects };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2) + "\n");
    } catch {
      // A registry that cannot be written costs cross-project monitoring, nothing else. `setup` must
      // not fail because a home directory is read-only.
    }
  }
}

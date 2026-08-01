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

/**
 * The cheap activity signature of a project: the mtimes of `.git/HEAD` and `.git/index`.
 *
 * Two `stat` calls, and they are the whole point. A registered project is ASKED whether anything
 * happened, never WATCHED for it (ADR 0036): twenty registered projects cost forty syscalls when
 * somebody asks a question, instead of twenty filesystem watchers and a background hash scan on a
 * timer. A watcher exists because a session is using a project right now, and for no other reason.
 *
 * These two files are the right pair because between them they move on everything conducks cares
 * about. `HEAD` moves on commit, checkout, branch switch, rebase and merge; `index` moves on `add`,
 * on `status` refreshing a stat cache, and on the same operations. Neither moving means no commit
 * and no staging happened — it does NOT mean the working tree is untouched, which is exactly why
 * this is a cheap NEGATIVE filter and never a freshness proof. The expensive, correct answer is
 * still the content hashes; this only decides whether it is worth computing.
 */
export interface GitActivity {
  /** Epoch ms mtime of `HEAD`. */
  head: number;
  /** Epoch ms mtime of `index`, or 0 in a repository that has never staged anything. */
  index: number;
}

/**
 * Resolve the real git directory for a root.
 *
 * `.git` is a DIRECTORY in a normal clone and a FILE containing `gitdir: <path>` in a linked
 * worktree or a submodule. This repository is itself checked out as worktrees, so reading
 * `<root>/.git/HEAD` directly would have returned "not a git repository" for every agent working in
 * one — the probe would have answered "cannot tell" for the exact projects most likely to be active.
 * A linked worktree's gitdir holds its OWN `HEAD` and `index`, which is what makes this correct
 * rather than a workaround: per-worktree state is what we want to observe.
 */
function resolveGitDir(root: string): string | null {
  const dotGit = path.join(root, ".git");
  let stat: fs.Stats;
  try { stat = fs.statSync(dotGit); } catch { return null; }
  if (stat.isDirectory()) return dotGit;

  try {
    const pointer = fs.readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
    if (!pointer) return null;
    // Relative pointers are relative to the root that contains the `.git` file.
    return path.isAbsolute(pointer) ? pointer : path.resolve(root, pointer);
  } catch {
    return null;
  }
}

/**
 * Ask a project whether anything git-visible has happened, without watching it.
 *
 * `null` means "cannot tell" — not a git repository, or an unreadable one. A caller must treat that
 * as POSSIBLY CHANGED and fall back to the expensive answer, because a probe that cannot see is not
 * a probe that saw nothing.
 */
export function probeGitActivity(root: string): GitActivity | null {
  const gitDir = resolveGitDir(root);
  if (!gitDir) return null;

  let head: number;
  try { head = fs.statSync(path.join(gitDir, "HEAD")).mtimeMs; } catch { return null; }

  // A repository with no index yet is valid and normal — nothing has ever been staged. That is a
  // real answer (0), not a failure, so it must not collapse the whole probe to "cannot tell".
  let index = 0;
  try { index = fs.statSync(path.join(gitDir, "index")).mtimeMs; } catch { /* never staged */ }

  return { head, index };
}

/**
 * True when two probes prove nothing moved.
 *
 * Equality is defined here, once, because the null case is the part that gets it wrong: two
 * "cannot tell" readings are NOT evidence of sameness, so this is false whenever either side is
 * null. The failure mode of the alternative is silent and permanent — a project that is not a git
 * repository would be declared unchanged forever and never re-examined.
 */
export function sameGitActivity(a: GitActivity | null, b: GitActivity | null): boolean {
  if (!a || !b) return false;
  return a.head === b.head && a.index === b.index;
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

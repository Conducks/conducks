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

/**
 * When a lock counts as abandoned, and how long `register`/`forget` wait for one.
 *
 * The wait is LONGER than the stale time, so a lock left by a process that died is always taken over
 * before the wait runs out. A wait that does run out therefore means a holder that is still there,
 * and nothing is written past it (state-machine audit round 2, Q-05-3).
 */
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = LOCK_STALE_MS + 2_000;

/** A locked read-modify-write that did not run, because another process still holds the lock. */
const NOT_LOCKED = Symbol("not-locked");

export class ProjectRegistry {
  private readonly filePath: string;
  private readonly waitMs: number;
  private readonly staleMs: number;

  /** `home` and the lock timing are injectable so tests never touch the real `~` or wait seconds. */
  constructor(home: string = os.homedir(), timing: { waitMs?: number; staleMs?: number } = {}) {
    this.filePath = path.join(home, ".conducks", "projects.json");
    this.staleMs = timing.staleMs ?? LOCK_STALE_MS;
    this.waitMs = timing.waitMs ?? LOCK_WAIT_MS;
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
   * "registered" every single time — and whether the file was actually WRITTEN. The write still never
   * throws (setup must not fail over a read-only home), but `added: true` alone used to read as
   * success when nothing reached the disk (state-machine audit P-05-8).
   */
  public register(root: string, name?: string): { added: boolean; total: number; written: boolean } {
    const result = this.locked(() => this.registerUnlocked(root, name));
    if (result === NOT_LOCKED) return { added: false, total: this.list().length, written: false };
    return result;
  }

  private registerUnlocked(root: string, name?: string): { added: boolean; total: number; written: boolean } {
    const absolute = path.resolve(root);
    const projects = this.readForWrite();
    // A file that exists and cannot be read, or that a newer conducks wrote, is not an empty list:
    // writing would replace every project in it with this one (state-machine audit round 2, Q-05-4).
    if (projects === null) return { added: false, total: 0, written: false };
    const now = Date.now();

    const existing = projects.find(p => path.resolve(p.root) === absolute);
    if (existing) {
      existing.lastSetupAt = now;
      return { added: false, total: projects.length, written: this.write(projects) };
    }

    projects.push({
      root: absolute,
      name: name ?? path.basename(absolute),
      registeredAt: now,
      lastSetupAt: now,
    });
    return { added: true, total: projects.length, written: this.write(projects) };
  }

  /**
   * Drops a root. `uninstall` calls it for the project it runs in (state-machine audit P-05-6); the
   * monitor deliberately REPORTS a missing root rather than forgetting it (see `missingRoots`).
   */
  /**
   * `removed`: the root was registered. `written`: the file no longer lists it. `uninstall` printed
   * "Removed ... from the project registry" on the first alone — the write's result was dropped — so a
   * read-only home kept the entry under a message saying it was gone (round 2, Q-05-5 / Q-08-5).
   */
  public forget(root: string): { removed: boolean; written: boolean } {
    const result = this.locked(() => this.forgetUnlocked(root));
    if (result === NOT_LOCKED) return { removed: this.lists(root), written: false };
    return result;
  }

  private forgetUnlocked(root: string): { removed: boolean; written: boolean } {
    const absolute = path.resolve(root);
    const projects = this.readForWrite();
    if (projects === null) return { removed: this.lists(root), written: false };
    const remaining = projects.filter(p => path.resolve(p.root) !== absolute);
    if (remaining.length === projects.length) return { removed: false, written: false };
    return { removed: true, written: this.write(remaining) };
  }

  private lists(root: string): boolean {
    const absolute = path.resolve(root);
    return this.list().some(p => path.resolve(p.root) === absolute);
  }

  /**
   * The list to modify, or null when modifying it would destroy something.
   *
   * `list()` reads every failure as "no projects", which is right for a reader and wrong for a writer:
   * an existing file that cannot be read (EACCES, EIO) or that a newer conducks wrote was replaced by a
   * list holding only the one change. A missing file is empty; a malformed one is backed up by `write`
   * and replaced, as before (P-05-9).
   */
  private readForWrite(): RegisteredProject[] | null {
    let raw: string;
    try { raw = fs.readFileSync(this.filePath, "utf8"); }
    catch (err) {
      // Missing, or a path that cannot hold one (a FILE where `.conducks/` should be): empty.
      const code = (err as NodeJS.ErrnoException).code;
      return code === "ENOENT" || code === "ENOTDIR" ? [] : null;
    }
    try {
      const parsed = JSON.parse(raw) as RegistryFile;
      if (typeof parsed?.version === "number" && parsed.version > 1) return null;
    } catch { /* malformed: read as empty, and backed up before it is replaced */ }
    return this.list();
  }

  /**
   * Registered roots that no longer exist on disk. Reported, never auto-removed: a missing root is
   * usually an unmounted volume or a moved checkout, and silently forgetting it loses the record of a
   * project the user still has.
   */
  public missingRoots(): RegisteredProject[] {
    return this.list().filter(p => !fs.existsSync(p.root));
  }

  /** True when the file was written. */
  private write(projects: RegisteredProject[]): boolean {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.backUpIfMalformed();
      const payload: RegistryFile = { version: 1, projects };
      // Written beside and renamed over, so a concurrent reader never sees half a file.
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n");
      try { fs.renameSync(tmp, this.filePath); }
      catch (err) {
        // A failed rename left the temp file behind, one per process that hit it (round 2, Q-05-6).
        try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
        throw err;
      }
      return true;
    } catch {
      // A registry that cannot be written costs cross-project monitoring, nothing else. `setup` must
      // not fail because a home directory is read-only.
      return false;
    }
  }

  /**
   * Runs one read-modify-write of the registry while holding `projects.json.lock`.
   *
   * Two `setup` runs at the same moment — two agents in two projects — each read the list, appended
   * their own root and wrote it back, so one project silently vanished (state-machine audit P-05-7;
   * measured: three processes registering 60 roots each kept 28 of 180). The lock is a file created
   * with `wx`, which only one process can win, and it holds a token unique to its holder.
   *
   * The token makes both hand-overs safe (state-machine audit round 2):
   *   - TAKEOVER of an abandoned lock (older than the stale time) moves it aside and checks the token.
   *     Stat-then-remove deleted whatever lock was there by then — possibly a fresh one another process
   *     had just taken over — and both went on to write (Q-05-1). A lock that turns out not to be the
   *     abandoned one is put back.
   *   - RELEASE removes the lock only while it still holds our token. It removed whatever was there,
   *     including the lock of a process that had taken ours over (Q-05-2).
   *
   * A wait that runs out returns NOT_LOCKED and nothing is written: the wait outlasts the stale time,
   * so only a live holder can still be in the way, and writing past it is the lost update this lock
   * exists to prevent (Q-05-3). Only when no lock can be CREATED at all — an unwritable home — does the
   * write go ahead unlocked, and there it reports `written: false` on its own.
   */
  private locked<T>(fn: () => T): T | typeof NOT_LOCKED {
    const lock = `${this.filePath}.lock`;
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let held = false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const deadline = Date.now() + this.waitMs;
      while (!held) {
        try { fs.writeFileSync(lock, token, { flag: "wx" }); held = true; break; }
        catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") break; }
        this.takeOverIfAbandoned(lock);
        if (Date.now() > deadline) return NOT_LOCKED;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    } catch { /* no lock to be had: write unlocked */ }
    try { return fn(); } finally { if (held) this.release(lock, token); }
  }

  /** Removes `lock` if it is older than the stale time — and only the lock that was seen to be. */
  private takeOverIfAbandoned(lock: string): void {
    // Token FIRST, age second: a lock replaced after the token was read fails the comparison below,
    // and one replaced before the age check is fresh and left alone.
    let seen: string;
    try {
      seen = fs.readFileSync(lock, "utf8");
      if (Date.now() - fs.statSync(lock).mtimeMs <= this.staleMs) return;
    } catch { return; }   // gone already: the next `wx` decides
    const aside = `${lock}.${process.pid}.${Math.random().toString(36).slice(2)}`;
    try { fs.renameSync(lock, aside); } catch { return; }   // another process moved it first
    let moved: string | null = null;
    try { moved = fs.readFileSync(aside, "utf8"); } catch { /* unreadable: not provably the abandoned one */ }
    if (moved !== seen) {
      // Another process took the abandoned lock over between our check and our move: give it back.
      try { fs.linkSync(aside, lock); } catch { /* a third holder exists already; it keeps the lock */ }
    }
    try { fs.rmSync(aside, { force: true }); } catch { /* best effort */ }
  }

  private release(lock: string, token: string): void {
    try { if (fs.readFileSync(lock, "utf8") === token) fs.rmSync(lock, { force: true }); }
    catch { /* gone, or unreadable: not ours to remove */ }
  }

  /**
   * A file that exists but does not parse is a hand-edit gone wrong, not an empty registry. `list()`
   * reads it as no projects (nothing else may fail over it), so the next write would replace it —
   * kept as `.bak` first, as the MCP configurator does for the files it rewrites (P-05-9).
   */
  private backUpIfMalformed(): void {
    let raw: string;
    try { raw = fs.readFileSync(this.filePath, "utf8"); } catch { return; }
    try {
      if (Array.isArray((JSON.parse(raw) as RegistryFile)?.projects)) return;
    } catch { /* malformed: fall through */ }
    fs.writeFileSync(`${this.filePath}.bak`, raw);
  }
}

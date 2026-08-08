import { SOURCE_EXTENSIONS } from "@/contracts/source-extensions.js";
import { readWatcherLiveness, type WatcherLiveness } from "@/lib/domain/evolution/watcher-liveness.js";
import { moduleHashOf } from "@/lib/domain/analysis/module-hash.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { FileHashGate } from "@/lib/core/persistence/file-hash-gate.js";
import { classifyFreshness, isStale } from "@/lib/core/persistence/freshness.js";
import { buildBoard } from "@/lib/domain/analysis/docs-board.js";
import { ProjectRegistry, type RegisteredProject } from "@/lib/domain/federation/project-registry.js";
import { branchMismatch } from "@/lib/core/git/chronicle-interface.js";

/**
 * Conducks — Cross-Project Monitor
 *
 * One report covering every registered project: has the graph fallen behind the code, do the docs
 * violate the grammar, and which modules changed under an architecture note that still describes the
 * old shape (todo17 Phases 2 and 3).
 *
 * REPORT ONLY. It never analyzes, never writes to a vault, never edits a doc and never fails a build —
 * an always-on process that does any of those gets turned off, and then it reports nothing at all. Every
 * vault is opened READ_ONLY, and a project that cannot be read becomes a line in the report rather than
 * an exception.
 *
 * Freshness comes from the `file_hashes` table the pulse seeds (todo17 Phase 1), not from a timestamp.
 * A timestamp only says "the code was touched since the pulse", which is true after any `git checkout`
 * or formatter run; comparing content hashes says WHICH files actually differ, and that is what makes
 * the per-module answer possible at all.
 */

export interface ModuleDrift {
  /** Module path relative to the project root, e.g. `src/lib/core/parsing`. */
  module: string;
  changedFiles: number;
  /** The authored note describing this module, if one exists. */
  moduleDoc?: string;
  /** True when the note exists and has not been reviewed against this exact code. */
  needsDocReview: boolean;
}

export interface ProjectReport {
  name: string;
  root: string;
  /** Set when nothing else in this report could be computed. */
  unavailable?: string;
  graph: {
    analyzed: boolean;
    /** Files whose content differs from what the vault last analyzed. */
    changed: number;
    /**
     * Files on disk the vault has never analyzed. A COVERAGE gap, not staleness — `analyze` is
     * incremental by mtime, so a file untouched since before the last pulse never enters a wave.
     */
    added: number;
    /** Files the vault knows that are gone from disk. */
    removed: number;
    tracked: number;
    /** The graph holds something WRONG: changed or removed. Never set by `added` alone. */
    stale: boolean;
  };
  docs: {
    violations: number;
    warnings: number;
    unlinkedDecisions: number;
  };
  /**
   * Branch identity — a freshness dimension the hashes cannot express (ADR 0035, todo20#P1).
   *
   * A vault pulsed on one branch while the checkout is on another is not stale in the file-hash
   * sense. Every hash can match, `changed` can be 0, `graph.stale` can be false — and every answer
   * the graph gives is still about a tree that is not on disk. So it is its OWN line, never folded
   * into the staleness count.
   */
  branch: {
    /** Branch of the latest pulse. Null: pulsed on a detached HEAD, or a vault older than the column. */
    vault: string | null;
    /** Branch the checkout is on now. Null: detached HEAD, or no repository at all. */
    checkout: string | null;
    /** Both sides are a real branch name and they differ. Null on either side is NOT a mismatch. */
    mismatch: boolean;
  };
  drift: ModuleDrift[];
  /**
   * Whether anything is keeping this project's graph fresh.
   *
   * Staleness alone cannot distinguish "nobody watches this project" from "the watcher died" — both
   * render as drift, and they mean opposite things (todo21#P3). One is a configuration choice; the
   * other is an incident nobody was told about.
   */
  watcher: WatcherLiveness;
}

/** Extensions the monitor hashes. Matching the graph exactly is not required — it needs a stable, cheap set. */


export class ProjectMonitor {
  constructor(private readonly registry: ProjectRegistry = new ProjectRegistry()) {}

  /** Every registered project, in registration order. */
  public async reportAll(): Promise<ProjectReport[]> {
    const out: ProjectReport[] = [];
    for (const project of this.registry.list()) {
      out.push(await this.report(project));
    }
    return out;
  }

  public async report(project: RegisteredProject): Promise<ProjectReport> {
    const base: ProjectReport = {
      name: project.name,
      root: project.root,
      graph: { analyzed: false, changed: 0, added: 0, removed: 0, tracked: 0, stale: false },
      docs: { violations: 0, warnings: 0, unlinkedDecisions: 0 },
      // Read here for the same reason as `watcher`: it survives every early return, and a project
      // with no repository legitimately answers null on both sides.
      branch: { vault: null, checkout: this.checkoutBranch(project.root), mismatch: false },
      drift: [],
      // Read here, in `base`, so it survives every early return below: a project whose vault is
      // unreadable is exactly one where "is anything watching it?" is worth knowing.
      watcher: readWatcherLiveness(project.root),
    };

    if (!fs.existsSync(project.root)) {
      return { ...base, unavailable: "root does not exist on disk" };
    }

    // Docs first: it needs no vault, so a project that has never been analyzed still gets a docs answer.
    try {
      const board = buildBoard(project.root);
      base.docs = {
        violations: board.lint.reduce((n, l) => n + l.errs.length, 0),
        warnings: board.warns.reduce((n, w) => n + w.errs.length, 0),
        unlinkedDecisions: board.unlinked.length,
      };
    } catch { /* no docs/ is not a problem to report */ }

    const vault = path.join(project.root, ".conducks", "conducks-synapse.db");
    if (!fs.existsSync(vault)) return base;                    // analyzed: false

    const persistence = new SynapsePersistence(project.root, true);   // READ_ONLY
    try {
      const stored = await persistence.getAllFileHashes();
      const onDisk = this.sourceFiles(project.root);
      base.graph.analyzed = true;
      base.graph.tracked = stored.size;

      // The LATEST pulse: that is the branch the rows currently in the vault came from. An older
      // pulse's branch describes rows that have since been swept.
      try {
        const rows = await persistence.query<{ branch: string | null }>(
          'SELECT branch FROM pulses ORDER BY timestamp DESC LIMIT 1'
        );
        base.branch.vault = rows[0]?.branch ?? null;
      } catch { /* a vault older than the `branch` column simply has no answer */ }
      base.branch.mismatch = branchMismatch(base.branch.vault, base.branch.checkout) !== null;

      // The shared engine (ADR 0036, todo21#P3). This classification used to live inline here and
      // the watcher had no way to ask for it, which is why a watcher started after edits was blind
      // to every one of them. Both surfaces now read the same answer.
      const fresh = classifyFreshness(
        stored, onDisk, SOURCE_EXTENSIONS,
        abs => { try { return fs.readFileSync(abs, "utf8"); } catch { return null; } },
        abs => fs.existsSync(abs),
        p => path.extname(p),
      );
      base.graph.changed = fresh.changed.length;
      base.graph.added = fresh.added.length;
      base.graph.removed = fresh.removed.length;
      base.graph.stale = isStale(fresh);
      base.drift = this.moduleDrift(project.root, [...fresh.added, ...fresh.changed]);
    } catch (err: any) {
      return { ...base, unavailable: `vault unreadable: ${err?.message ?? err}` };
    } finally {
      try { await persistence.close(); } catch { /* nothing to release */ }
    }

    return base;
  }

  /**
   * Groups changed files by the deepest module that has an authored note, so the report says
   * "core/parsing changed" rather than listing forty files.
   *
   * The note path mirrors the source path — `src/lib/core/parsing` →
   * `docs/modules/core/parsing/MODULE.md` — so the mapping is a path translation, with the
   * `src/lib/` prefix dropped because the notes are organised by layer, not by source root.
   */
  private moduleDrift(root: string, changedPaths: string[]): ModuleDrift[] {
    const byModule = new Map<string, number>();

    for (const abs of changedPaths) {
      const rel = path.relative(root, abs);
      const dir = path.dirname(rel);
      byModule.set(dir, (byModule.get(dir) ?? 0) + 1);
    }

    const reviews = this.readReviews(root);
    const out: ModuleDrift[] = [];

    for (const [module, changedFiles] of [...byModule.entries()].sort((a, b) => b[1] - a[1])) {
      const doc = this.findModuleDoc(root, module);
      let needsDocReview = false;
      if (doc) {
        // A dismissal is bound to the code it was checked against: the combined hash of the module's
        // files at the time. Change the module again and the hash moves, so the flag comes back —
        // "checked, still accurate" cannot silence a note forever (todo17 Phase 3).
        const record = reviews[module] ?? "";
        needsDocReview = record.split("|")[0] !== this.moduleHash(root, module);
      }
      out.push({ module, changedFiles, moduleDoc: doc, needsDocReview });
    }
    return out;
  }

  /** Walks up from the changed directory to the nearest MODULE.md, so a leaf file still finds its note. */
  private findModuleDoc(root: string, moduleDir: string): string | undefined {
    // src/lib/core/parsing -> core/parsing ; src/interfaces/cli -> interfaces/cli
    let rel = moduleDir.replace(/^src\/(lib\/)?/, "");
    while (rel && rel !== "." && rel !== "/") {
      const candidate = path.join("docs", "modules", rel, "MODULE.md");
      if (fs.existsSync(path.join(root, candidate))) return candidate;
      const parent = path.dirname(rel);
      if (parent === rel) break;
      rel = parent;
    }
    return undefined;
  }

  /** Combined hash of every source file directly in a module directory. */
  public moduleHash(root: string, moduleDir: string): string {
    // ONE implementation with docs-board's drift check (todo21's acceptance): both used to carry a
    // copy coupled by a "must match" comment — the shared function is what makes matching a fact.
    return moduleHashOf(path.join(root, moduleDir));
  }

  /** Dismissals live in the PROJECT, beside its vault — they are a fact about this code, not this machine. */
  private reviewsPath(root: string): string {
    return path.join(root, ".conducks", "doc-reviews.json");
  }

  private readReviews(root: string): Record<string, string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.reviewsPath(root), "utf8"));
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Marks a module's note as checked against its current code.
   *
   * Two shapes, because the two cases are not the same claim:
   *
   *  - no `intent` — "checked, still accurate". The escape hatch that stops a bug fix from demanding a
   *    doc edit. Most changes are this.
   *  - with `intent` — an ENHANCEMENT, whose intent has to land somewhere a reader will find it: an
   *    architecture note, a decision record or a todo. The address is verified to exist, so the record
   *    cannot point at a doc nobody wrote. A change that adds a capability and says only "still
   *    accurate" has lost the reason it was made, and no later reader can recover it.
   */
  public dismissReview(root: string, moduleDir: string, intent?: string): { hash: string; intent?: string } {
    const reviews = this.readReviews(root);
    const hash = this.moduleHash(root, moduleDir);
    reviews[moduleDir] = intent ? `${hash}|${intent}` : hash;
    try {
      fs.mkdirSync(path.dirname(this.reviewsPath(root)), { recursive: true });
      fs.writeFileSync(this.reviewsPath(root), JSON.stringify(reviews, null, 2) + "\n");
    } catch { /* a dismissal that cannot be stored simply re-appears */ }
    return { hash, intent };
  }

  /**
   * Whether an intent address names a doc that actually exists — `0027`, `todo17`, `todo17#P3`, or a
   * path to an architecture note. An address pointing at nothing is refused rather than stored, because
   * the whole point of requiring one is that a reader can follow it.
   */
  public resolveIntent(root: string, intent: string): string | undefined {
    const bare = intent.split("#")[0];

    if (/^\d{4}$/.test(bare)) {
      const dir = path.join(root, "docs", "decisions");
      try {
        const hit = fs.readdirSync(dir).find(f => f.startsWith(`${bare}-`) && f.endsWith(".md"));
        if (hit) return path.join("docs", "decisions", hit);
      } catch { /* no decisions dir */ }
      return undefined;
    }

    if (/^todo\d+$/.test(bare)) {
      const rel = path.join("docs", "todos", `${bare}.md`);
      return fs.existsSync(path.join(root, rel)) ? rel : undefined;
    }

    // Anything else is treated as a path, so an architecture note can be named directly.
    return fs.existsSync(path.join(root, intent)) ? intent : undefined;
  }

  /**
   * The branch a registered project's checkout is on, or null when it has none.
   *
   * Spawned per project root rather than routed through the `chronicle` singleton, which anchors to
   * ONE project directory for the whole process — the monitor is cross-project by definition and
   * would otherwise read the same branch for every row. Same shape as `ChronicleInterface.
   * getCurrentBranch`: `--quiet --short` exits non-zero and prints nothing on a detached HEAD, so
   * null means "no branch here" and never an invented name.
   */
  private checkoutBranch(root: string): string | null {
    try {
      const out = execFileSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
        cwd: root, encoding: "utf8", timeout: 10_000,
        // A non-git project is an expected case, not an error — do not print git's complaint.
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.trim() || null;
    } catch {
      return null;                 // detached HEAD, no repository, or an unreadable root
    }
  }

  /**
   * Source files under a root. `git ls-files` when possible — it already honours `.gitignore`, which is
   * the only cheap way to avoid walking `node_modules` — and a bounded filesystem walk otherwise.
   */
  private sourceFiles(root: string): string[] {
    try {
      const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
        cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        // A non-git project is the fallback case, not an error — do not print git's complaint about it.
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.split("\n")
        .filter(f => f && SOURCE_EXTENSIONS.has(path.extname(f)))
        .map(f => path.join(root, f));
    } catch {
      return this.walk(root, 0);
    }
  }

  private walk(dir: string, depth: number): string[] {
    if (depth > 12) return [];
    const skip = new Set(["node_modules", ".git", "build", "dist", ".conducks", "target", ".venv", "vendor"]);
    const out: string[] = [];
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".conducks") continue;
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.walk(full, depth + 1));
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
    }
    return out;
  }
}

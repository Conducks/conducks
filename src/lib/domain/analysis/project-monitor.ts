import { VAULT_DIR, VAULT_DB_FILENAME, SOURCE_EXTENSIONS } from "@/contracts/index.js";
import { readWatcherLiveness, type WatcherLiveness } from "@/lib/domain/evolution/index.js";
import fs from "node:fs";
import path from "node:path";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";

import { classifyFreshness, isStale } from "@/lib/core/persistence/index.js";
import { ProjectRegistry, type RegisteredProject } from "@/lib/domain/federation/index.js";
import { branchMismatch, ChronicleInterface } from "@/lib/core/git/index.js";

/**
 * Conducks — Cross-Project Monitor
 *
 * One report covering every registered project: has the graph fallen behind the code, and is anything
 * keeping it fresh.
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
      // Read here for the same reason as `watcher`: it survives every early return, and a project
      // with no repository legitimately answers null on both sides.
      branch: { vault: null, checkout: this.checkoutBranch(project.root), mismatch: false },
      // Read here, in `base`, so it survives every early return below: a project whose vault is
      // unreadable is exactly one where "is anything watching it?" is worth knowing.
      watcher: readWatcherLiveness(project.root),
    };

    if (!fs.existsSync(project.root)) {
      return { ...base, unavailable: "root does not exist on disk" };
    }

    const vault = path.join(project.root, VAULT_DIR, VAULT_DB_FILENAME);
    if (!fs.existsSync(vault)) return base;                    // analyzed: false

    const persistence = new SynapsePersistence(project.root, true);   // READ_ONLY
    try {
      const stored = await persistence.getAllFileHashes();
      const onDisk = await this.sourceFiles(project.root);
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
    } catch (err: any) {
      return { ...base, unavailable: `vault unreadable: ${err?.message ?? err}` };
    } finally {
      try { await persistence.close(); } catch { /* nothing to release */ }
    }

    return base;
  }

  /**
   * The branch a registered project's checkout is on, or null when it has none.
   *
   * ASKS THE GIT FEATURE, per root. It used to spawn `symbolic-ref` itself, and the reason given was
   * real at the time: the `chronicle` SINGLETON anchors to one directory for the whole process, and
   * the monitor is cross-project by definition. But `ChronicleInterface` is a class — one per root
   * answers per root — so the duplication existed because the door exported a singleton, not because
   * the class could not do it. Rule 4 caused rule 9; fixing 4 is what made this deletable (todo70).
   */
  private checkoutBranch(root: string): string | null {
    return new ChronicleInterface(root).getCurrentBranch();
  }

  /**
   * Source files under a root, asked of the git feature per root for the same reason as above.
   *
   * `discoverFiles` already carries what this re-implemented AND more: it honours `.gitignore`, asks
   * every NESTED repository rather than only the anchor (ADR 0069), passes `core.quotePath=false` so
   * a non-ASCII filename survives, drops binaries, and falls back to a filesystem scan derived from
   * what the language providers declare. The local copy had none of those.
   *
   * The extension filter stays here: the monitor counts SOURCE files, while discovery deliberately
   * ingests config and documentation too.
   */
  private async sourceFiles(root: string): Promise<string[]> {
    const found = await new ChronicleInterface(root).discoverFiles();
    return found.filter((f: string) => SOURCE_EXTENSIONS.has(path.extname(f)));
  }
}

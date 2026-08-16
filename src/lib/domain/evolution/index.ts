import path from "node:path";
import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/index.js";
import { GVREngine, RefactorResult } from "./gvr-engine.js";
import { ConducksWatcher } from "./watcher.js";
import { DriftEngine, DriftResult } from "./drift-engine.js";
import { AuditService, AuditResult } from "./audit-service.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";

/**
 * Conducks — Structural Evolution Service 🧬
 */
export class EvolutionService {
  /**
   * Watchers held by PROJECT ROOT, never one flat singleton.
   *
   * A watcher's identity is the pair (this session, that project) — it exists because a session is
   * using a project right now, and dies with the session (ADR 0036). Keying by root is what encodes
   * that. The previous single `_watcher` field returned the FIRST watcher ever created no matter
   * which root was asked for, so a second project in one process would have been handed another
   * project's watcher and pulsed its edits into the wrong graph. Unreachable today, because one
   * process serves one project root, and silent the moment that stops being true.
   *
   * Being in `~/.conducks/projects.json` never puts an entry in this map. Registration is a list;
   * this is a set of live attachments, and nothing iterates the former to populate the latter.
   */
  private readonly _watchers = new Map<string, ConducksWatcher>();
  public readonly drift: DriftEngine;
  public readonly auditService: AuditService;

  constructor(
    private graph: any,
    private persistence: any,
    public readonly gvr: GVREngine = new GVREngine()
  ) {
    this.drift = new DriftEngine(this.persistence);
    this.auditService = new AuditService(this.persistence);
  }

  /**
   * Synapse Re-Anchoring 🛡️
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: any) {
    (this as any).persistence = persistence;
    (this.drift as any).persistence = persistence;
    (this.auditService as any).persistence = persistence;
    for (const watcher of this._watchers.values()) {
      (watcher as any).options.persistence = persistence;
    }
  }

  /**
   * Propagates updated ignore patterns to the watcher (if active).
   */
  public setIgnoreManager(ignoreManager: IgnoreManager): void {
    for (const watcher of this._watchers.values()) {
      watcher.setIgnoreManager(ignoreManager);
    }
  }

  /**
   * The watcher attached to this project root, created on first ask.
   *
   * Idempotent per root: asking twice for the same project returns the same watcher, so a command
   * that fetches it in two places does not start two chokidar trees over one directory.
   */
  public getWatcher(projectRoot: string): ConducksWatcher | null {
    if (!projectRoot || projectRoot === "/" || projectRoot === "C:\\") return null;

    const key = path.resolve(projectRoot);
    let watcher = this._watchers.get(key);
    if (!watcher) {
      watcher = new ConducksWatcher(projectRoot, this.graph, { persistence: this.persistence });
      this._watchers.set(key, watcher);
    }
    return watcher;
  }

  /** How many watchers this session holds. A diagnostic: registration must never move this number. */
  public get watcherCount(): number { return this._watchers.size; }

  /**
   * Stops every watcher this session opened and forgets them.
   *
   * A watcher dies with the session that made it (ADR 0036), and `stop()` is what removes the
   * liveness marker — so a session that exits without this leaves a marker behind and the project
   * reads as DEAD rather than unwatched.
   */
  public async stopWatchers(): Promise<void> {
    const watchers = [...this._watchers.values()];
    this._watchers.clear();
    for (const watcher of watchers) await watcher.stop();
  }

  /**
   * Safely renames a symbol across the entire project using Graph-Verified Refactoring.
   */
  public async rename(symbolId: string, newName: string, dryRun: boolean = false): Promise<RefactorResult> {
    return this.gvr.renameSymbol(this.graph.getGraph(), symbolId as any, newName, dryRun);
  }

  /**
   * Compares the current structural state against a historical baseline.
   */
  public async compare(prevPulseId?: string): Promise<DriftResult> {
    return this.drift.compare(prevPulseId);
  }

  /**
   * Performs an architectural audit over a window of pulses.
   */
  public async audit(window: number = 5): Promise<AuditResult> {
    return this.auditService.audit(window);
  }
}

export type { RefactorResult, DriftResult, AuditResult };
export { GVREngine } from "./gvr-engine.js";
export { ConducksWatcher } from "./watcher.js";
export { DriftEngine } from "./drift-engine.js";
export { AuditService } from "./audit-service.js";

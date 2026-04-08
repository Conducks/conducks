import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/adjacency-list.js";
import { GVREngine, RefactorResult } from "./gvr-engine.js";
import { ConducksWatcher } from "./watcher.js";
import { DriftEngine, DriftResult } from "./drift-engine.js";
import { AuditService, AuditResult } from "./audit-service.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Structural Evolution Service 🧬
 */
export class EvolutionService implements ConducksComponent {
  public readonly id = 'evolution-service';
  public readonly type = 'analyzer';
  public readonly description = 'Tracks structural velocity and chronoscopic structural drift pulses.';
  private _watcher: ConducksWatcher | null = null;
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
    if (this._watcher) {
      (this._watcher as any).options.persistence = persistence;
    }
  }

  /**
   * Initializes or retrieves the singleton structural watcher.
   */
  public getWatcher(projectRoot: string): ConducksWatcher | null {
    if (projectRoot && projectRoot !== "/" && projectRoot !== "C:\\") {
      if (!this._watcher) {
        this._watcher = new ConducksWatcher(projectRoot, this.graph, { persistence: this.persistence });
      }
      return this._watcher;
    }
    return null;
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

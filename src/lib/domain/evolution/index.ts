import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/adjacency-list.js";
import { GVREngine, RefactorResult } from "./gvr-engine.js";
import { ConducksWatcher } from "./watcher.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Evolution Service
 */
export class EvolutionService implements ConducksComponent {
  public readonly id = 'evolution-service';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates structural evolution, atomic refactoring (GVR), and real-time monitoring.';
  private _watcher: ConducksWatcher | null = null;

  constructor(
    private readonly graph: any,
    private readonly persistence: any,
    public readonly gvr: GVREngine = new GVREngine()
  ) {}

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
}

export type { RefactorResult };
export { GVREngine } from "./gvr-engine.js";
export { ConducksWatcher } from "./watcher.js";

import { ManifestEngine } from "./manifest-engine.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Manifest Service
 */
export class ManifestService implements ConducksComponent {
  public readonly id = 'manifest-service';
  public readonly type = 'analyzer';
  public readonly description = 'Implements high-fidelity documentation governance and strategic learning recovery.';
  constructor(private readonly engine: ManifestEngine = new ManifestEngine()) {}

  /**
   * Bootstraps the 7-file documentation standard for a project.
   */
  public async bootstrap(projectRoot: string, projectName: string) {
    return this.engine.bootstrap(projectRoot, projectName);
  }

  /**
   * Records a strategic learning or decision into the appropriate manifest file.
   */
  public async record(projectRoot: string, projectName: string, type: string, content: string) {
    return this.engine.record(projectRoot, projectName, type, content);
  }
}

export { ManifestEngine } from "./manifest-engine.js";

import { ManifestEngine } from "./manifest-engine.js";

/**
 * Conducks — Manifest Service (The Memory Facade)
 *
 * Implements high-fidelity documentation governance and 
 * strategic learning recovery using the 9th Domain (Manifest).
 */
export class ManifestService {
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

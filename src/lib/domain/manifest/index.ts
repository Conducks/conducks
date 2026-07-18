import fs from "node:fs/promises";
import path from "node:path";
import { ManifestEngine } from "./manifest-engine.js";
import { ConducksComponent } from "@/contracts/types.js";

/**
 * Conducks — Manifest Service
 *
 * Owns all filesystem I/O for manifest operations.
 * Delegates computation to ManifestEngine (pure, no I/O).
 */
export class ManifestService implements ConducksComponent {
  public readonly id = 'manifest-service';
  public readonly type = 'analyzer';
  public readonly description = 'Implements high-fidelity documentation governance and strategic learning recovery.';
  constructor(private readonly engine: ManifestEngine = new ManifestEngine()) {}

  /**
   * Bootstraps the 7-file documentation standard for a project.
   * Writes only files that don't already exist on disk.
   */
  public async bootstrap(projectRoot: string, projectName: string): Promise<string[]> {
    const files = this.engine.computeBootstrap(projectRoot, projectName);
    const created: string[] = [];

    for (const file of files) {
      // Each file may live in a subdir (e.g. todos/todo01.md) — ensure its own parent.
      await fs.mkdir(path.dirname(file.filePath), { recursive: true });
      try {
        await fs.access(file.filePath);
        // File exists — skip
      } catch {
        await fs.writeFile(file.filePath, file.content, 'utf-8');
        created.push(file.name);
      }
    }

    return created;
  }

  /**
   * Records a strategic learning or decision into the appropriate manifest file.
   */
  public async record(projectRoot: string, projectName: string, type: string, content: string): Promise<boolean> {
    const entry = this.engine.computeRecord(projectRoot, projectName, type, content);
    await fs.mkdir(entry.docsDir, { recursive: true });
    try {
      await fs.appendFile(entry.filePath, entry.appendContent, 'utf-8');
    } catch {
      await fs.writeFile(entry.filePath, entry.initialContent, 'utf-8');
    }
    return true;
  }
}

export { ManifestEngine } from "./manifest-engine.js";

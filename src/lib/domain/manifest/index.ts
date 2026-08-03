import fs from "node:fs/promises";
import path from "node:path";
import { ManifestEngine, type TreeKind } from "./manifest-engine.js";

/**
 * Conducks — Manifest Service
 *
 * Owns all filesystem I/O for manifest operations.
 * Delegates computation to ManifestEngine (pure, no I/O).
 */
export class ManifestService {
  constructor(private readonly engine: ManifestEngine = new ManifestEngine()) {}

  /**
   * Bootstraps the conducks-docs grammar file set for a project.
   * Writes only files that don't already exist on disk.
   */
  public async bootstrap(projectRoot: string, projectName: string, kind: TreeKind = 'root'): Promise<string[]> {
    const { files, dirs } = this.engine.computeBootstrap(projectRoot, projectName, kind);
    const created: string[] = [];

    // Empty folders first: `decisions/` and `todos/completed/` hold no file yet but must exist, or the
    // first ADR and the first closed todo each land wherever their author guesses.
    for (const dir of dirs) await fs.mkdir(dir, { recursive: true });

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

    // EXISTENCE decides, not a thrown error. `appendFile` CREATES the file when it is missing, so it
    // never threw — which made the `initialContent` branch unreachable and every file `record` had
    // ever created start without its `# Title`. The docs grammar requires that title, so this
    // command's own output failed `conducks docs-lint`: "missing `# Title`" (ADR 0122).
    //
    // A dead fallback is worse than no fallback: the header was written, reviewed and tested for,
    // and could never run.
    const exists = await fs.access(entry.filePath).then(() => true).catch(() => false);
    if (exists) {
      await fs.appendFile(entry.filePath, entry.appendContent, 'utf-8');
    } else {
      await fs.writeFile(entry.filePath, entry.initialContent, 'utf-8');
    }
    return true;
  }
}

export { ManifestEngine, type TreeKind } from "./manifest-engine.js";

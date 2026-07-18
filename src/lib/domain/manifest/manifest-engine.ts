import path from "node:path";
import { ConducksComponent } from "@/contracts/types.js";

/**
 * A file to be written during bootstrap.
 */
export interface ManifestFile {
  filePath: string;
  content: string;
  name: string;
}

/**
 * A record entry to be appended or written.
 */
export interface ManifestRecord {
  filePath: string;
  docsDir: string;
  /** Content to append if the file already exists. */
  appendContent: string;
  /** Full content to write if the file does not yet exist. */
  initialContent: string;
}

/**
 * Conducks — Manifest Engine
 *
 * Pure computation only — no filesystem I/O.
 * Callers are responsible for writing the returned data to disk.
 */
export class ManifestEngine implements ConducksComponent {
  public readonly id = 'manifest-engine';
  public readonly type = 'analyzer';
  public readonly description = 'Implements high-fidelity documentation governance and strategic learning recovery.';
  /**
   * The conducks-docs grammar file set (see the conducks-docs skill and docs-grammar.ts — the SAME
   * grammar `docs-lint` validates). Every scaffolded file MUST pass docs-lint. Flat docs/ — never
   * nested per-project dirs. AUTHORED intent ONLY — conducks no longer emits a static architecture
   * doc; structure is queried live from the graph (audit/impact/trace), never written to a file.
   */
  private grammarFiles(projectName: string): Array<{ name: string; content: string }> {
    return [
      { name: 'features.md', content: `# Features — ${projectName}\n\n## Example Capability\n- Purpose: what this is FOR — one line the code can't tell you\n- Intent: why it exists / the tradeoff it makes\n` },
      { name: 'conventions.md', content: `# Conventions — ${projectName}\n\n## C1 — First rule\n- Rule: the binding rule\n- Reason: why it exists\n` },
      { name: 'memory.md', content: `# Memory — ${projectName}\n\n## Example gotcha\n- Gotcha: what looks wrong / the constraint\n- Why: the reason the code cannot show\n- Applies: file / node / area\n` },
      { name: 'progress.md', content: `# Progress — ${projectName}\n\n## ${new Date().toISOString().slice(0, 10)} · bootstrap\n- Conducks: docs scaffolded to the conducks-docs grammar\n- Shipped: initial docs bootstrap\n` },
      { name: path.join('todos', 'todo01.md'), content: `# todo01 — first milestone\nStatus: todo\n- Acceptance: one line, testable\n\n## Phase 1 — setup\n- [ ] first task\n` },
    ];
  }

  /**
   * Computes the manifest files to create for a project — the conducks-docs grammar set,
   * flat under docs/. Callers decide which to write (skip if already on disk).
   */
  public computeBootstrap(projectRoot: string, projectName: string): ManifestFile[] {
    const docsDir = path.join(projectRoot, 'docs');
    return this.grammarFiles(projectName).map(file => ({
      name: file.name,
      filePath: path.join(docsDir, file.name),
      content: file.content,
    }));
  }

  /**
   * Computes the entry to record into a manifest file.
   * Returns the paths and content; the caller performs the actual fs operations.
   */
  public computeRecord(projectRoot: string, projectName: string, type: string, content: string): ManifestRecord {
    const fileName = `${type.toLowerCase()}.md`;
    const docsDir = path.join(projectRoot, 'docs');
    const filePath = path.join(docsDir, fileName);
    // Grammar-conforming entry: a `## <section>` heading (parsed by docs-grammar), not `### Entry:`.
    const entry = `\n## ${new Date().toISOString().slice(0, 10)} · recorded\n${content}\n`;
    const header = `# ${type.charAt(0).toUpperCase() + type.slice(1)} — ${projectName}\n`;
    return {
      filePath,
      docsDir,
      appendContent: entry,
      initialContent: header + entry,
    };
  }
}

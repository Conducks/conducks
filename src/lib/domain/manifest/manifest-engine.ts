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
 * Which docs tree is being scaffolded. `root` is also the single-repo case — a repo with one service
 * has one flat `docs/` and no root tree above it, so the two are the same shape.
 */
export type TreeKind = 'root' | 'service';

/** What a bootstrap must put on disk: files to write, plus folders that must exist while still empty. */
export interface BootstrapPlan {
  files: ManifestFile[];
  dirs: string[];
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
   * doc; wiring is queried live from the graph (audit/impact/trace), never written to a file.
   *
   * Two shapes, because root and service trees hold different files. `conventions.md`, `memory.md`
   * and `handover.md` are ROOT-ONLY: constraints load once per session, and split across services an
   * agent cannot know it has them all.
   *
   * Scaffolded here only what the standard calls create-now. `conventions.md`, `memory.md` and every
   * `modules/<path>/MODULE.md` are create-when-first-needed — a placeholder rule that lints clean but
   * states nothing true is worse than an absent file, because it reads as an answer.
   */
  private grammarFiles(projectName: string, kind: TreeKind): Array<{ name: string; content: string }> {
    const files = [
      { name: 'features.md', content: `# Features — ${projectName}\n\n## Example Capability — \`the command or entry point that runs it\`\n- Purpose: what this is FOR — one line the code can't tell you\n- Intent: why it exists / the tradeoff it makes\n` },
      { name: 'architecture.md', content: this.architectureSkeleton(projectName) },
      { name: path.join('todos', 'todo01.md'), content: `# todo01 — first milestone\nStatus: todo\n- Acceptance: one line, testable\n\n## Phase 1 — setup\n- [ ] first task\n` },
    ];
    if (kind === 'root') {
      // Dated on write: a handover that cannot say when it was written cannot be judged stale.
      files.push({ name: 'handover.md', content: `# Handover — ${new Date().toISOString().slice(0, 10)}\nStatus: stale\n\n## Where it stands\nBootstrapped; nothing recorded yet.\n\n## Next, in order\n1. Fill features.md and architecture.md from the code as it stands.\n` });
    }
    return files;
  }

  /**
   * The graph, and the rules its arrows obey — nothing else. Authored from here on: naming the parts
   * is judgement, so conducks scaffolds the shape and a person fills it. Fenced, so docs-grammar
   * skips the diagram rather than reading its arrows as fields.
   */
  private architectureSkeleton(projectName: string): string {
    return [
      `# Architecture — ${projectName}`,
      '',
      '```mermaid',
      'flowchart TD',
      '  entry[entry point] --> core[core]',
      '```',
      '',
      '| node | note |',
      '|---|---|',
      '| `core` | link to modules/core/MODULE.md once it earns a note |',
      '',
      '## Contract',
      '1. State a dependency rule the arrows above obey.',
      '- Enforced by: name the test that proves it',
      '',
    ].join('\n');
  }

  /**
   * Computes the manifest files to create for a project — the conducks-docs grammar set,
   * flat under docs/. Callers decide which to write (skip if already on disk).
   *
   * `dirs` are folders that must exist even while empty: a tree with no `decisions/` gives the next
   * ADR nowhere obvious to land, and it gets written somewhere else instead.
   */
  public computeBootstrap(projectRoot: string, projectName: string, kind: TreeKind = 'root'): BootstrapPlan {
    const docsDir = path.join(projectRoot, 'docs');
    return {
      files: this.grammarFiles(projectName, kind).map(file => ({
        name: file.name,
        filePath: path.join(docsDir, file.name),
        content: file.content,
      })),
      dirs: ['decisions', path.join('todos', 'completed')].map(d => path.join(docsDir, d)),
    };
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

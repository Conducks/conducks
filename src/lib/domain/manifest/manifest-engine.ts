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
  private readonly requiredFiles = [
    { name: 'vision.md', title: 'Vision & Intent', description: 'The why. Original intent and every evolution since.' },
    { name: 'architecture.md', title: 'Architecture Context', description: 'Module map, file tree, dependency directions.' },
    { name: 'implementation.md', title: 'Implementation Log', description: 'What was built — a running clinical log.' },
    { name: 'handover.md', title: 'Session Handover', description: 'Full session state for the next agent.' },
    { name: 'conventions.md', title: 'Engineering Conventions', description: 'Non-negotiable rules for this service.' },
    { name: 'todo.md', title: 'Master Task List', description: 'Phases and tasks with acceptance criteria.' },
    { name: 'memory.md', title: 'Working Memory', description: 'Critical agent-only notes that must survive sessions.' }
  ];

  /**
   * Computes the manifest files to create for a project.
   * Returns one ManifestFile per required doc. Callers decide which to write
   * (skip if already on disk) and perform the actual fs operations.
   */
  public computeBootstrap(projectRoot: string, projectName: string): ManifestFile[] {
    const docsDir = path.join(projectRoot, 'docs', 'project', projectName);
    return this.requiredFiles.map(file => ({
      name: file.name,
      filePath: path.join(docsDir, file.name),
      content: `# ${file.title} — ${projectName}\n\n> ${file.description}\n\n---\n\n## Initial Boot\n- Date: ${new Date().toISOString()}\n- Status: Initialized via Conducks Manifest Engine\n`,
    }));
  }

  /**
   * Computes the entry to record into a manifest file.
   * Returns the paths and content; the caller performs the actual fs operations.
   */
  public computeRecord(projectRoot: string, projectName: string, type: string, content: string): ManifestRecord {
    const fileName = `${type.toLowerCase()}.md`;
    const docsDir = path.join(projectRoot, 'docs', 'project', projectName);
    const filePath = path.join(docsDir, fileName);
    const entry = `\n### Entry: ${new Date().toISOString()}\n${content}\n`;
    const fileMeta = this.requiredFiles.find(f => f.name === fileName) || { title: type, description: 'Recorded manifest.' };
    const header = `# ${fileMeta.title} — ${projectName}\n\n> ${fileMeta.description}\n\n---\n`;
    return {
      filePath,
      docsDir,
      appendContent: entry,
      initialContent: header + entry,
    };
  }
}

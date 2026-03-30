import fs from "node:fs/promises";
import path from "node:path";

/**
 * Conducks — Manifest Engine (The 9th Domain) 💎
 * 
 * Implements high-fidelity documentation governance and 
 * strategic learning recovery.
 */
export class ManifestEngine {
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
   * Bootstraps the 7-file documentation standard for a project.
   */
  public async bootstrap(projectRoot: string, projectName: string): Promise<string[]> {
    const docsDir = path.join(projectRoot, 'docs', 'project', projectName);
    await fs.mkdir(docsDir, { recursive: true });

    const created: string[] = [];

    for (const file of this.requiredFiles) {
      const filePath = path.join(docsDir, file.name);
      try {
        await fs.access(filePath);
        // File exists, skip
      } catch {
        const content = `# ${file.title} — ${projectName}\n\n> ${file.description}\n\n---\n\n## Initial Boot\n- Date: ${new Date().toISOString()}\n- Status: Initialized via Conducks Manifest Engine\n`;
        await fs.writeFile(filePath, content, 'utf-8');
        created.push(file.name);
      }
    }

    return created;
  }

  /**
   * Records a strategic learning or decision into the appropriate manifest file.
   */
  public async record(projectRoot: string, projectName: string, type: string, content: string): Promise<boolean> {
    const fileName = `${type.toLowerCase()}.md`;
    const docsDir = path.join(projectRoot, 'docs', 'project', projectName);
    const filePath = path.join(docsDir, fileName);

    // Ensure directory exists
    await fs.mkdir(docsDir, { recursive: true });

    const entry = `\n### Entry: ${new Date().toISOString()}\n${content}\n`;
    
    try {
      await fs.appendFile(filePath, entry, 'utf-8');
      return true;
    } catch {
      // If file doesn't exist, create it first
      const fileMeta = this.requiredFiles.find(f => f.name === fileName) || { title: type, description: 'Recorded manifest.' };
      const header = `# ${fileMeta.title} — ${projectName}\n\n> ${fileMeta.description}\n\n---\n`;
      await fs.writeFile(filePath, header + entry, 'utf-8');
      return true;
    }
  }
}

import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Guidance Oracle 🔱
 * 
 * The Oracle is the dynamic engine for architectural knowledge.
 * It recursively scans the skills-generator resource folder to provide
 * high-fidelity engineering standards to the MCP server and CLI.
 */
export interface GuidanceSkill {
  id: string;          // e.g., "frontend/tools/color"
  name: string;        // Extracted from YAML frontmatter
  description: string; // Extracted from YAML frontmatter
  content: string;     // Full markdown content
  path: string;        // Absolute file path
}

export class GuidanceOracle implements ConducksComponent {
  public readonly id = 'guidance-oracle';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates dynamic architectural guidance and engineering standards.';
  
  private skills: Map<string, GuidanceSkill> = new Map();
  private readonly resourceRoot: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Resolve resource root relative to built or source location
    this.resourceRoot = path.resolve(__dirname, "../../../resources/skills-generator");
  }

  /**
   * Initializes the Oracle by scanning the skills-generator directory.
   */
  public async bootstrap(): Promise<void> {
    if (!fs.existsSync(this.resourceRoot)) {
      console.error(`🛡️ [Oracle] Resource root not found: ${this.resourceRoot}. Initializing with empty knowledge base.`);
      return;
    }

    this.skills.clear();
    await this.scanDirectory(this.resourceRoot);
    console.error(`🛡️ [Oracle] Dynamic knowledge base synchronized: ${this.skills.size} skills indexed.`);
  }

  /**
   * Recursively scans for .md files and indexes them.
   */
  private async scanDirectory(dir: string, currentId: string = ""): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const entryId = currentId ? `${currentId}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.scanDirectory(entryPath, entryId);
      } else if (entry.name.endsWith(".md")) {
        const skillId = entryId.replace(/\.md$/, "");
        const skill = await this.parseSkill(entryPath, skillId);
        if (skill) {
          this.skills.set(skillId, skill);
        }
      }
    }
  }

  /**
   * Parses a markdown file and extracts YAML-like metadata.
   */
  private async parseSkill(filePath: string, id: string): Promise<GuidanceSkill | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      
      // Simple regex-based frontmatter extraction
      const descriptionMatch = content.match(/description:\s*(.*?)-->/s);
      const nameMatch = content.match(/#\s*(.*?)\n/);

      return {
        id,
        name: nameMatch ? nameMatch[1].trim() : path.basename(id),
        description: descriptionMatch ? descriptionMatch[1].trim() : "No description provided.",
        content,
        path: filePath
      };
    } catch (err) {
      console.error(`🛡️ [Oracle] Failed to parse skill ${id}:`, err);
      return null;
    }
  }

  /**
   * Returns all indexed skills (metadata only).
   */
  public listSkills(): Omit<GuidanceSkill, 'content'>[] {
    return Array.from(this.skills.values()).map(({ id, name, description, path }) => ({
      id, name, description, path
    }));
  }

  /**
   * Retrieves a specific skill by its ID.
   */
  public getSkill(id: string): GuidanceSkill | undefined {
    return this.skills.get(id);
  }

  /**
   * Returns the count of indexed skills.
   */
  public get size(): number {
    return this.skills.size;
  }
}

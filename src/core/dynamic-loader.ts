import fs from "fs-extra";
import path from "path";
import { Tool } from "./tool-registry.js";

interface ConducksConfig {
  server: {
    name: string;
    version: string;
    title: string;
  };
  description: string;
  toolsDir: string;
}

/**
 * DynamicToolLoader is the core of the Documentation Governance Engine.
 * It recursively scans the filesystem for Markdown documents and dynamically
 * constructs MCP tools based on the directory structure and file contents.
 */
export class DynamicToolLoader {
  private baseDir: string;
  private config: ConducksConfig | null = null;

  /**
   * Initializes the loader with a base directory.
   * @param baseDir - The directory containing conducks.config.json and the tools folder.
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Loads conducks.config.json from the baseDir.
   * All server metadata lives here — nothing is hardcoded in TypeScript.
   */
  async loadConfig(): Promise<ConducksConfig> {
    if (this.config) return this.config;

    const configPath = path.join(this.baseDir, "conducks.config.json");

    if (!(await fs.pathExists(configPath))) {
      throw new Error(
        `[DynamicToolLoader] conducks.config.json not found at ${configPath}. ` +
        `Create it in your configuration directory.`
      );
    }

    const raw = await fs.readFile(configPath, "utf8");

    try {
      this.config = JSON.parse(raw) as ConducksConfig;
    } catch {
      throw new Error(`[DynamicToolLoader] conducks.config.json is not valid JSON.`);
    }

    return this.config;
  }

  /**
   * Scans the tools directory defined in conducks.config.json and registers
   * each item as an MCP tool.
   *
   * - Standalone .md files  → Simple tools
   * - Folders with tools.md → Category Hub tools
   */
  async loadTools(): Promise<Tool[]> {
    const config = await this.loadConfig();
    const tools: Tool[] = [];
    const toolsDir = path.join(this.baseDir, config.toolsDir);

    if (!(await fs.pathExists(this.baseDir))) {
      console.error(`[DynamicToolLoader] Base directory not found: ${this.baseDir}`);
      return [];
    }

    if (!(await fs.pathExists(toolsDir))) {
      await fs.ensureDir(toolsDir);
    }

    const items = await fs.readdir(toolsDir);

    for (const item of items) {
      if (item.startsWith(".")) continue;

      const fullPath = path.join(toolsDir, item);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        const tool = await this.createHubTool(item, fullPath);
        if (tool) tools.push(tool);
      } else if (item.endsWith(".md")) {
        const tool = await this.createSimpleTool(item, fullPath);
        if (tool) tools.push(tool);
      }
    }

    return tools;
  }

  /**
   * Category Hub tool — built from a folder that contains tools.md.
   *
   * Calling the hub with no arguments returns tools.md (the index).
   * Calling with tool= routes to tools/[name].md inside the folder.
   */
  private async createHubTool(categoryName: string, folderPath: string): Promise<Tool | null> {
    const indexPath = path.join(folderPath, "tools.md");

    if (!(await fs.pathExists(indexPath))) {
      console.error(
        `[DynamicToolLoader] Skipping category "${categoryName}": tools.md not found. ` +
        `Add a tools.md file to make this folder a hub tool.`
      );
      return null;
    }

    const indexContent = await fs.readFile(indexPath, "utf8");
    const description =
      this.extractDescription(indexContent) ??
      `Governance guidance for ${categoryName}. Call without arguments to see the index.`;

    return {
      name: categoryName.toLowerCase(),
      description,
      inputSchema: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            description:
              `The specific sub-tool within "${categoryName}" to retrieve. ` +
              `Call "${categoryName}" without this argument first to see what is available.`,
          },
        },
        required: [],
      },
      handler: async (args: any) => {
        if (!args.tool) {
          return indexContent;
        }

        const safeName = path.basename(args.tool);
        const subToolPath = path.join(folderPath, "tools", `${safeName}.md`);

        if (!(await fs.pathExists(subToolPath))) {
          return (
            `❌ Sub-tool "${args.tool}" not found in "${categoryName}".\n\n` +
            `Call "${categoryName}" without arguments to see the full list of available sub-tools.`
          );
        }

        return fs.readFile(subToolPath, "utf8");
      },
      formatter: (result: unknown) => result as string,
    };
  }

  /**
   * Simple tool — built from a standalone .md file.
   *
   * Calling with no arguments returns the full file.
   * Calling with section= returns only that heading's content.
   */
  private async createSimpleTool(filename: string, fullPath: string): Promise<Tool | null> {
    let name = filename.replace(/\.md$/, "").toLowerCase();
    
    // [Fix] Rename tool-list to detailed-tool-list as requested
    if (name === "tool-list") {
      name = "detailed-tool-list";
    }

    const content = await fs.readFile(fullPath, "utf8");
    const description =
      this.extractDescription(content) ??
      `Governance guidance for ${name}.`;

    return {
      name,
      description,
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              `Optional: retrieve only a specific section. ` +
              `Pass the heading text exactly as it appears, e.g. "## Rules".`,
          },
        },
        required: [],
      },
      handler: async (args: any) => {
        if (!args.section) return content;
        return this.extractSection(content, args.section);
      },
      formatter: (result: unknown) => result as string,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Extracts the description from an HTML comment at the top of a markdown file.
   * Format: <!-- description: Your description here -->
   */
  private extractDescription(content: string): string | null {
    const match = content.match(/<!--\s*description:\s*(.*?)\s*-->/);
    return match ? match[1] : null;
  }

  /**
   * Extracts a section from markdown content by heading.
   * Returns everything from the matched heading until the next heading
   * at the same level or higher.
   */
  private extractSection(content: string, sectionHeading: string): string {
    const lines = content.split("\n");
    const normalizedTarget = sectionHeading.trim().toLowerCase();

    const startIdx = lines.findIndex((l) =>
      l.trim().toLowerCase().startsWith(normalizedTarget)
    );

    if (startIdx === -1) {
      return `❌ Section "${sectionHeading}" not found. Check the heading text and try again.`;
    }

    const targetLevel = this.getHeaderLevel(lines[startIdx]);
    const resultLines: string[] = [lines[startIdx]];

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const level = this.getHeaderLevel(line);
      if (line.startsWith("#") && level <= targetLevel) break;
      resultLines.push(line);
    }

    return resultLines.join("\n").trim();
  }

  private getHeaderLevel(line: string): number {
    const match = line.match(/^(#+)/);
    return match ? match[1].length : 0;
  }
}
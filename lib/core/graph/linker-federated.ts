import fs from 'node:fs/promises';
import path from 'node:path';
import { ConducksAdjacencyList } from './adjacency-list.js';
import { GraphPersistence, SynapsePersistence } from './persistence.js';

/**
 * Conducks — Federated Linker
 * 
 * Manages cross-project dependencies by linking intelligence graphs
 * from neighboring foundation repositories.
 */
export class FederatedLinker {
  private configPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.configPath = path.join(baseDir, '.conducks', 'links.json');
  }

  /**
   * Registers a new neighboring project.
   */
  public async link(projectPath: string): Promise<void> {
    const links = await this.getLinks();
    const absolutePath = path.resolve(projectPath);
    
    // Verify it's a valid Conducks project
    const cachePath = path.join(absolutePath, '.conducks', 'cache.json');
    try {
      await fs.access(cachePath);
    } catch {
      throw new Error(`[Federated Linker] Target path is not a valid Conducks project: ${absolutePath}`);
    }

    if (!links.includes(absolutePath)) {
      links.push(absolutePath);
      await this.saveLinks(links);
    }
  }

  /**
   * Loads all linked project graphs into the current adjacency list.
   */
  public async hydrate(mainGraph: ConducksAdjacencyList): Promise<void> {
    const links = await this.getLinks();
    console.log(`[Federated Linker] Hydrating ${links.length} external graphs...`);

    for (const linkPath of links) {
      const persistence = new GraphPersistence(linkPath);
      const success = await persistence.load(mainGraph);
      if (success) {
        console.log(`- Linked: ${linkPath} (Merged)`);
      } else {
        console.warn(`- Failed to load linked project: ${linkPath}`);
      }
    }
  }

  public async getLinks(): Promise<string[]> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async saveLinks(links: string[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(links, null, 2), 'utf-8');
  }
}

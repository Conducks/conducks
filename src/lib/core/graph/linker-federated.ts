import fs from 'node:fs/promises';
import path from 'node:path';
import { ConducksAdjacencyList } from './adjacency-list.js';
import { DuckDbPersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Conducks — Federated Linker
 * 
 * Manages cross-project dependencies by linking intelligence graphs
 * from neighboring foundation repositories.
 */
export class FederatedLinker {
  private configPath: string;

  constructor(
    baseDir: string = process.cwd(),
    private readonly fsMock: any = fs
  ) {
    this.configPath = path.join(baseDir, '.conducks', 'links.json');
  }

  /**
   * Registers a new neighboring project.
   */
  public async link(projectPath: string): Promise<void> {
    const links = await this.getLinks();
    const absolutePath = path.resolve(projectPath);
    
    // Verify it's a valid Conducks project (DuckDB Sync)
    const dbPath = path.join(absolutePath, 'data', 'conducks-synapse.db');
    try {
      await this.fsMock.access(dbPath);
    } catch {
      throw new Error(`[Federated Linker] Target path is not a valid Conducks project (No DuckDB synapse found at ${dbPath})`);
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
    for (const linkPath of links) {
      const p = new DuckDbPersistence(linkPath, true); // Force READ_ONLY for federation neighbors
      const before = mainGraph.stats.nodeCount;
      const success = await p.load(mainGraph, true);
      if (success) {
        const added = mainGraph.stats.nodeCount - before;
        console.error(`[Federated Linker] Resonated with ${linkPath} (+${added} nodes).`);
      } else {
        console.warn(`[Federated Linker] ⚠️  Hydration failed for: ${linkPath}`);
      }
    }
  }

  public async getLinks(): Promise<string[]> {
    try {
      const content = await this.fsMock.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async saveLinks(links: string[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await this.fsMock.mkdir(dir, { recursive: true });
    await this.fsMock.writeFile(this.configPath, JSON.stringify(links, null, 2), 'utf-8');
  }
}

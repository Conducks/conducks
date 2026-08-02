import fs from 'node:fs/promises';
import path from 'node:path';
import { ConducksAdjacencyList } from './adjacency-list.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

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
    const dbPath = path.join(absolutePath, '.conducks', 'conducks-synapse.db');
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
      // READ-ONLY, and now actually so. `readOnly` defaults to FALSE, so this comment described an
      // intent the code did not carry out: it opened a NEIGHBOUR project's vault read-write, taking
      // an exclusive lock on a database this process does not own and blocking that project's own
      // readers. Since ADR 0040's reader snapshot, it would also have paid a full vault copy per
      // neighbour on every federated load.
      const p = new SynapsePersistence(linkPath, true);
      const before = mainGraph.stats.nodeCount;
      await p.load(mainGraph);
      const success = mainGraph.stats.nodeCount > before;
      if (success) {
        const added = mainGraph.stats.nodeCount - before;
        console.error(`[Federated Linker] Resonated with ${linkPath} (+${added} nodes).`);
      } else {
        console.warn(`[Federated Linker] ⚠️  Hydration failed for: ${linkPath}`);
      }
    }
  }

  /**
   * The linked project paths.
   *
   * ABSENT and UNREADABLE are different answers and used to be the same one. A single
   * `catch { return [] }` collapsed "you have never linked anything", "this file is corrupt" and
   * "this file cannot be read" into an empty array — so `list` printed "No federated projects
   * linked." and exited 0 on a workspace whose links were merely unparseable. The user linked them;
   * the tool said they had not (ADR 0114).
   *
   * No file is still a legitimate empty. Anything else is reported.
   */
  public async getLinks(): Promise<string[]> {
    let content: string;
    try {
      content = await this.fsMock.readFile(this.configPath, 'utf-8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw new Error(`Cannot read ${this.configPath}: ${err?.message ?? err}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      throw new Error(
        `${this.configPath} is not valid JSON (${err?.message ?? err}). ` +
        `Fix or delete the file — an unreadable link list is not the same as having no links.`
      );
    }

    // A file holding the wrong SHAPE is as unusable as one that will not parse, and returning it
    // verbatim would push the problem into every caller.
    if (!Array.isArray(parsed) || parsed.some(p => typeof p !== 'string')) {
      throw new Error(`${this.configPath} must be a JSON array of project paths.`);
    }
    return parsed as string[];
  }

  private async saveLinks(links: string[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await this.fsMock.mkdir(dir, { recursive: true });
    await this.fsMock.writeFile(this.configPath, JSON.stringify(links, null, 2), 'utf-8');
  }
}

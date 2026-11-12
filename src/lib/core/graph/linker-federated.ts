import fs from 'node:fs/promises';
import path from 'node:path';
import { ConducksAdjacencyList } from './adjacency-list.js';
import { VAULT_DIR, VAULT_DB_FILENAME } from "@/contracts/index.js";

/**
 * Opens a neighbour's vault read-only. Injected, for the reason on the constructor.
 *
 * `close` is called once the load is over. An open handle in this process refuses a writer in
 * another, and `hydrate` used to leave every neighbour open — measured: the neighbour's own `analyze`
 * failed "Vault Locked" for as long as the hydrating MCP server or mirror lived (state-machine audit
 * round 2, Q-02-6).
 */
export type OpenNeighbourVault = (path: string) => { load(graph: ConducksAdjacencyList): Promise<unknown>; close?(): Promise<unknown> };

/**
 * One queue per links FILE, for the whole module. It was an instance field, and the process builds
 * several linkers over one project (the registry's, `createLinker`'s, `analyze`'s), so two of them
 * linking at once still lost a link (state-machine audit round 2, Q-02-5).
 */
const linkQueues = new Map<string, Promise<void>>();

/**
 * Conducks — Federated Linker
 *
 * Manages cross-project dependencies by linking intelligence graphs
 * from neighboring foundation repositories.
 */
export class FederatedLinker {
  private configPath: string;

  /**
   * Takes its dependencies rather than importing them, and `openVault` is the load-bearing one.
   *
   * This file used to `import { SynapsePersistence }` directly. That was harmless while
   * `persistence.ts` imported `graph/adjacency-list.js` — a leaf — and became a REAL ESM cycle the
   * moment the graph door existed, because `persistence.ts` then imported `graph/index.js`, which
   * re-exports this file. Measured, not predicted: `status-pulse-visibility` failed on the partially
   * initialised module and passed again once the import was inverted (todo73).
   *
   * The same shape the watcher carries, for the same reason, and the third time this repository has
   * paid for it — `registry` ↔ `watcher`, `chronicle` ↔ `typescript/resolver`, now this.
   *
   * `openVault` THROWS by default rather than defaulting to a no-op. It was optional first, and a
   * caller that forgot it got a warning and an empty hydration — which reads exactly like "the
   * neighbour had nothing to give", the failure-looks-like-absence conflation this file's own
   * neighbours spend most of their comments preventing. A test that drives the linker directly
   * caught it.
   */
  constructor(
    baseDir: string = process.cwd(),
    private readonly fsMock: any = fs,
    private readonly openVault: OpenNeighbourVault = () => { throw new Error('[Federated Linker] no vault opener injected — construct with one (todo73)'); }
  ) {
    this.configPath = path.join(baseDir, '.conducks', 'links.json');
  }

  /**
   * Registers a new neighboring project.
   */
  public link(projectPath: string): Promise<void> {
    // One read-modify-write at a time. Two links registered together each read the same list and
    // the second write dropped the first link (state-machine audit P-02-11). Serialised within the
    // process, across every linker over the same file; a second PROCESS can still race, which is
    // accepted for a command a person runs by hand.
    const key = path.resolve(this.configPath);
    const run = (linkQueues.get(key) ?? Promise.resolve()).then(() => this.linkOne(projectPath));
    const tail = run.catch(() => {});
    linkQueues.set(key, tail);
    // Dropped once idle, so the map does not keep one entry per project for the process lifetime.
    void tail.then(() => { if (linkQueues.get(key) === tail) linkQueues.delete(key); });
    return run;
  }

  private async linkOne(projectPath: string): Promise<void> {
    const links = await this.getLinks();
    const absolutePath = path.resolve(projectPath);
    
    // Verify it's a valid Conducks project (DuckDB Sync)
    const dbPath = path.join(absolutePath, VAULT_DIR, VAULT_DB_FILENAME);
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
      //
      // One neighbour that fails is reported and SKIPPED: a throw here used to end the loop, so
      // every neighbour after it went unloaded behind one generic error (P-02-12). And success is
      // `load` returning, not the node count growing — a neighbour whose nodes were all already
      // present was reported "Hydration failed" (P-02-13).
      const before = mainGraph.stats.nodeCount;
      let vault: ReturnType<OpenNeighbourVault> | null = null;
      try {
        vault = this.openVault(linkPath);
        await vault.load(mainGraph);
      } catch (err: any) {
        console.warn(`[Federated Linker] ⚠️  Hydration failed for ${linkPath}: ${err?.message ?? err}`);
        continue;
      } finally {
        // Released either way: an open handle here refuses the neighbour's own writer (Q-02-6).
        try { await vault?.close?.(); } catch { /* already closed or never opened */ }
      }
      const added = mainGraph.stats.nodeCount - before;
      console.error(`[Federated Linker] Resonated with ${linkPath} (+${added} new nodes).`);
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

  /** Persists the cross-project links so a later session need not re-derive them. */
  private async saveLinks(links: string[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await this.fsMock.mkdir(dir, { recursive: true });
    await this.fsMock.writeFile(this.configPath, JSON.stringify(links, null, 2), 'utf-8');
  }
}

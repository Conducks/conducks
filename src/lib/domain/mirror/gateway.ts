import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { Logger } from "@/lib/core/utils/index.js";
import fs from "node:fs";
import path from "node:path";
import { VAULT_DIR, VAULT_DB_FILENAME } from "@/contracts/index.js";

const logger = new Logger("GatewayService");

/**
 * Conducks — Unified Synapse Gateway
 * 
 * High-performance access layer for the Mirror visual dashboard.
 */
export class GatewayService {
  private watcher: fs.FSWatcher | null = null;

  constructor(
    private graph: ConducksGraph,
    private persistence: SynapsePersistence,
    private projectRoot: string
  ) {
  }

  /**
   * Starts watching the structural synapse (DuckDB vault) for changes.
   * When a change is detected, it triggers a PULSE to all connected mirrors.
   */
  public watchSynapse(callback: (data: any) => void) {
    const dbPath = path.join(this.projectRoot, VAULT_DIR, VAULT_DB_FILENAME);
    
    if (this.watcher) this.watcher.close();

    try {
      if (fs.existsSync(dbPath)) {
        // [Conducks Consistency Check] 🛡️
        console.error("🛡️ [Conducks Graph] Re-initializing structural synapse...");
        logger.info(`🛡️ [Synapse Watcher] Monitoring vault for structural heartbeats: ${dbPath}`);
        this.watcher = fs.watch(dbPath, (eventType) => {
          if (eventType === 'change') {
            logger.info("🛡️ [Synapse Watcher] Vault heartbeat detected. Re-resonating graph...");
            // [Conducks Consistency Check] v2.5.0
            // [Conducks Consistency Check] v3.1.0 🛡️
            // We increase the window to 1250ms to ensure large multi-stage write transactions 
            // from 'analyze --force' are fully flushed and the file handle is cold.
            setTimeout(async () => {
              try {
                logger.info("🛡️ [Synapse Pulse] Structural resonance captured. Generating visual wave...");
                await this.persistence.load(this.graph.getGraph());
                callback({ type: 'PULSE', timestamp: Date.now() });
              } catch (err) {
                logger.error("Failed to reload graph on vault pulse", err);
              } finally {
                // 🛡️ Lock Release: Crucial for non-blocking analysis cycles
                await this.persistence.close();
              }
            }, 1250);
          }
        });
      }
    } catch (err) {
      logger.warn("Could not start vault watcher. Live-sync disabled.", err);
    }
  }

  /**
   * Generates a high-fidelity visual wave for the dashboard.
   */
  /**
   * The wave is answered from SQL, not from the in-memory graph (ADR 0042, ADR 0054).
   *
   * The old default called `MirrorEngine.getVisualWave`, which walks a materialised graph — so
   * `conducks mirror` had to load every node and edge to draw a few hundred. It also meant the
   * dashboard served an EMPTY wave whenever nothing had loaded the graph, which is what `mirror`
   * did: it is in STALENESS_BYPASS, so the browser got 0 nodes against a vault holding thousands.
   *
   * The `compact` branch that was supposed to be the SQL path called `getCompactWave` through an
   * `as any`. No such method existed. The cast made it compile, and the catch below turned the
   * runtime failure into `{nodes: [], edges: []}` — so the "fast path" was a silent empty result.
   */
  /** The cap this gateway serves when a request does not name one (`mirror --wave-cap`). */
  private waveCap: number | undefined;
  public setWaveCap(limit: number): void { this.waveCap = limit; }

  public async getWave(layers?: number[], spread?: number, limit?: number) {
    try {
      // The cap is OVERRIDABLE (todo48#P1). It exists because a force graph of ten thousand nodes is
      // unreadable, not because the rest is uninteresting — measured on a five-service monorepo the
      // default hides about a third of eligible nodes, and with no way to raise it that slice was
      // unreachable through this surface entirely.
      const wave = await this.persistence.getVisualWave(layers, spread ?? 1200, limit ?? this.waveCap);
      if (wave.truncated) {
        logger.info(`🛡️ [Mirror] Showing ${wave.nodes.length} of ${wave.totalNodes} nodes — the heaviest slice, not the whole graph.`);
      }
      return wave;
    } catch (err) {
      logger.error('Failed to build the visual wave', err);
      // Still an empty result, but no longer a SILENT one — the log above names the cause.
      return { nodes: [], links: [], clusters: [], truncated: false, totalNodes: 0 };
    }
  }

  /**
   * Hydrates a shallow node with deep structural DNA (complexity, entropy, resonance).
   */
  public async hydrateNode(nodeId: string) {
    try {
      const deep = await this.persistence.fetchNodeDeep(nodeId);
      if (!deep) return null;
      
      // Merge with any in-memory properties if needed
      const node = this.graph.getGraph().getNode(nodeId);
      return {
        ...(node?.properties || {}),
        ...deep,
        isShallow: false
      };
    } finally {
      // 🛡️ Lock Release
      await this.persistence.close();
    }
  }

  /** Lowercased root with a trailing slash: every stored file path under the project starts with it. */
  private rootPrefix(): string {
    return this.projectRoot.toLowerCase().replace(/\/+$/, '') + '/';
  }

  /**
   * The whole project as a map, not a node cloud (todo82#P10): every file with its size and risk,
   * and how many references run from one file to another. The page folds this into folders at any
   * depth, so one small answer serves every zoom level. Paths are relative to the root.
   */
  public async overview() {
    try {
      const root = this.rootPrefix();
      const rel = (f: string) => String(f).slice(root.length);
      const files = await this.persistence.query(
        `SELECT u.file AS file, u.lineEnd AS lines, count(n.id) AS symbols,
                coalesce(max(n.risk), 0) AS risk, coalesce(sum(n.complexity), 0) AS complexity
           FROM nodes u LEFT JOIN nodes n ON n.file = u.file AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
          WHERE u.canonicalKind = 'UNIT' AND starts_with(u.file, ?) GROUP BY u.file, u.lineEnd ORDER BY u.file`, [root]);
      const index = new Map<string, number>(files.map((f: any, i: number) => [f.file, i]));
      const deps = await this.persistence.query(
        `SELECT s.file AS a, t.file AS b, count(*) AS n
           FROM edges e JOIN nodes s ON e.sourceId = s.id JOIN nodes t ON e.targetId = t.id
          WHERE e.type IN ('IMPORTS', 'CALLS', 'CONSTRUCTS', 'TYPE_REFERENCE', 'EXTENDS', 'IMPLEMENTS')
            AND s.file <> t.file AND starts_with(s.file, ?) AND starts_with(t.file, ?) GROUP BY 1, 2`, [root, root]);
      const hotspots = await this.persistence.query(
        `SELECT id, name, file, lineStart AS line, risk, complexity, semantic_kind AS kind FROM nodes
          WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE') AND starts_with(file, ?)
          ORDER BY risk DESC, complexity DESC LIMIT 20`, [root]);
      const entries = await this.persistence.query(
        `SELECT name, file FROM nodes WHERE isEntryPoint AND starts_with(file, ?) ORDER BY file`, [root]);
      return {
        root: this.projectRoot,
        files: files.map((f: any) => ({ path: rel(f.file), lines: Number(f.lines) || 0, symbols: Number(f.symbols), risk: Number(f.risk), complexity: Number(f.complexity) })),
        // [from, to, count] as indexes into `files`, so a path is sent once.
        deps: deps.filter((d: any) => index.has(d.a) && index.has(d.b)).map((d: any) => [index.get(d.a), index.get(d.b), Number(d.n)]),
        hotspots: hotspots.map((h: any) => ({ id: rel(h.id), name: h.name, file: rel(h.file), line: Number(h.line), risk: Number(h.risk), complexity: Number(h.complexity), kind: h.kind })),
        entries: entries.map((e: any) => ({ name: e.name, file: rel(e.file) })),
      };
    } finally {
      await this.persistence.close();
    }
  }

  /** One file: what it says it is for, and each function and type in it with how often it is used. */
  public async fileDetail(relPath: string) {
    try {
      const file = this.rootPrefix() + relPath.toLowerCase();
      const unit = await this.persistence.query(`SELECT doc, lineEnd AS lines FROM nodes WHERE canonicalKind = 'UNIT' AND file = ?`, [file]);
      if (!unit.length) return null;
      const symbols = await this.persistence.query(
        `SELECT n.id, n.name, n.semantic_kind AS kind, n.lineStart AS line, n.risk, n.complexity, n.doc,
                (SELECT count(*) FROM edges e WHERE e.targetId = n.id AND e.type IN ('CALLS', 'CONSTRUCTS', 'TYPE_REFERENCE', 'EXTENDS', 'IMPLEMENTS')) AS usedBy
           FROM nodes n WHERE n.file = ? AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE') ORDER BY n.lineStart`, [file]);
      const root = this.rootPrefix();
      return {
        path: relPath, doc: unit[0].doc ?? null, lines: Number(unit[0].lines) || 0,
        symbols: symbols.map((x: any) => ({ id: String(x.id).slice(root.length), name: x.name, kind: x.kind, line: Number(x.line), risk: Number(x.risk), complexity: Number(x.complexity), doc: x.doc ?? null, usedBy: Number(x.usedBy) })),
      };
    } finally {
      await this.persistence.close();
    }
  }

  /** One symbol with who uses it and what it uses, 40 each at most with the true totals beside them. */
  public async symbolDetail(relId: string) {
    try {
      const root = this.rootPrefix();
      const id = root + relId.toLowerCase();
      const self = await this.persistence.query(
        `SELECT name, semantic_kind AS kind, file, lineStart AS line, lineEnd, risk, complexity, doc FROM nodes WHERE id = ?`, [id]);
      if (!self.length) return null;
      const types = `('CALLS', 'CONSTRUCTS', 'TYPE_REFERENCE', 'EXTENDS', 'IMPLEMENTS')`;
      const side = async (mine: string, other: string) => {
        const rows = await this.persistence.query(
          `SELECT DISTINCT n.id, n.name, n.file, n.lineStart AS line FROM edges e JOIN nodes n ON e.${other} = n.id
            WHERE e.${mine} = ? AND e.type IN ${types} ORDER BY n.file, n.lineStart`, [id]);
        // Library and built-in targets are counted, not listed: `parseInt` is not a place to go.
        const own = rows.filter((r: any) => String(r.file).startsWith(root));
        return { total: own.length, external: rows.length - own.length,
          items: own.slice(0, 40).map((r: any) => ({ id: String(r.id).slice(root.length), name: r.name, file: String(r.file).slice(root.length), line: Number(r.line) })) };
      };
      const x = self[0];
      return {
        id: relId, name: x.name, kind: x.kind, file: String(x.file).slice(root.length), line: Number(x.line), lineEnd: Number(x.lineEnd),
        risk: Number(x.risk), complexity: Number(x.complexity), doc: x.doc ?? null,
        usedBy: await side('targetId', 'sourceId'), uses: await side('sourceId', 'targetId'),
      };
    } finally {
      await this.persistence.close();
    }
  }

  /** Functions and types whose name contains the text, heaviest first. */
  public async search(text: string) {
    try {
      const root = this.rootPrefix();
      const rows = await this.persistence.query(
        `SELECT id, name, semantic_kind AS kind, file, lineStart AS line FROM nodes
          WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE') AND starts_with(file, ?) AND contains(lower(name), ?)
          ORDER BY (lower(name) = ?) DESC, gravity DESC LIMIT 20`, [root, text.toLowerCase(), text.toLowerCase()]);
      return rows.map((r: any) => ({ id: String(r.id).slice(root.length), name: r.name, kind: r.kind, file: String(r.file).slice(root.length), line: Number(r.line) }));
    } finally {
      await this.persistence.close();
    }
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

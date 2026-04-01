import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from "@/lib/core/graph/adjacency-list.js";
import path from "node:path";
import duckdb from "duckdb";
import { logger } from "@/lib/core/utils/logger.js";
import os from "node:os";

/**
 * Conducks — Synapse Persistence Interface
 */
export interface SynapsePersistence {
  save(graph: ConducksAdjacencyList): Promise<string>;
  saveSpectrum(filePath: string, spectrum: any): Promise<void>;
  load(graph: ConducksAdjacencyList): Promise<boolean>;
  fetchNodeMeat(nodeId: string): Promise<any | null>;
  clear(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
}

/**
 * Conducks — High-Performance DuckDB Persistence (Conducks Stability)
 */
export class DuckDbPersistence implements SynapsePersistence {
  private cacheDir: string;
  private dbPath: string;
  private db: any = null;
  private readOnly: boolean;
  private connectingPromise: Promise<any> | null = null;

  constructor(baseDir?: string, readOnly: boolean = false) {
    this.readOnly = readOnly;
    let projectRoot = baseDir || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    if (projectRoot === ":memory:") {
      this.dbPath = ":memory:";
      this.cacheDir = "";
    } else {
      projectRoot = path.resolve(projectRoot);
      if (projectRoot === '/' || projectRoot === '\\') {
        projectRoot = path.join(os.homedir(), '.conducks', 'synapses', 'root-fallback');
      }

      this.cacheDir = path.join(projectRoot, 'data');
      this.dbPath = path.join(this.cacheDir, 'conducks-synapse.db');
      logger.info(`Persistence Initialized at: ${projectRoot}`);
    }
  }

  private async connect(): Promise<any> {
    if (this.db) return this.db;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = this._doConnect();
    try {
      this.db = await this.connectingPromise;
      return this.db;
    } catch (err) {
      this.connectingPromise = null;
      throw err;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async _doConnect(): Promise<any> {
    if (this.dbPath !== ":memory:") {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }

    const isExisting = await fs.stat(this.dbPath).then(() => true).catch(() => false);
    if (this.readOnly && !isExisting && this.dbPath !== ":memory:") return null;

    const dbOptions = (this.readOnly && this.dbPath !== ":memory:") ? duckdb.OPEN_READONLY : undefined;

    let db: any = null;
    let attempts = 0;
    const maxAttempts = 6;

    const isLockError = (msg: string) => 
      msg.includes('busy') || msg.includes('locked') || msg.includes('Conflicting lock') || 
      msg.includes('Permission denied') || msg.includes('IO Error: Could not set lock');

    while (attempts < maxAttempts) {
      try {
        db = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Database Connection Timeout: ${this.dbPath}`));
          }, 6000);

          const instance = dbOptions 
            ? new duckdb.Database(this.dbPath, dbOptions, (err) => {
                clearTimeout(timeout);
                if (err) return reject(err);
                resolve(instance);
              })
            : new duckdb.Database(this.dbPath, (err) => {
                clearTimeout(timeout);
                if (err) return reject(err);
                resolve(instance);
              });
        });
        break;
      } catch (err: any) {
        attempts++;
        if (isLockError(err.message || '') && attempts < maxAttempts) {
          const waitTime = Math.pow(2, attempts) * 500;
          console.error(`🛡️ [Conducks Persistence] Vault locked. Retrying in ${waitTime}ms...`);
          await new Promise(res => setTimeout(res, waitTime));
          continue;
        }
        throw err;
      }
    }

    if (!db) return null;

    const run = (sql: string): Promise<void> =>
      new Promise((res, rej) => db.run(sql, (e: any) => (e ? rej(e) : res())));

    if (!this.readOnly) {
      await run("INSTALL json;");
      await run("LOAD json;");

      await run(`CREATE TABLE IF NOT EXISTS pulses (id VARCHAR PRIMARY KEY, timestamp BIGINT, metadata VARCHAR);`);
      await run(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);`);
      await run(`CREATE TABLE IF NOT EXISTS nodes (
        id TEXT, pulseId VARCHAR, kind TEXT, name TEXT, file VARCHAR, gravity DOUBLE, 
        kineticEnergy DOUBLE, frameworks VARCHAR, isTest BOOLEAN, complexity INTEGER, 
        debtMarkers VARCHAR, resonance INTEGER, entropy DOUBLE, primaryAuthor VARCHAR, 
        authorCount INTEGER, lastModified INTEGER, tenureDays INTEGER, coveredBy VARCHAR, 
        anomaly VARCHAR, isEntryPoint BOOLEAN, ecosystem VARCHAR, version VARCHAR, 
        canonicalKind VARCHAR, canonicalRank INTEGER, metadata VARCHAR,
        PRIMARY KEY (id, pulseId)
      );`);
      await run(`CREATE TABLE IF NOT EXISTS edges (
        id TEXT, pulseId VARCHAR, sourceId TEXT, targetId TEXT, type TEXT, 
        confidence DOUBLE, properties VARCHAR
      );`);
    }

    return db;
  }

  public async save(graph: ConducksAdjacencyList): Promise<string> {
    const db = await this.connect();
    if (!db) throw new Error("Structural Vault is Locked.");

    const nodes = Array.from((graph as any).nodes.values()) as ConducksNode[];
    const allEdges = this.serializeEdges(graph);
    const pulseId = `pulse_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise((resolve, reject) => {
      // Manual transaction because DuckDB doesn't serve db.serialize
      db.exec("BEGIN TRANSACTION", async (err: any) => {
        if (err) return reject(err);
        try {
          // Clear metadata and re-insert
          await new Promise<void>((r, j) => db.run("DELETE FROM metadata", (e: any) => e ? j(e) : r()));
          const metaStmt = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
          for (const [key, val] of graph.getAllMetadata().entries()) {
            await new Promise<void>((r, j) => metaStmt.run(key, val, (e: any) => e ? j(e) : r()));
          }
          metaStmt.finalize();

          // Insert Pulse
          await new Promise<void>((r, j) => db.run("INSERT INTO pulses (id, timestamp, metadata) VALUES (?, ?, ?)", pulseId, Date.now(), JSON.stringify({ nodeCount: nodes.length }), (e: any) => e ? j(e) : r()));

          // Insert Nodes
          const nodeStmt = db.prepare(`INSERT INTO nodes (id, pulseId, kind, name, file, gravity, kineticEnergy, frameworks, isTest, complexity, debtMarkers, resonance, entropy, primaryAuthor, authorCount, lastModified, tenureDays, coveredBy, anomaly, isEntryPoint, ecosystem, version, canonicalKind, canonicalRank, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const node of nodes) {
            await new Promise<void>((r, j) => nodeStmt.run(
              node.id, pulseId, node.label || 'unknown', node.properties.name || 'unknown', 
              node.properties.filePath || null, node.properties.rank || 0,
              node.properties.kineticEnergy || 0, JSON.stringify(node.properties.frameworks || []),
              node.properties.isTest ? true : false, node.properties.complexity || 1,
              JSON.stringify(node.properties.debtMarkers || []), node.properties.resonance || 0,
              node.properties.entropy || 0, node.properties.primaryAuthor || '',
              node.properties.authorCount || 0, node.properties.lastModified || 0,
              node.properties.tenureDays || 0, JSON.stringify(node.properties.coveredBy || []),
              node.properties.anomaly || null, node.properties.isEntryPoint ? true : false,
              node.properties.ecosystem || null, node.properties.version || null,
              node.properties.canonicalKind || null, node.properties.canonicalRank || 0,
              JSON.stringify(node.properties || {}), (e: any) => e ? j(e) : r()
            ));
          }
          nodeStmt.finalize();

          // Insert Edges
          const edgeStmt = db.prepare("INSERT INTO edges (id, pulseId, sourceId, targetId, type, confidence, properties) VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const e of allEdges) {
            await new Promise<void>((r, j) => edgeStmt.run(e.id, pulseId, e.sourceId, e.targetId, e.type, e.confidence, JSON.stringify(e.properties || {}), (e2: any) => e2 ? j(e2) : r()));
          }
          edgeStmt.finalize();

          db.exec("COMMIT", (err2: any) => err2 ? reject(err2) : resolve(pulseId));
        } catch (fail: any) {
          db.exec("ROLLBACK", () => reject(fail));
        }
      });
    });
  }

  public async saveSpectrum(filePath: string, spectrum: any): Promise<void> {
    const db = await this.connect();
    if (!db) return;
    const pulseId = `stream_${Date.now()}`;
    return new Promise((resolve, reject) => {
      db.exec("BEGIN TRANSACTION", async (err: any) => {
        if (err) return reject(err);
        try {
          const nodeStmt = db.prepare(`INSERT OR REPLACE INTO nodes (id, pulseId, kind, name, file, gravity, kineticEnergy, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const metaNode of spectrum.nodes) {
            const nodeId = `${filePath.toLowerCase()}::${metaNode.name}`;
            await new Promise<void>((r, j) => nodeStmt.run(nodeId, pulseId, metaNode.kind || 'unknown', metaNode.name || 'unknown', filePath.toLowerCase(), 0, 0, JSON.stringify({ ...metaNode.metadata, name: metaNode.name, range: metaNode.range }), (e: any) => e ? j(e) : r()));
          }
          nodeStmt.finalize();
          db.exec("COMMIT", (err2: any) => err2 ? reject(err2) : resolve());
        } catch (fail) {
          db.exec("ROLLBACK", () => reject(fail));
        }
      });
    });
  }

  public async load(graph: ConducksAdjacencyList, append: boolean = false): Promise<boolean> {
    try {
      const db = await this.connect();
      if (!db) return false;

      const pulseRows: any[] = await new Promise((res) => db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err ? [] : rows)));
      if (pulseRows.length === 0) return false;
      const latestPulseId = pulseRows[0].id;

      const metaRows: any[] = await new Promise((res) => db.all("SELECT * FROM metadata", (err: any, rows: any[]) => res(err ? [] : rows)));
      metaRows.forEach(row => graph.setMetadata(row.key, row.value));

      const nodes: any[] = await new Promise((res) => db.all("SELECT * FROM nodes WHERE pulseId = ?", [latestPulseId], (err: any, rows: any[]) => res(err ? [] : rows)));
      const edges: any[] = await new Promise((res) => db.all("SELECT * FROM edges WHERE pulseId = ?", [latestPulseId], (err: any, rows: any[]) => res(err ? [] : rows)));

      if (!append) {
        (graph as any).nodes.clear();
        (graph as any).outEdges.clear();
        (graph as any).inEdges.clear();
      }

      nodes.forEach(row => {
        try {
          graph.addNode({ id: row.id, label: row.kind, properties: { ...(row.metadata ? JSON.parse(row.metadata) : {}), name: row.name, filePath: row.file, rank: row.gravity, kineticEnergy: row.kineticEnergy, isEntryPoint: !!row.isEntryPoint } });
        } catch (e) { console.error(e); }
      });
      edges.forEach(row => graph.addEdge({ id: row.id, sourceId: row.sourceId, targetId: row.targetId, type: row.type, confidence: row.confidence, properties: row.properties ? JSON.parse(row.properties) : {} }));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  public async getRawConnection(): Promise<any> { return this.connect(); }

  public async fetchNodeMeat(nodeId: string): Promise<any | null> {
    const db = await this.connect();
    if (!db) return null;
    const pulseRows: any[] = await new Promise((res) => db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err ? [] : rows)));
    if (pulseRows.length === 0) return null;
    const rows: any[] = await new Promise((res) => db.all("SELECT metadata FROM nodes WHERE id = ? AND pulseId = ?", [nodeId, pulseRows[0].id], (err: any, rows: any[]) => res(err ? [] : rows)));
    return (rows.length > 0 && rows[0].metadata) ? JSON.parse(rows[0].metadata) : null;
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((res) => this.db.close(() => { this.db = null; res(); }));
    }
  }

  public async clear(): Promise<void> {
    if (this.dbPath !== ":memory:") await fs.rm(this.cacheDir, { recursive: true, force: true });
  }

  public isConnected(): boolean { return this.db !== null; }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

export const GraphPersistence = DuckDbPersistence;
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
 * Conducks — Legacy JSON Persistence Layer
 */
export class JsonPersistence implements SynapsePersistence {
  private cacheDir: string;

  constructor(baseDir: string = process.cwd(), private readonly fileSystem: any = fs) {
    this.cacheDir = path.join(baseDir, '.conducks');
  }

  public async saveSpectrum(): Promise<void> {
    return; // Legacy no-op
  }

  public async save(graph: ConducksAdjacencyList): Promise<string> {
    const data = {
      version: '1.0.0',
      timestamp: Date.now(),
      nodes: Array.from((graph as any).nodes.values()),
      edges: this.serializeEdges(graph)
    };
    try {
      if (!(await this.fileSystem.stat(this.cacheDir).catch(() => null))) {
        await this.fileSystem.mkdir(this.cacheDir, { recursive: true });
      }
      await this.fileSystem.writeFile(path.join(this.cacheDir, 'cache.json'), JSON.stringify(data, null, 2), 'utf-8');
      return 'json_latest';
    } catch (err) {
      console.error('[Conducks Persistence] JSON Save Failed:', err);
      return '';
    }
  }

  public async clear(): Promise<void> {
    await this.fileSystem.rm(this.cacheDir, { recursive: true, force: true });
  }

  public async load(graph: ConducksAdjacencyList): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(path.join(this.cacheDir, 'cache.json'), 'utf-8');
      const data = JSON.parse(content);
      if (data.nodes) for (const node of data.nodes) graph.addNode(node);
      if (data.edges) for (const edge of data.edges) graph.addEdge(edge);
      return true;
    } catch { return false; }
  }

  public async fetchNodeMeat(): Promise<any | null> {
    return null; // Not implemented for JSON
  }

  public async close(): Promise<void> { /* No-op */ }

  public isConnected(): boolean { return true; }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

/**
 * Conducks — High-Performance DuckDB Persistence (Conducks Stability)
 */
export class DuckDbPersistence implements SynapsePersistence {
  private cacheDir: string;
  private dbPath: string;
  private db: any = null;
  private readOnly: boolean;
  // FIX 1: Track in-flight connection promise to prevent redundant parallel connects
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
        const fallback = path.join(os.homedir(), '.conducks', 'synapses', 'root-fallback');
        projectRoot = fallback;
      }

      this.cacheDir = path.join(projectRoot, 'data');
      this.dbPath = path.join(this.cacheDir, 'conducks-synapse.db');
      logger.info(`Persistence Initialized at: ${projectRoot}`);
    }
  }

  public setReadOnly(readOnly: boolean): void {
    if (this.db) {
      throw new Error("[Conducks Persistence] Cannot change readOnly mode after connection is established.");
    }
    this.readOnly = readOnly;
  }

  public setDbPath(newPath: string): void {
    this.dbPath = newPath;
    if (this.dbPath !== ':memory:') {
      this.cacheDir = path.dirname(this.dbPath);
    }
  }

  /**
   * FIX 1 (CORE): Fully sequential, Promise-based connect().
   *
   * The original implementation used db.serialize() with nested callbacks but
   * resolved the outer Promise before schema DDL statements had actually
   * committed. This created a race condition where callers received a "ready"
   * db handle while CREATE TABLE statements were still in-flight.
   *
   * The fix wraps every DDL step in an explicit Promise so the outer Promise
   * only resolves once the *last* schema statement has confirmed success via
   * its callback. A single in-flight guard (connectingPromise) prevents
   * multiple concurrent callers from each spinning up their own connection.
   */
  private async connect(): Promise<any> {
    if (this.db) return this.db;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = this._doConnect();

    try {
      this.db = await this.connectingPromise;
      // Initialize Yield Protocol (only for readers)
      if (this.readOnly) {
        this.registerYieldListener();
      }
      return this.db;
    } catch (err) {
      this.connectingPromise = null;
      throw err;
    } finally {
      this.connectingPromise = null;
    }
  }

  private registerYieldListener(): void {
    const yieldSignal = 'SIGUSR2';
    // Clear any previous listeners to prevent memory leaks during re-connect
    process.removeAllListeners(yieldSignal);
    
    process.once(yieldSignal, async () => {
      if (this.db) {
        logger.info(`[Conducks Persistence] Yield signal received. Closing handle while Writer is active...`);
        await this.close();
      }
    });
  }

  /** Internal: performs the actual async connection + sequential schema setup. */
  private async _doConnect(): Promise<any> {
    try {
      if (this.dbPath !== ":memory:") {
        await fs.mkdir(this.cacheDir, { recursive: true });
      }

      const isExisting = await fs.stat(this.dbPath).then(() => true).catch(() => false);
      if (this.readOnly && !isExisting && this.dbPath !== ":memory:") {
        return null;
      }

      const dbOptions = (this.readOnly && this.dbPath !== ":memory:") ? duckdb.OPEN_READONLY : undefined;
      
      let db: any = null;
      let attempts = 0;
      const maxAttempts = 5;

      const isLockError = (msg: string) => 
        msg.includes('busy') || 
        msg.includes('locked') || 
        msg.includes('Conflicting lock') || 
        msg.includes('Permission denied');

      while (attempts < maxAttempts) {
        try {
          db = await new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Database Connection Timeout (Possible OS Lock): ${this.dbPath}`));
            }, 8000); // Extended timeout for high-concurrency flushes

            const callback = (err: any) => {
              clearTimeout(timeout);
              if (err) return reject(err);
              resolve(instance);
            };

            const instance = dbOptions 
              ? new duckdb.Database(this.dbPath, dbOptions, callback)
              : new duckdb.Database(this.dbPath, callback);
          });
          break; // Success!
        } catch (err: any) {
          attempts++;
          const errorMsg = err.message || '';
          
          if (isLockError(errorMsg) && attempts < maxAttempts) {
            const waitTime = Math.pow(2, attempts) * 500;
            logger.warn(`[Conducks Persistence] DB busy or locked (Attempt ${attempts}/${maxAttempts}). Retrying in ${waitTime}ms...`);
            await new Promise(res => setTimeout(res, waitTime));
            continue;
          }
          
          logger.error(`[Conducks Persistence] Connection Failed permanently: ${errorMsg}`);
          throw err;
        }
      }

      if (!db) return null;

      const run = (sql: string, ...params: any[]): Promise<void> =>
        new Promise((res, rej) =>
          params.length
            ? db.run(sql, ...params, (e: any) => (e ? rej(e) : res()))
            : db.run(sql, (e: any) => (e ? rej(e) : res()))
        );

      try {
        // Conducks Concurrency: Enable WAL mode for better read/write sharing
        try {
          await run("PRAGMA journal_mode=WAL;");
        } catch (walErr) {
          // Some environments (e.g. read-only mounts) might not support WAL
          logger.debug("WAL mode not supported or already in use.");
        }

        await run("INSTALL json;");
        await run("LOAD json;");

        if (!this.readOnly) {
          await run(`CREATE TABLE IF NOT EXISTS pulses (
            id VARCHAR PRIMARY KEY,
            timestamp BIGINT,
            metadata VARCHAR
          );`);

          await run(`CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT
          );`);

          await run(`CREATE TABLE IF NOT EXISTS nodes (
            id TEXT,
            pulseId VARCHAR,
            kind TEXT,
            name TEXT,
            file VARCHAR,
            gravity DOUBLE,
            kineticEnergy DOUBLE,
            frameworks VARCHAR,
            isTest BOOLEAN DEFAULT FALSE,
            complexity INTEGER DEFAULT 1,
            debtMarkers VARCHAR,
            resonance INTEGER DEFAULT 0,
            entropy DOUBLE DEFAULT 0,
            primaryAuthor VARCHAR,
            authorCount INTEGER DEFAULT 0,
            lastModified INTEGER DEFAULT 0,
            tenureDays INTEGER DEFAULT 0,
            coveredBy VARCHAR,
            anomaly VARCHAR,
            isEntryPoint BOOLEAN DEFAULT FALSE,
            ecosystem VARCHAR,
            version VARCHAR,
            canonicalKind VARCHAR,
            canonicalRank INTEGER,
            metadata VARCHAR,
            PRIMARY KEY (id, pulseId)
          );`);

          await run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ecosystem VARCHAR;");
          await run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS version VARCHAR;");
          await run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS canonicalKind VARCHAR;");
          await run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS canonicalRank INTEGER;");

          await run(`CREATE TABLE IF NOT EXISTS edges (
            id TEXT,
            pulseId VARCHAR,
            sourceId TEXT,
            targetId TEXT,
            type TEXT,
            confidence DOUBLE,
            properties VARCHAR
          );`);
        }

        return db;
      } catch (schemaErr: any) {
        console.error(`[Conducks Persistence] Schema Error: ${schemaErr.message}`);
        throw schemaErr;
      }
    } catch (outerErr) {
      console.error(`[Conducks Persistence] Fatal Connection Error: ${outerErr}`);
      throw outerErr;
    }
  }

  public async saveSpectrum(filePath: string, spectrum: any): Promise<void> {
    const db = await this.connect();
    if (!db) return;

    const pulseId = `stream_${Date.now()}`; // Temporary stream pulse ID

    return new Promise((resolve, reject) => {
      db.serialize(async () => {
        try {
          db.exec("BEGIN TRANSACTION");

          const nodeStmt = db.prepare(`INSERT OR REPLACE INTO nodes (id, pulseId, kind, name, file, gravity, kineticEnergy, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const metaNode of spectrum.nodes) {
            const nodeId = `${filePath.toLowerCase()}::${metaNode.name}`;
            await new Promise<void>((res, rej) => {
              nodeStmt.run(
                nodeId,
                pulseId,
                metaNode.kind || 'unknown',
                metaNode.name || 'unknown',
                filePath.toLowerCase(),
                0, 0,
                JSON.stringify({ ...metaNode.metadata, name: metaNode.name, range: metaNode.range }),
                (err: any) => err ? rej(err) : res()
              );
            });
          }
          nodeStmt.finalize();
          
          db.exec("COMMIT", (err: any) => err ? reject(err) : resolve());
        } catch (err) {
          db.exec("ROLLBACK");
          reject(err);
        }
      });
    });
  }

  public async save(graph: ConducksAdjacencyList): Promise<string> {
    const db = await this.connect();
    const nodes = Array.from((graph as any).nodes.values()) as ConducksNode[];
    const allEdges = this.serializeEdges(graph);
    const pulseId = `pulse_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise((resolve, reject) => {
      db.serialize(async () => {
        try {
          db.exec("BEGIN TRANSACTION");

          db.run("DELETE FROM metadata");
          const metaStmt = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
          for (const [key, val] of graph.getAllMetadata().entries()) {
            await new Promise<void>((res, rej) => metaStmt.run(key, val, (err: any) => err ? rej(err) : res()));
          }
          metaStmt.finalize();

          await new Promise<void>((res, rej) => db.run("INSERT INTO pulses (id, timestamp, metadata) VALUES (?, ?, ?)", pulseId, Date.now(), JSON.stringify({ nodeCount: nodes.length }), (err: any) => err ? rej(err) : res()));

          const nodeStmt = db.prepare(`INSERT INTO nodes (id, pulseId, kind, name, file, gravity, kineticEnergy, frameworks, isTest, complexity, debtMarkers, resonance, entropy, primaryAuthor, authorCount, lastModified, tenureDays, coveredBy, anomaly, isEntryPoint, ecosystem, version, canonicalKind, canonicalRank, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const node of nodes) {
            await new Promise<void>((res, rej) => {
              nodeStmt.run(
                node.id, 
                pulseId, 
                node.label || 'unknown', 
                node.properties.name || 'unknown', 
                node.properties.filePath || null,
                node.properties.rank || 0, 
                node.properties.kineticEnergy || 0,
                JSON.stringify(node.properties.frameworks || []),
                node.properties.isTest ? 1 : 0,
                node.properties.complexity || 1,
                JSON.stringify(node.properties.debtMarkers || []),
                node.properties.resonance || 0,
                node.properties.entropy || 0,
                node.properties.primaryAuthor || '',
                node.properties.authorCount || 0,
                node.properties.lastModified || 0,
                node.properties.tenureDays || 0,
                JSON.stringify(node.properties.coveredBy || []),
                node.properties.anomaly || null,
                node.properties.isEntryPoint ? 1 : 0,
                node.properties.ecosystem || null,
                node.properties.version || null,
                node.properties.canonicalKind || null,
                node.properties.canonicalRank || 0,
                JSON.stringify(node.properties || {}),
                (err: any) => err ? rej(err) : res()
              );
            });
          }
          nodeStmt.finalize();

          const edgeStmt = db.prepare("INSERT INTO edges (id, pulseId, sourceId, targetId, type, confidence, properties) VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const e of allEdges) {
            await new Promise<void>((res, rej) => edgeStmt.run(e.id, pulseId, e.sourceId, e.targetId, e.type, e.confidence, JSON.stringify(e.properties || {}), (err: any) => err ? rej(err) : res()));
          }
          edgeStmt.finalize();

          db.exec("COMMIT", (err: any) => {
            if (err) reject(err);
            else resolve(pulseId);
          });
        } catch (err) {
          db.exec("ROLLBACK");
          reject(err);
        }
      });
    });
  }

  public async load(graph: ConducksAdjacencyList, append: boolean = false): Promise<boolean> {
    try {
      const db = await this.connect();
      if (!db) return false;

      const latestPulseId: string | null = await new Promise((res) => db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err || rows.length === 0 ? null : rows[0].id)));
      if (!latestPulseId) return false;

      const metaRows: any[] = await new Promise((res) => db.all("SELECT * FROM metadata", (err: any, rows: any[]) => res(err ? [] : rows)));
      metaRows.forEach(row => graph.setMetadata(row.key, row.value));

      const nodes: any[] = await new Promise((res) => db.all("SELECT * FROM nodes WHERE pulseId = ?", latestPulseId, (err: any, rows: any[]) => res(err ? [] : rows)));
      const edges: any[] = await new Promise((res) => db.all("SELECT * FROM edges WHERE pulseId = ?", latestPulseId, (err: any, rows: any[]) => res(err ? [] : rows)));

      if (!append) {
        // Clear before load to ensure fresh structural resonance (Phase 11.2)
        (graph as any).nodes.clear();
        (graph as any).outEdges.clear();
        (graph as any).inEdges.clear();
      }

      nodes.forEach(row => {
        try {
          graph.addNode({ id: row.id, label: row.kind, properties: { ...(row.metadata ? JSON.parse(row.metadata) : {}), name: row.name, filePath: row.file, rank: row.gravity || 0, complexity: row.complexity || 1, debtMarkers: row.debtMarkers ? JSON.parse(row.debtMarkers) : [], resonance: row.resonance || 0, entropy: row.entropy || 0, primaryAuthor: row.primaryAuthor || '', authorCount: row.authorCount || 0, lastModified: row.lastModified || 0, tenureDays: row.tenureDays || 0, coveredBy: row.coveredBy ? JSON.parse(row.coveredBy) : [], anomaly: row.anomaly || null, isTest: !!row.isTest, isEntryPoint: !!row.isEntryPoint, ecosystem: row.ecosystem || null, version: row.version || null } });
        } catch (e) {
          console.error(`[Conducks Persistence] Node parse error for ${row.id}: ${e}`);
        }
      });
      edges.forEach(row => graph.addEdge({ id: row.id, sourceId: row.sourceId, targetId: row.targetId, type: row.type, confidence: row.confidence, properties: row.properties ? JSON.parse(row.properties) : {} }));
      return true;
    } catch (err: any) {
      console.error(`[Conducks Persistence] Load Error: ${err.message}`);
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => { this.db.close(() => { this.db = null; resolve(); }); });
    }
  }

  public async clear(): Promise<void> {
    if (this.dbPath !== ":memory:") await fs.rm(this.cacheDir, { recursive: true, force: true });
  }

  public async fetchNodeMeat(nodeId: string): Promise<any | null> {
    try {
      const db = await this.connect();
      if (!db) return null;

      // Fetch from the latest pulse
      const latestPulseId: string | null = await new Promise((res) => db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err || rows.length === 0 ? null : rows[0].id)));
      if (!latestPulseId) return null;

      const rows: any[] = await new Promise((res) => db.all("SELECT metadata FROM nodes WHERE id = ? AND pulseId = ?", nodeId, latestPulseId, (err: any, rows: any[]) => res(err ? [] : rows)));
      
      if (rows.length > 0 && rows[0].metadata) {
        return JSON.parse(rows[0].metadata);
      }
      return null;
    } catch (err) {
      logger.error(`[Conducks Persistence] Meat fetch failed for ${nodeId}:`, err);
      return null;
    }
  }

  public async getRawConnection(): Promise<any> { return this.connect(); }

  public isConnected(): boolean { return this.db !== null; }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

export const GraphPersistence = DuckDbPersistence;
export type GraphPersistence = SynapsePersistence;
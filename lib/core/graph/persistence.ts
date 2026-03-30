import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from "./adjacency-list.js";
import path from "node:path";
import duckdb from "duckdb";

/**
 * Conducks — Synapse Persistence Interface
 */
export interface SynapsePersistence {
  save(graph: ConducksAdjacencyList): Promise<string>;
  load(graph: ConducksAdjacencyList): Promise<boolean>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Conducks — Legacy JSON Persistence Layer
 */
export class JsonPersistence implements SynapsePersistence {
  private cacheDir: string;

  constructor(baseDir: string = process.cwd(), private readonly fileSystem: any = fs) {
    this.cacheDir = path.join(baseDir, '.conducks');
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

  public async close(): Promise<void> { /* No-op */ }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

/**
 * Conducks — High-Performance DuckDB Persistence (Apostle v6 Stability)
 */
export class DuckDbPersistence implements SynapsePersistence {
  private cacheDir: string;
  private dbPath: string;
  private db: any = null;
  private readOnly: boolean;

  constructor(baseDir: string = process.cwd(), readOnly: boolean = false) {
    this.readOnly = readOnly;
    if (baseDir === ":memory:") {
      this.dbPath = ":memory:";
      this.cacheDir = "";
    } else {
      this.cacheDir = path.join(baseDir, '.conducks');
      this.dbPath = path.join(this.cacheDir, 'synapse.db');
    }
  }

  public setDbPath(newPath: string): void {
    this.dbPath = newPath;
    if (this.dbPath !== ':memory:') {
      this.cacheDir = path.dirname(this.dbPath);
    }
  }

  private async connect(): Promise<any> {
    if (this.db) return this.db;
    if (this.dbPath !== ":memory:") await fs.mkdir(this.cacheDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
      try {
        const db = new duckdb.Database(this.dbPath, (err: any) => {
          if (err) return reject(err);
          this.db = db;
          
          db.serialize(() => {
            db.run("INSTALL json; LOAD json;");
            db.run(`CREATE TABLE IF NOT EXISTS pulses (id VARCHAR PRIMARY KEY, timestamp BIGINT, metadata VARCHAR);`);
            db.run(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);`);
            
            const nodeSchema = `CREATE TABLE IF NOT EXISTS nodes (id TEXT, pulseId VARCHAR, label TEXT, name TEXT, filePath VARCHAR, rank DOUBLE, kineticEnergy DOUBLE, frameworks VARCHAR, isTest BOOLEAN DEFAULT FALSE, complexity INTEGER DEFAULT 1, debtMarkers VARCHAR, resonance INTEGER DEFAULT 0, entropy DOUBLE DEFAULT 0, primaryAuthor VARCHAR, authorCount INTEGER DEFAULT 0, lastModified INTEGER DEFAULT 0, tenureDays INTEGER DEFAULT 0, coveredBy VARCHAR, anomaly VARCHAR, isEntryPoint BOOLEAN DEFAULT FALSE, ecosystem VARCHAR, version VARCHAR, metadata VARCHAR, PRIMARY KEY (id, pulseId));`;
            
            db.run(nodeSchema, (err) => {
              if (!err) {
                db.run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ecosystem VARCHAR;");
                db.run("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS version VARCHAR;");
              }
            });

            db.run(`CREATE TABLE IF NOT EXISTS edges (id TEXT, pulseId VARCHAR, sourceId TEXT, targetId TEXT, type TEXT, confidence DOUBLE, properties VARCHAR);`, (err: any) => {
              if (err) return reject(err);
              resolve(db);
            });
          });
        });
      } catch (e) {
        reject(e);
      }
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
          
          // 1. Metadata (Apostle v5.3)
          db.run("DELETE FROM metadata");
          const metaStmt = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
          for (const [key, val] of graph.getAllMetadata().entries()) {
             await new Promise<void>((res, rej) => metaStmt.run(key, val, (err: any) => err ? rej(err) : res()));
          }
          metaStmt.finalize();

          // 2. Pulse Snapshot
          await new Promise<void>((res, rej) => db.run("INSERT INTO pulses (id, timestamp, metadata) VALUES (?, ?, ?)", pulseId, Date.now(), JSON.stringify({ nodeCount: nodes.length }), (err: any) => err ? rej(err) : res()));

          // 3. Nodes
          const nodeStmt = db.prepare(`INSERT INTO nodes (id, pulseId, label, name, filePath, rank, kineticEnergy, frameworks, isTest, complexity, debtMarkers, resonance, entropy, primaryAuthor, authorCount, lastModified, tenureDays, coveredBy, anomaly, isEntryPoint, ecosystem, version, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const node of nodes) {
            await new Promise<void>((res, rej) => {
              nodeStmt.run(
                node.id, pulseId, node.label, node.properties.name, node.properties.filePath, 
                node.properties.rank || 0, node.properties.kineticEnergy || 0, 
                JSON.stringify(node.properties.frameworks || []), 
                node.properties.isTest ? 1 : 0, 
                node.properties.complexity || (node as any).complexity || 1, 
                JSON.stringify(node.properties.debtMarkers || (node as any).debtMarkers || []), 
                node.properties.resonance || (node as any).resonance || 0, 
                node.properties.entropy || (node as any).entropy || 0, 
                node.properties.primaryAuthor || (node as any).primaryAuthor || '', 
                node.properties.authorCount || (node as any).authorCount || 0, 
                node.properties.lastModified || (node as any).lastModified || 0, 
                node.properties.tenureDays || (node as any).tenureDays || 0, 
                JSON.stringify(node.properties.coveredBy || (node as any).coveredBy || []), 
                node.properties.anomaly || (node as any).anomaly || null, 
                node.properties.isEntryPoint ? 1 : 0, 
                node.properties.ecosystem || null,
                node.properties.version || null,
                JSON.stringify(node.properties || {}), 
                (err: any) => err ? rej(err) : res()
              );
            });
          }
          nodeStmt.finalize();

          // 4. Edges
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

  public async load(graph: ConducksAdjacencyList): Promise<boolean> {
    try {
      const db = await this.connect();
      const latestPulseId: string | null = await new Promise((res) => db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err || rows.length === 0 ? null : rows[0].id)));
      if (!latestPulseId) return false;
      
      const metaRows: any[] = await new Promise((res) => db.all("SELECT * FROM metadata", (err: any, rows: any[]) => res(err ? [] : rows)));
      metaRows.forEach(row => graph.setMetadata(row.key, row.value));

      const nodes: any[] = await new Promise((res) => db.all("SELECT * FROM nodes WHERE pulseId = ?", latestPulseId, (err: any, rows: any[]) => res(err ? [] : rows)));
      const edges: any[] = await new Promise((res) => db.all("SELECT * FROM edges WHERE pulseId = ?", latestPulseId, (err: any, rows: any[]) => res(err ? [] : rows)));
      nodes.forEach(row => {
        try {
          graph.addNode({ id: row.id, label: row.label, properties: { ...(row.metadata ? JSON.parse(row.metadata) : {}), name: row.name, filePath: row.filePath, rank: row.rank || 0, complexity: row.complexity || 1, debtMarkers: row.debtMarkers ? JSON.parse(row.debtMarkers) : [], resonance: row.resonance || 0, entropy: row.entropy || 0, primaryAuthor: row.primaryAuthor || '', authorCount: row.authorCount || 0, lastModified: row.lastModified || 0, tenureDays: row.tenureDays || 0, coveredBy: row.coveredBy ? JSON.parse(row.coveredBy) : [], anomaly: row.anomaly || null, isTest: !!row.isTest, isEntryPoint: !!row.isEntryPoint, ecosystem: row.ecosystem || null, version: row.version || null } });
        } catch (e) {
          console.error(`[Conducks Persistence] Node parse error for ${row.id}: ${e}`);
        }
      });
      edges.forEach(row => graph.addEdge({ id: row.id, sourceId: row.sourceId, targetId: row.targetId, type: row.type, confidence: row.confidence, properties: row.properties ? JSON.parse(row.properties) : {} }));
      return true;
    } catch { return false; }
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => { this.db.close(() => { this.db = null; resolve(); }); });
    }
  }

  public async clear(): Promise<void> {
    if (this.dbPath !== ":memory:") await fs.rm(this.cacheDir, { recursive: true, force: true });
  }

  public async getRawConnection(): Promise<any> { return this.connect(); }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

export const GraphPersistence = DuckDbPersistence;
export type GraphPersistence = SynapsePersistence;

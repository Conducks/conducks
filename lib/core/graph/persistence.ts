import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from "./adjacency-list.js";
import path from "node:path";

/**
 * Conducks — Synapse Persistence Interface
 */
export interface SynapsePersistence {
  save(graph: ConducksAdjacencyList): Promise<void>;
  load(graph: ConducksAdjacencyList): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * Conducks — Legacy JSON Persistence Layer
 * 
 * Maintained for portability and zero-dependency environments.
 */
export class JsonPersistence implements SynapsePersistence {
  private cacheDir: string;

  constructor(baseDir: string = process.cwd(), private readonly fileSystem: any = fs) {
    this.cacheDir = path.join(baseDir, '.conducks');
  }

  public async save(graph: ConducksAdjacencyList): Promise<void> {
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
    } catch (err) {
      console.error('[Conducks Persistence] JSON Save Failed:', err);
    }
  }

  public async clear(): Promise<void> {
    await this.fileSystem.rm(this.cacheDir, { recursive: true, force: true });
  }

  public async load(graph: ConducksAdjacencyList): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(path.join(this.cacheDir, 'cache.json'), 'utf-8');
      const data = JSON.parse(content);
      for (const node of data.nodes) graph.addNode(node);
      for (const edge of data.edges) graph.addEdge(edge);
      return true;
    } catch { return false; }
  }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    const allEdges: ConducksEdge[] = [];
    const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
    for (const edgeSet of outEdges.values()) allEdges.push(...Array.from(edgeSet));
    return allEdges;
  }
}

/**
 * Conducks — High-Performance DuckDB Persistence (Kinetic Engine v3)
 * 
 * Optimized for vectorized analysis and framework coverage aggregation.
 * Performs direct parameterized batch inserts to bypass V8 string limits.
 */
export class DuckDbPersistence implements SynapsePersistence {
  private cacheDir: string;
  private dbPath: string;
  private db: any = null;

  constructor(baseDir: string = process.cwd()) {
    this.cacheDir = path.join(baseDir, '.conducks');
    this.dbPath = path.join(this.cacheDir, 'synapse.db');
  }

  /**
   * Apostle v3 — Connection Orchestration
   * Ensures a stable, singleton connection to the Synapse Prism.
   */
  private async connect(): Promise<any> {
    if (this.db) return this.db;
    
    const { default: duckdb } = await import('duckdb');
    await fs.mkdir(this.cacheDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
      const db = new duckdb.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        this.db = db;
        
        // Initialize tables if they don't exist
        db.exec(`
          CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY, 
            label TEXT, 
            name TEXT, 
            filePath VARCHAR,
            rank DOUBLE,
            kineticEnergy DOUBLE,
            frameworks JSON,
            isTest BOOLEAN DEFAULT FALSE,
            metadata JSON
          );
        `);

        // Apostle v3 Schema Evolution: 
        db.exec("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS metadata JSON;");

        db.exec(`
          CREATE TABLE IF NOT EXISTS edges (
            id TEXT,
            sourceId TEXT,
            targetId TEXT,
            type TEXT,
            confidence DOUBLE,
            properties JSON
          );
        `, (err) => {
          if (err) return reject(err);
          resolve(db);
        });
      });
    });
  }

  /**
   * Kinetic v3 — Streamed Vectorized Persistence
   * Performs high-speed atomic sync using transactions.
   */
  public async save(graph: ConducksAdjacencyList): Promise<void> {
    try {
      const db = await this.connect();
      
      const nodes = Array.from((graph as any).nodes.values()) as ConducksNode[];
      const allEdges: ConducksEdge[] = [];
      const outEdges = (graph as any).outEdges as Map<string, Set<ConducksEdge>>;
      for (const edgeSet of outEdges.values()) {
        allEdges.push(...Array.from(edgeSet));
      }

      await new Promise((resolve, reject) => {
        db.exec("BEGIN TRANSACTION", (err: any) => {
          if (err) return reject(err);

          // 1. Clear existing synapse
          db.exec("DELETE FROM nodes; DELETE FROM edges;");

          // 2. Transact Nodes
          const nodeStmt = db.prepare(`
            INSERT INTO nodes (id, label, name, filePath, rank, kineticEnergy, frameworks, isTest, metadata) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const node of nodes) {
            nodeStmt.run(
              node.id,
              node.label,
              node.properties.name,
              node.properties.filePath,
              node.properties.rank || 0,
              node.properties.kineticEnergy || 0,
              JSON.stringify(node.properties.frameworks || []),
              node.properties.isTest ? 1 : 0,
              JSON.stringify(node.properties || {})
            );
          }
          nodeStmt.finalize();

          // 3. Transact Edges (Synapses)
          const edgeStmt = db.prepare("INSERT INTO edges (id, sourceId, targetId, type, confidence, properties) VALUES (?, ?, ?, ?, ?, ?)");
          for (const e of allEdges) {
            edgeStmt.run(
              e.id, 
              e.sourceId, 
              e.targetId, 
              e.type, 
              e.confidence, 
              JSON.stringify(e.properties || {})
            );
          }
          edgeStmt.finalize();

          db.exec("COMMIT", (err: any) => err ? reject(err) : resolve(null));
        });
      });

      console.log(`[Conducks Synapse] DuckDB: Atomic structural index synced (Nodes: ${nodes.length}, Edges: ${allEdges.length}).`);
    } catch (err) {
      console.error('[Conducks Persistence] DuckDB Sync Failed:', err);
      throw err;
    }
  }

  public async load(graph: ConducksAdjacencyList): Promise<boolean> {
    try {
      const db = await this.connect();
      
      const nodes: any[] = await new Promise((resolve) => {
        db.all("SELECT * FROM nodes", (err: any, rows: any[]) => resolve(err ? [] : rows));
      });

      const edges: any[] = await new Promise((resolve) => {
        db.all("SELECT * FROM edges", (err: any, rows: any[]) => resolve(err ? [] : rows));
      });

      if (nodes.length === 0) return false;

      nodes.forEach(row => {
        let meta = {};
        try {
          meta = (row.metadata && row.metadata !== '') ? JSON.parse(row.metadata) : {};
        } catch (e) {
          console.warn(`[Conducks Persistence] Failed to parse metadata for ${row.id}`);
        }

        graph.addNode({
          id: row.id,
          label: row.label,
          properties: {
            ...meta,
            name: row.name,
            filePath: row.filePath,
            rank: row.rank || 0,
            kineticEnergy: row.kineticEnergy || 0,
            frameworks: (row.frameworks && row.frameworks !== '') ? JSON.parse(row.frameworks) : [],
            isTest: !!row.isTest
          }
        });
      });

      edges.forEach(row => {
        graph.addEdge({
          id: row.id,
          sourceId: row.sourceId,
          targetId: row.targetId,
          type: row.type,
          confidence: row.confidence,
          properties: (row.properties && row.properties !== '') ? JSON.parse(row.properties) : {}
        });
      });

      console.log(`[Conducks Synapse] Structural Mirror restored: ${nodes.length} Neurons, ${edges.length} Synapses.`);
      return true;
    } catch (err) {
      console.error('[Conducks Persistence] Structural Load Failed:', err);
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close(() => {
          this.db = null;
          resolve();
        });
      });
    }
  }

  public async clear(): Promise<void> {
    await fs.rm(this.cacheDir, { recursive: true, force: true });
  }

  /**
   * Apostle v3 — DB Access
   * Returns the underlying DuckDB connection for vectorized analysis.
   */
  public async getRawConnection(): Promise<any> {
    return this.connect();
  }
}

// Export the high-speed driver by default, but maintain interface accessibility.
export const GraphPersistence = DuckDbPersistence;
export type GraphPersistence = SynapsePersistence;

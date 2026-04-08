import { ConducksNode, ConducksEdge, ConducksAdjacencyList, NodeId } from "../graph/adjacency-list.js";
import { chronicle } from "../../core/git/chronicle-interface.js";
import { logger } from "../utils/logger.js";
import path from "node:path";
import fs from "node:fs/promises";
import duckdb from "duckdb";

/**
 * Conducks — DuckDB Persistence Engine 🛡️ 🟦
 * 
 * Native storage layer for the High-Fidelity Synapse Graph.
 */
export class SynapsePersistence {
  private db: duckdb.Database | null = null;
  private cacheDir: string;
  private dbPath: string;

  constructor(root?: string, public readOnly: boolean = true, public lazy: boolean = false) {
    const projectRoot = root || chronicle.getProjectDir() || process.cwd();
    this.cacheDir = path.join(projectRoot, ".conducks");
    this.dbPath = path.join(this.cacheDir, "conducks-synapse.db");
  }

  private async connect(retries: number = 8): Promise<duckdb.Database | null> {
    if (this.db) return this.db;

    try {
      const dbExists = await fs.access(this.dbPath).then(() => true).catch(() => false);
      
      if (this.readOnly && !dbExists) {
        logger.warn(`🛡️ [Persistence] Structural Synapse not found at ${this.dbPath}. Standing by for first pulse...`);
        return null;
      }

      if (!this.readOnly && !dbExists) {
        await fs.mkdir(this.cacheDir, { recursive: true });
      }

      // 🛡️ [Vault Hardening] Conducks Connection Isolation
      // Mode: READ_ONLY — Allows multiple processes if no writer is active.
      // Mode: READ_WRITE — Standard exclusive lock behavior.
      const config = this.readOnly 
        ? { access_mode: 'READ_ONLY', max_memory: '4GB', threads: '2' } 
        : { access_mode: 'READ_WRITE', max_memory: '16GB', threads: '8' };

      return await new Promise((resolve, reject) => {
        const attempt = (count: number) => {
          const db = new duckdb.Database(this.dbPath, config, async (err) => {
            if (err) {
              const isLocked = err.message.includes("lock") || err.message.includes("permission") || err.message.includes("Busy");
              
              if (isLocked && count < retries) {
                const jitter = Math.random() * 300;
                const backoff = (400 * Math.pow(1.5, count)) + jitter;
                logger.warn(`🛡️ [Persistence] Vault Busy (${count+1}/${retries}). Retrying in ${Math.round(backoff)}ms...`);
                setTimeout(() => attempt(count + 1), backoff);
              } else {
                if (this.readOnly) {
                  logger.error("🛡️ [Persistence] Vault remains locked for Read-Only access. Check for active exclusive pulses.", err);
                } else {
                  logger.error("🛡️ [Persistence] Fatal: Could not acquire write lock. Another process is holding the Vault.", err);
                }
                resolve(null);
              }
            } else {
              this.db = db;
              try {
                // [Vault Tuning] Synapse Hardening v2.3.0 🏺
                await this.initSchema();
                resolve(db);
              } catch (e) {
                reject(e);
              }
            }
          });
        };
        attempt(0);
      });
    } catch (err) {
      logger.error("Vault Connection Fatal Error.", err);
      return null;
    }
  }

  /**
   * Conducks Guard: Ensures the structural vault is open and healthy.
   * Prevents catastrophic native DuckDB crashes (NULL pointer dereference).
   */
  private async ensureVaultOpen(): Promise<duckdb.Database> {
    const db = await this.connect();
    if (!db) {
        throw new Error("❌ Structural Synapse is LOCKED. (DuckDB File Lock or Permission Error). Please check for other running Conducks processes.");
    }
    return db;
  }

  private async initSchema(): Promise<void> {
    const db = this.db;
    if (!db || this.readOnly) return;
    const run = (sql: string) => new Promise((res, rej) => db.run(sql, (err) => err ? rej(err) : res(true)));
    
    // 🛡️ [Vault Tuning] Synapse Hardening v2.0 (Conducks Streaming) 🏺
    await run("PRAGMA memory_limit='12GB';");
    await run("PRAGMA threads=2;");
    await run("PRAGMA checkpoint_threshold='1GB';");
    await run("SET preserve_insertion_order=false;");
    await run("INSTALL json;");
    await run("LOAD json;");
    
    await run(`CREATE TABLE IF NOT EXISTS pulses (id TEXT PRIMARY KEY, timestamp BIGINT, commitHash TEXT, nodeCount INTEGER, edgeCount INTEGER, metadata JSON);`);
    await run(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);`);
    await run(`CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, pulseId VARCHAR, fingerprint VARCHAR, canonicalKind VARCHAR, canonicalRank INTEGER, semantic_kind VARCHAR, name TEXT, file VARCHAR, lineStart INTEGER, lineEnd INTEGER, parentId TEXT, rootId TEXT, namespaceId TEXT, unitId TEXT, structureId TEXT, layer_path VARCHAR, depth INTEGER, risk REAL, gravity REAL, complexity INTEGER, isEntryPoint BOOLEAN, visibility VARCHAR, dna JSON, signature JSON, kinetic JSON, metadata JSON);`);
    await run(`CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, pulseId VARCHAR, sourceId TEXT, targetId TEXT, category VARCHAR, type TEXT, weight REAL, confidence REAL, lineNumber INTEGER, properties JSON);`);
    await run(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, pulseId VARCHAR, filePath VARCHAR, kind VARCHAR, title VARCHAR, sections JSON, symbols_referenced TEXT[], last_modified BIGINT);`);
    
    // Conducks Schema Guard (Auto-Migration) 🏺
    const ensureColumn = async (table: string, column: string, type: string) => {
      const cols = await this.query(`PRAGMA table_info(${table})`);
      if (!cols.find((c: any) => c.name === column)) {
        logger.info(`🛡️ [Persistence] Conducks Migration: Adding ${column} to ${table}...`);
        await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
      }
    };

    const ensurePrimaryKey = async (table: string, columns: string[], createSql: string) => {
      const info = await this.query(`PRAGMA table_info(${table})`);
      const currentPk = info.filter((c: any) => c.pk > 0).map((c: any) => c.name).sort();
      const targetPk = [...columns].sort();
      
      if (currentPk.join(',') !== targetPk.join(',')) {
        logger.warn(`🛡️ [Persistence] Conducks Table Resurrection: ${table} is missing Primary Key ${columns.join(',')}. Rebuilding...`);
        
        // 1. Drop Indexes (prevents Dependency Error) 🏺
        const indexList = await this.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}'`);
        for (const idx of indexList) {
          await run(`DROP INDEX IF EXISTS ${idx.name};`);
        }

        // 2. Rename and Rebuild
        await run(`ALTER TABLE ${table} RENAME TO ${table}_stale_legacy;`);
        await run(createSql);
        
        // 3. Conducks Batched Migration (Memory Optimized) 🏺
        try {
          const commonCols = info.map((c: any) => c.name).join(', ');
          const totalRowsResult = await this.query(`SELECT COUNT(*) as count FROM ${table}_stale_legacy`);
          const totalRows = (totalRowsResult[0] as any).count;
          const batchSize = 1000;

          logger.info(`🛡️ [Persistence] Streaming Data Migration for ${table} (${totalRows} units)...`);
          
          for (let offset = 0; offset < totalRows; offset += batchSize) {
            await run(`INSERT OR IGNORE INTO ${table} (${commonCols}) SELECT ${commonCols} FROM ${table}_stale_legacy LIMIT ${batchSize} OFFSET ${offset};`);
            if (offset % 5000 === 0 && offset > 0) {
              logger.info(`🛡️ [Persistence] Migration Pulse: ${offset}/${totalRows} rows reflected.`);
            }
          }
          
          await run(`DROP TABLE ${table}_stale_legacy;`);
          logger.info(`🛡️ [Persistence] Table Resurrection Complete: ${table}.`);
        } catch (e) {
          logger.error(`🛡️ [Persistence] Table Resurrection Migration Failed for ${table}. Using fresh table.`, e);
        }
      }
    };

    // 1. Total Structural Resurrection 🏺
    const nodesSql = `CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, pulseId VARCHAR, fingerprint VARCHAR, canonicalKind VARCHAR, canonicalRank INTEGER, semantic_kind VARCHAR, name TEXT, file VARCHAR, lineStart INTEGER, lineEnd INTEGER, parentId TEXT, rootId TEXT, namespaceId TEXT, unitId TEXT, structureId TEXT, layer_path VARCHAR, depth INTEGER, risk REAL, gravity REAL, complexity INTEGER, isEntryPoint BOOLEAN, visibility VARCHAR, dna JSON, signature JSON, kinetic JSON, metadata JSON);`;
    const edgesSql = `CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, pulseId VARCHAR, sourceId TEXT, targetId TEXT, category VARCHAR, type TEXT, weight REAL, confidence REAL, lineNumber INTEGER, properties JSON);`;
    const pulsesSql = `CREATE TABLE IF NOT EXISTS pulses (id TEXT PRIMARY KEY, timestamp BIGINT, commitHash TEXT, nodeCount INTEGER, edgeCount INTEGER, metadata JSON);`;
    const metaSql = `CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);`;

    await run(nodesSql);
    await run(edgesSql);
    await run(pulsesSql);
    await run(metaSql);

    await ensurePrimaryKey('nodes', ['id'], nodesSql);
    await ensurePrimaryKey('edges', ['id'], edgesSql);
    await ensurePrimaryKey('pulses', ['id'], pulsesSql);
    await ensurePrimaryKey('metadata', ['key'], metaSql);

    // 2. Column-Level Hardening (for incremental updates)
    const nodesCols = [
      ['fingerprint', 'VARCHAR'], ['canonicalKind', 'VARCHAR'], ['canonicalRank', 'INTEGER'],
      ['semantic_kind', 'VARCHAR'], ['name', 'TEXT'], ['file', 'VARCHAR'],
      ['lineStart', 'INTEGER'], ['lineEnd', 'INTEGER'], ['parentId', 'TEXT'],
      ['rootId', 'TEXT'], ['namespaceId', 'TEXT'], ['unitId', 'TEXT'],
      ['structureId', 'TEXT'], ['layer_path', 'VARCHAR'], ['depth', 'INTEGER'],
      ['risk', 'REAL'], ['gravity', 'REAL'], ['complexity', 'INTEGER'],
      ['isEntryPoint', 'BOOLEAN'], ['visibility', 'VARCHAR'], ['dna', 'JSON'],
      ['signature', 'JSON'], ['kinetic', 'JSON'], ['metadata', 'JSON']
    ];

    for (const [col, type] of nodesCols) {
      await ensureColumn('nodes', col as string, type as string);
    }

    const edgesCols = [
      ['category', 'VARCHAR'], ['weight', 'REAL'], ['confidence', 'REAL'],
      ['lineNumber', 'INTEGER'], ['properties', 'JSON']
    ];

    for (const [col, type] of edgesCols) {
      await ensureColumn('edges', col as string, type as string);
    }

    const pulsesCols = [
      ['timestamp', 'BIGINT'], ['commitHash', 'TEXT'], ['nodeCount', 'INTEGER'],
      ['edgeCount', 'INTEGER'], ['metadata', 'JSON']
    ];

    for (const [col, type] of pulsesCols) {
      await ensureColumn('pulses', col as string, type as string);
    }

    // 3. Structural Performance Indexing (Oracle Standard) 🏺
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_id ON nodes(id);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_pulse ON nodes(pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_parentId ON nodes(parentId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_unitId ON nodes(unitId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_structureId ON nodes(structureId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_namespaceId ON nodes(namespaceId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_layer ON nodes(layer_path, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_rank ON nodes(canonicalRank, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(canonicalKind, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_semantic ON nodes(semantic_kind, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_risk ON nodes(risk DESC, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_gravity ON nodes(gravity DESC, pulseId);`);
    
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(sourceId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(targetId, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type, pulseId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_category ON edges(category, pulseId);`);
    
    await run(`CREATE INDEX IF NOT EXISTS idx_docs_filepath ON documents(filePath, pulseId);`);
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    const db = await this.ensureVaultOpen();
    return await new Promise((res, rej) => {
      db.run(sql, ...params, (err) => err ? rej(err) : res());
    });
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.ensureVaultOpen();
    try {
      const rows = await new Promise<T[]>((res, rej) => {
        db.all(sql, ...params, (err, rows) => err ? rej(err) : res(rows as T[]));
      });
      return rows;
    } finally {
      // 🛡️ [Conducks Lazy Persistence] Explicit lock release for non-writers.
      if (this.lazy && this.readOnly) {
        await this.close();
      }
    }
  }

  public async save(graph: ConducksAdjacencyList, options: { append?: boolean, nodeCount?: number, edgeCount?: number } = {}): Promise<string> {
    const db = await this.ensureVaultOpen();
    const rawNodes = Array.from(graph.getAllNodes());
    const allEdges = this.serializeEdges(graph);
    const pulseId = (graph as any).getMetadata('targetPulseId') || `pulse_${Date.now()}`;
    const nodeMap = new Map<string, ConducksNode>();
    for (const n of rawNodes) nodeMap.set(n.id.toLowerCase(), n);
    const nodes = Array.from(nodeMap.values());

    try {
      await this.run("BEGIN TRANSACTION");
      await this.run("DELETE FROM metadata");
      const metaStmt = db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)");
      for (const [k, v] of graph.getAllMetadata().entries()) {
        await new Promise<void>((r, j) => metaStmt.run(k, String(v), (e) => e ? j(e) : r()));
      }
      metaStmt.finalize();

      if (!options.append) {
        // [Unit-Centric Realignment] By default, we no longer delete all nodes for a pulse.
        // We rely on INSERT OR REPLACE at the node/unit level.
        // However, if append is false (Legacy Full Sync), we still clear metadata.
        await this.run("DELETE FROM metadata");
      }

      const finalNodeCount = options.nodeCount ?? nodes.length;
      const finalEdgeCount = options.edgeCount ?? allEdges.length;

      await this.run("INSERT OR REPLACE INTO pulses (id, timestamp, nodeCount, edgeCount, metadata) VALUES (?, ?, ?, ?, ?)", [
        pulseId, Date.now(), finalNodeCount, finalEdgeCount, JSON.stringify({ project: chronicle.getProjectDir() })
      ]);
      await this.run("COMMIT");

      // Conducks Streaming: Delegated Reflection 🏺
      await this.saveNodes(nodes, pulseId);
      await this.saveEdges(allEdges, pulseId);

      return pulseId;
    } catch (fail) {
      logger.error("Vault Steam Error. Attempting Conducks Rollback...", fail);
      try { await this.run("ROLLBACK"); } catch { /* Ignore rollback failure if no tx was open */ }
      throw fail;
    }
  }

  /**
   * Conducks Streaming: High-performance Batched Node Reflection 🏺
   */
  public async saveNodes(nodes: ConducksNode[], pulseId: string): Promise<void> {
    const db = await this.ensureVaultOpen();
    const batchSize = 2500;
    
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      await this.run("BEGIN TRANSACTION");
      
      const ns = db.prepare(`INSERT OR REPLACE INTO nodes (id, pulseId, fingerprint, canonicalKind, canonicalRank, semantic_kind, name, file, lineStart, lineEnd, parentId, rootId, namespaceId, unitId, structureId, layer_path, depth, risk, gravity, complexity, isEntryPoint, visibility, dna, signature, kinetic, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      for (const node of batch) {
        const p = node.properties;
        const nid = node.id.toLowerCase();
        let parentId = p.parentId ? p.parentId.toLowerCase() : null;
        let layerPath = p.layer_path;
        const pid = pulseId.toLowerCase();
        const nodeId = nid.toLowerCase();
        const parent = parentId ? parentId.toLowerCase() : null;
        const unit = p.unitId ? p.unitId.toLowerCase() : (p.filePath ? `${p.filePath.toLowerCase()}::unit` : null);
        const root = p.rootId ? p.rootId.toLowerCase() : null;

        const params = [
          nodeId, pid, p.fingerprint || null, p.canonicalKind || node.label, p.canonicalRank || 0,
          p.semantic_kind || 'unknown', p.name || 'unknown', p.filePath ? p.filePath.toLowerCase() : null,
          p.lineStart || 0, p.lineEnd || 0, parent, root, p.namespaceId ? p.namespaceId.toLowerCase() : null,
          unit, p.structureId ? p.structureId.toLowerCase() : (parent), layerPath || null,
          p.depth || 0, p.risk || 0, p.gravity || 0, p.complexity || 1, p.isEntryPoint || false,
          p.visibility || 'public', JSON.stringify(p.dna || {}), JSON.stringify(p.signature || {}),
          JSON.stringify(p.kinetic || {}), JSON.stringify({ ...p, id: nodeId, parentId: parent, unitId: unit, rootId: root, layer_path: layerPath })
        ];
        
        await new Promise<void>((r, j) => ns.run(...params, (e) => e ? j(e) : r()));
      }
      
      ns.finalize();
      await this.run("COMMIT");
      if (i > 0) logger.info(`🛡️ [Persistence] Structural Bloom: ${i}/${nodes.length} nodes reflected.`);
    }
  }

  /**
   * Conducks Streaming: High-performance Batched Edge Reflection 🏺
   */
  public async saveEdges(edges: ConducksEdge[], pulseId: string): Promise<void> {
    const db = await this.ensureVaultOpen();
    const batchSize = 5000;
    
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);
      await this.run("BEGIN TRANSACTION");
      
      const es = db.prepare(`INSERT OR REPLACE INTO edges (id, pulseId, sourceId, targetId, category, type, weight, confidence, lineNumber, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      for (const e of batch) {
        await new Promise<void>((r, j) => es.run(
          e.id.toLowerCase(), pulseId.toLowerCase(), 
          e.sourceId.toLowerCase(), e.targetId.toLowerCase(), 
          e.properties?.category || 'STRUCTURAL', e.type, 
          e.properties?.weight || 1.0, e.confidence || 1.0, 
          e.properties?.lineNumber || 0, JSON.stringify(e.properties || {}), 
          (err) => err ? j(err) : r()
        ));
      }
      
      es.finalize();
      await this.run("COMMIT");
    }
  }

  public async saveSpectrum(filePath: string, spectrum: any): Promise<void> {
    return this.saveBatchSpectrum([{ filePath, spectrum }]);
  }

  public async saveBatchSpectrum(entries: Array<{ filePath: string, spectrum: any }>, pulseIdOverride?: string): Promise<void> {
    const db = await this.ensureVaultOpen();
    const pid = pulseIdOverride || `stream_${Date.now()}`;
    return new Promise(async (resolve, reject) => {
      try {
        const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e) => e ? j(e) : r()));
        const pid = pulseIdOverride || `stream_${Date.now()}`;
        const batchSize = 1000;

        for (let i = 0; i < entries.length; i += batchSize) {
          const chunk = entries.slice(i, i + batchSize);
          await exec("BEGIN TRANSACTION");
          const ns = db.prepare(`INSERT OR REPLACE INTO nodes (id, pulseId, fingerprint, canonicalKind, canonicalRank, semantic_kind, name, file, lineStart, lineEnd, parentId, rootId, namespaceId, unitId, structureId, layer_path, depth, risk, gravity, complexity, isEntryPoint, visibility, dna, signature, kinetic, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          const es = db.prepare(`INSERT OR REPLACE INTO edges (id, pulseId, sourceId, targetId, category, type, weight, confidence, lineNumber, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

          for (const entry of chunk) {
            const rawFilePath = entry.filePath.toLowerCase();
            for (const n of entry.spectrum.nodes) {
              const m = n.metadata || {};
              const id = m.id ? m.id.toLowerCase() : `${rawFilePath}::${n.name.toLowerCase()}`;
              const parentId = m.parentId ? m.parentId.toLowerCase() : `${rawFilePath}::unit`;
              const unitId = m.unitId ? m.unitId.toLowerCase() : `${rawFilePath}::unit`;
              const rootId = m.rootId ? m.rootId.toLowerCase() : null;
              await new Promise<void>((r, j) => ns.run(id, pid, m.fingerprint || null, m.canonicalKind || n.canonicalKind, n.canonicalRank || 0, n.kind || 'unknown', n.name || 'unknown', rawFilePath, n.range?.start.line || 0, n.range?.end.line || 0, parentId, rootId, m.namespaceId ? m.namespaceId.toLowerCase() : null, unitId, m.structureId ? m.structureId.toLowerCase() : null, m.layer_path || null, m.depth || 0, n.risk || 0, n.gravity || 0, n.complexity || 1, m.isEntryPoint || false, m.visibility || 'public', JSON.stringify(n.dna || {}), JSON.stringify(n.signature || {}), JSON.stringify(n.kinetic || {}), JSON.stringify({ ...m, id, name: n.name, range: n.range, parentId, unitId, rootId }), (e) => e ? j(e) : r()));
              // [Conducks Rule] MEMBER_OF edges are no longer persisted. 🏺
              // Containment is now explicitly column-based (parentId, unitId, etc.)
            }
          }
          ns.finalize();
          es.finalize();
          await exec("COMMIT");
        }
        resolve();
      } catch (fail) {
        logger.error("Spectrum Stream Error.", fail);
        reject(fail);
      }
    });
  }

  public async load(graph: ConducksAdjacencyList, append: boolean = false): Promise<boolean> {
    const db = await this.connect();
    if (!db) return false;
    try {
      // 🛡️ [Conducks State-Sync] We now load the entire structural constellation.
      // Since 'id' is the PK, we always get the latest version of every symbol.
      const nodes: any[] = await this.query("SELECT * FROM nodes");
      const edges: any[] = await this.query("SELECT * FROM edges");
      if (nodes.length === 0) return false;

      if (!append) (graph as any).clear();
      
      nodes.forEach(n => {
        const props = { ...JSON.parse(n.metadata || '{}'), ...n, dna: JSON.parse(n.dna || '{}'), signature: JSON.parse(n.signature || '{}'), kinetic: JSON.parse(n.kinetic || '{}') };
        graph.addNode({ id: n.id, label: n.canonicalKind, properties: props });
      });
      edges.forEach(e => graph.addEdge({ id: e.id, sourceId: e.sourceId, targetId: e.targetId, type: e.type, confidence: e.confidence, properties: JSON.parse(e.properties || '{}') }));
      
      return true;
    } catch (err) { 
      logger.error("Vault Load Error", err);
      return false; 
    } finally {
       // 🛡️ [Conducks Lazy Persistence] Explicit lock release for non-writers.
       if (this.lazy && this.readOnly) {
        await this.close();
      }
    }
  }

  public async fetchNodeMeat(id: string): Promise<any> {
    const db = await this.connect(); if (!db) return null;
    try {
      const row: any = await this.query("SELECT metadata FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1", [id.toLowerCase()]);
      const result = row && row[0] ? JSON.parse(row[0].metadata) : null;
      return result;
    } catch (err) {
      return null;
    }
  }

  public async clean(pulseIdToKeep?: string): Promise<void> {
    const db = await this.connect();
    if (!db) return;
    return new Promise<void>((resolve) => {
      db.exec("BEGIN TRANSACTION", async () => {
        const run = (sql: string, params: any[] = []) => new Promise<void>((r, j) => db.run(sql, params, (e) => e ? j(e) : r()));
        try {
          if (pulseIdToKeep) {
            await run("DELETE FROM nodes WHERE pulseId != ?", [pulseIdToKeep]);
            await run("DELETE FROM edges WHERE pulseId != ?", [pulseIdToKeep]);
            await run("DELETE FROM pulses WHERE id != ?", [pulseIdToKeep]);
          } else {
            await run("DELETE FROM nodes");
            await run("DELETE FROM edges");
            await run("DELETE FROM pulses");
            await run("DELETE FROM metadata");
          }
          db.exec("COMMIT", () => resolve());
        } catch (fail) {
          db.exec("ROLLBACK", () => resolve());
        }
      });
    });
  }

  public async clear(): Promise<void> { return this.clean(); }
  public async getRawConnection(): Promise<duckdb.Database | null> { return this.connect(); }
  public async close(): Promise<void> { if (this.db) { await new Promise(r => this.db!.close(r)); this.db = null; } }
  public isConnected(): boolean { return !!this.db; }

  /**
   * Conducks Purge: Explicitly removes structural DNA for specific units.
   * Use this before re-inducting a modified file to ensure no dangling symbols.
   */
  public async purgeUnits(unitIds: string[]): Promise<void> {
    if (unitIds.length === 0) return;
    const db = await this.ensureVaultOpen();
    const batchSize = 1000;
    
    for (let i = 0; i < unitIds.length; i += batchSize) {
      const batch = unitIds.slice(i, i + batchSize).map(id => id.toLowerCase());
      const placeholders = batch.map(() => '?').join(',');
      
      // Conducks Rule: Delete edges first, then nodes.
      // This ensures that the JOIN/SELECT for edges still finds the node IDs while they exist.
      await this.run(`
        DELETE FROM edges 
        WHERE sourceId IN (SELECT id FROM nodes WHERE unitId IN (${placeholders}))
           OR targetId IN (SELECT id FROM nodes WHERE unitId IN (${placeholders}))
      `, [...batch, ...batch]);

      await this.run(`DELETE FROM nodes WHERE unitId IN (${placeholders})`, batch);
    }
  }

  private serializeEdges(graph: ConducksAdjacencyList): ConducksEdge[] {
    return graph.getAllEdges();
  }
}

export class DuckDbPersistence extends SynapsePersistence {}
export class GraphPersistence extends SynapsePersistence {}
import fs from "node:fs";
import path from "node:path";
import { chronicle } from "../git/chronicle-interface.js";
import { logger } from "../../core/utils/logger.js";
import { SynapseRegistry } from "../../../registry/synapse-registry.js";
import duckdb from "duckdb";
import type { ConducksComponent } from "../../../registry/types.js";

/**
 * Conducks — Synapse Persistence Engine (DuckDB v2) 🏺 🟦
 *
 * Manages the high-fidelity persistence of structural DNA and kinetic blast radius.
 * Implements the Oracle Standard for structural health monitoring.
 */

export class SynapsePersistence {
  private static instance: SynapsePersistence;
  private db: duckdb.Database | null = null;
  private registry = new SynapseRegistry<ConducksComponent>();
  private lazy: boolean = true;
  private readOnly: boolean = false;

  constructor(private vaultPath: string, readOnly = false) {
    this.readOnly = readOnly;
  }

  public static getInstance(vaultPath: string): SynapsePersistence {
    if (!SynapsePersistence.instance) {
      SynapsePersistence.instance = new SynapsePersistence(vaultPath);
    } else if (SynapsePersistence.instance.vaultPath !== path.resolve(vaultPath)) {
      // Different path requested — log and return existing instance
      // (callers should use constructor directly if they need different vaults)
      console.error(`[SynapsePersistence] WARNING: getInstance called with different vaultPath. Expected: ${SynapsePersistence.instance.vaultPath}, got: ${vaultPath}. Returning existing instance.`);
    }
    return SynapsePersistence.instance;
  }

  public setReadOnly(val: boolean) {
    this.readOnly = val;
  }

  public isConnected(): boolean {
    return this.db !== null;
  }

  private async ensureVaultOpen(): Promise<duckdb.Database> {
    if (this.db) return this.db;
    
    const vaultDir = path.resolve(this.vaultPath, '.conducks');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const dbPath = path.join(vaultDir, 'conducks-synapse.db');
    
    const maxAttempts = 3;
    const retryDelay = 500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const db = new duckdb.Database(dbPath, { access_mode: this.readOnly ? 'READ_ONLY' : 'READ_WRITE' }, (err) => {
            if (err) {
              logger.error(`🛡️ [Vault Error] Could not anchor synapse at ${dbPath}. Vault may be locked or busy.`, err);
              return reject(err);
            }
            this.db = db;
            this.initializeSchema().then(() => resolve(db)).catch(reject);
          });
        });
        return this.db!;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
    throw new Error('🛡️ [Vault Error] Failed to open database after all attempts');
  }

  private async initializeSchema(): Promise<void> {
    if (this.readOnly) return; // 🛡️ [Conducks Gating] Skip schema initialization in read-only mode.
    const run = (sql: string) => new Promise<void>((r, j) => this.db!.run(sql, (e: duckdb.DuckDbError | null) => e ? j(e) : r()));

    const nodesSql = `CREATE TABLE IF NOT EXISTS nodes (
      id VARCHAR PRIMARY KEY,
      pulseId VARCHAR,
      fingerprint VARCHAR,
      canonicalKind VARCHAR,
      canonicalRank INTEGER,
      semantic_kind VARCHAR,
      name TEXT,
      file VARCHAR,
      lineStart INTEGER,
      lineEnd INTEGER,
      parentId TEXT,
      rootId TEXT,
      namespaceId TEXT,
      unitId TEXT,
      structureId TEXT,
      layer_path VARCHAR,
      depth INTEGER,
      risk REAL,
      gravity REAL DEFAULT 0.0,
      complexity INTEGER,
      isEntryPoint BOOLEAN,
      visibility VARCHAR,
      dna JSON,
      signature JSON,
      kinetic JSON,
      metadata JSON
    );`;

    const edgesSql = `CREATE TABLE IF NOT EXISTS edges (
      id VARCHAR PRIMARY KEY,
      pulseId VARCHAR,
      sourceId VARCHAR,
      targetId VARCHAR,
      category VARCHAR,
      type VARCHAR,
      weight REAL,
      confidence REAL,
      lineNumber INTEGER,
      properties JSON
    );`;

    const pulsesSql = `CREATE TABLE IF NOT EXISTS pulses (
      id VARCHAR PRIMARY KEY,
      timestamp BIGINT,
      commitHash TEXT,
      nodeCount INTEGER,
      edgeCount INTEGER,
      metadata JSON
    );`;

    const metaSql = `CREATE TABLE IF NOT EXISTS metadata (
      key VARCHAR PRIMARY KEY,
      value TEXT
    );`;

    await run(nodesSql);
    await run(edgesSql);
    await run(pulsesSql);
    await run(metaSql);

    // Kinetic columns — safe to run on existing databases (DuckDB IF NOT EXISTS)
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS blame_age_days INTEGER;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS churn_count_90d INTEGER;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS entropy_score DOUBLE;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_author TEXT;`);

    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_id ON nodes(id);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(sourceId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(targetId);`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async load(graph: any): Promise<void> {
    const db = await this.ensureVaultOpen();
    const nodes = await this.query("SELECT * FROM nodes");
    const edges = await this.query("SELECT * FROM edges");

    for (const row of nodes) {
      graph.addNode({
        id: row.id,
        label: row.canonicalKind,
        name: row.name,
        properties: {
          ...JSON.parse(row.metadata),
          name: row.name,
          filePath: row.file,
          kind: row.semantic_kind,
          canonicalKind: row.canonicalKind,
          canonicalRank: row.canonicalRank,
          gravity: row.gravity,
          complexity: row.complexity,
          risk: row.risk,
          unitId: row.unitId,
          parentId: row.parentId,
          namespaceId: row.namespaceId,
          layer_path: row.layer_path,
          depth: row.depth,
          kinetic: JSON.parse(row.kinetic || '{}'),
          dna: JSON.parse(row.dna || '{}'),
          signature: JSON.parse(row.signature || '{}')
        }
      });
    }

    for (const row of edges) {
      graph.addEdge({
        id: row.id,
        sourceId: row.sourceId,
        targetId: row.targetId,
        type: row.type,
        weight: row.weight,
        confidence: row.confidence,
        metadata: JSON.parse(row.properties || '{}')
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async saveNodes(nodes: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    try {
      await this.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`INSERT OR REPLACE INTO nodes (id, pulseId, fingerprint, canonicalKind, canonicalRank, semantic_kind, name, file, lineStart, lineEnd, parentId, rootId, namespaceId, unitId, structureId, layer_path, depth, risk, gravity, complexity, isEntryPoint, visibility, dna, signature, kinetic, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const n of nodes) {
        const m = n.properties || {};
        const name = m.name || n.name || 'unknown';
        const filePath = m.filePath || n.filePath || '';

        // 🛡️ [Synapse Taxonomy] Priority mapping for semantic kind
        const semanticKind = (m.kind || n.kind || n.label || 'unknown').toLowerCase();
        const canonicalKind = m.canonicalKind || n.label || 'STRUCTURE';
        const canonicalRank = m.canonicalRank || n.canonicalRank || 0;

        await new Promise<void>((r, j) => stmt.run(
          n.id.toLowerCase(), pulseId, m.fingerprint || null, canonicalKind, canonicalRank, semanticKind, name, filePath.toLowerCase(), m.range?.start.line || 0, m.range?.end.line || 0,
          m.parentId?.toLowerCase() || null, m.rootId?.toLowerCase() || null, m.namespaceId?.toLowerCase() || null, m.unitId?.toLowerCase() || null, m.structureId?.toLowerCase() || null,
          m.layer_path || null, m.depth || 0, m.risk || 0, n.gravity || m.gravity || 0, n.complexity || m.complexity || 1,
          m.isEntryPoint || false, m.visibility || 'public', JSON.stringify(m.dna || {}), JSON.stringify(m.signature || {}), JSON.stringify(m.kinetic || {}),
          JSON.stringify({ ...m, id: n.id, name, range: m.range }),
          (e: Error | null) => e ? j(e) : r()
        ));
      }
      stmt.finalize();
      await this.run("COMMIT");
    } catch (err) {
      try { await this.run('ROLLBACK'); } catch {}
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async saveEdges(edges: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    try {
      await this.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`INSERT OR REPLACE INTO edges (id, pulseId, sourceId, targetId, category, type, weight, confidence, lineNumber, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const e of edges) {
        await new Promise<void>((r, j) => stmt.run(
          e.id, pulseId, e.sourceId?.toLowerCase(), e.targetId?.toLowerCase(), e.type === 'IMPORTS' ? 'dependency' : 'structural', e.type, e.weight || 1.0, e.confidence || 1.0, e.metadata?.line || 0, JSON.stringify(e.metadata || {}),
          (err: Error | null) => err ? j(err) : r()
        ));
      }
      stmt.finalize();
      await this.run("COMMIT");
    } catch (err) {
      try { await this.run('ROLLBACK'); } catch {}
      throw err;
    }
  }

  public async purgeUnits(unitIds: string[]): Promise<void> {
    if (this.readOnly) return;
    if (!unitIds.length) return;
    await this.ensureVaultOpen();

    const lowered = unitIds.map(id => id.toLowerCase());
    const placeholders = lowered.map(() => '?').join(',');

    try {
      await this.run(`BEGIN TRANSACTION`);
      await this.run(`DELETE FROM edges WHERE sourceId IN (SELECT id FROM nodes WHERE unitId IN (${placeholders}))`, lowered);
      await this.run(`DELETE FROM nodes WHERE unitId IN (${placeholders})`, lowered);
      await this.run(`COMMIT`);
    } catch (err) {
      try { await this.run('ROLLBACK'); } catch {}
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async save(graph: any, options: { metadataOnly?: boolean, nodeCount?: number, edgeCount?: number } = {}): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    const pulseId = graph.getMetadata('targetPulseId') || `pulse_${Date.now()}`;
    const headHash = chronicle.getHeadHash() || 'unknown';

    await this.run(`BEGIN TRANSACTION`);
    const metadata = graph.getAllMetadata();
    for (const [key, value] of metadata.entries()) {
      await this.run(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`, [key, String(value)]);
    }
    await this.run(`INSERT OR REPLACE INTO pulses (id, timestamp, commitHash, nodeCount, edgeCount, metadata) VALUES (?, ?, ?, ?, ?, ?)`, [
      pulseId, Date.now(), headHash, options.nodeCount || graph.nodeCount(), options.edgeCount || graph.edgeCount(), JSON.stringify(Object.fromEntries(metadata))
    ]);
    await this.run(`COMMIT`);
  }

  public async run(sql: string, params: unknown[] = []): Promise<void> {
    if (this.readOnly) {
      throw new Error(`🛡️ [Persistence] WRITE BLOCKED: Attempted to execute mutational SQL on a Read-Only vault connection.`);
    }
    const db = await this.ensureVaultOpen();
    return await new Promise((res, rej) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.run(sql, ...(params as any[]), (err: duckdb.DuckDbError | null) => err ? rej(err) : res());
    });
  }

  public async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.ensureVaultOpen();
    return new Promise((res, rej) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.all(sql, ...(params as any[]), (err: duckdb.DuckDbError | null, rows: duckdb.TableData) => err ? rej(err) : res(rows as unknown as T[]));
    });
  }

  public async updateRanks(nodeRanks: Array<{ id: string, gravity: number, isEntryPoint?: boolean }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    try {
      const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e: duckdb.DuckDbError | null) => e ? j(e) : r()));
      await exec("BEGIN TRANSACTION");
      const stmt = db.prepare(`UPDATE nodes SET gravity = ?, isEntryPoint = ? WHERE id = ?`);
      for (const entry of nodeRanks) {
        await new Promise<void>((r, j) => stmt.run(entry.gravity, entry.isEntryPoint ?? false, entry.id.toLowerCase(), (e: Error | null) => e ? j(e) : r()));
      }
      stmt.finalize();
      await exec("COMMIT");
    } catch (fail) {
      try { await this.run('ROLLBACK'); } catch {}
      throw fail;
    }
  }

  public async updateRisks(): Promise<void> {
    if (this.readOnly) return;
    await this.run(`UPDATE nodes SET risk = LEAST(COALESCE(complexity, 1) / 50.0, 1.0) WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE', 'ATOM')`);
  }

  public async updateEdgeTargets(rebinds: Array<{ id: string, newTargetId: string }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    try {
      const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e: duckdb.DuckDbError | null) => e ? j(e) : r()));
      await exec("BEGIN TRANSACTION");
      const stmt = db.prepare(`UPDATE edges SET targetId = ? WHERE id = ?`);
      for (const entry of rebinds) {
        await new Promise<void>((r, j) => stmt.run(entry.newTargetId.toLowerCase(), entry.id, (e: Error | null) => e ? j(e) : r()));
      }
      stmt.finalize();
      await exec("COMMIT");
    } catch (fail) {
      try { await this.run('ROLLBACK'); } catch {}
      throw fail;
    }
  }

  public async clear(): Promise<void> {
    if (this.readOnly) return;
    await this.run('DELETE FROM nodes');
    await this.run('DELETE FROM edges');
    await this.run('DELETE FROM pulses');
  }

  public async fetchNodeDeep(nodeId: string): Promise<any | null> {
    const rows = await this.query('SELECT * FROM nodes WHERE id = ?', [nodeId.toLowerCase()]);
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      label: row.canonicalKind,
      properties: {
        ...JSON.parse(row.metadata || '{}'),
        kind: row.semantic_kind,
        canonicalKind: row.canonicalKind,
        canonicalRank: row.canonicalRank,
        gravity: row.gravity,
        complexity: row.complexity,
        parentId: row.parentId,
        unitId: row.unitId,
      }
    };
  }

  public async getRawConnection(): Promise<duckdb.Database> {
    return await this.ensureVaultOpen();
  }

  public async updateKineticColumns(nodeId: string, data: {
    blame_age_days?: number;
    churn_count_90d?: number;
    entropy_score?: number;
    last_author?: string;
  }): Promise<void> {
    if (this.readOnly) return;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (data.blame_age_days !== undefined) { setClauses.push('blame_age_days = ?'); params.push(data.blame_age_days); }
    if (data.churn_count_90d !== undefined) { setClauses.push('churn_count_90d = ?'); params.push(data.churn_count_90d); }
    if (data.entropy_score !== undefined) { setClauses.push('entropy_score = ?'); params.push(data.entropy_score); }
    if (data.last_author !== undefined) { setClauses.push('last_author = ?'); params.push(data.last_author); }
    if (setClauses.length === 0) return;
    params.push(nodeId.toLowerCase());
    await this.run(`UPDATE nodes SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }

  public async close(): Promise<void> {
    if (this.db) {
      const closePromise = new Promise<void>((resolve, reject) => {
        this.db!.close((err) => {
          if (err) return reject(err);
          this.db = null;
          resolve();
        });
      });
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('DB close timed out after 5s')), 5000)
      );
      return Promise.race([closePromise, timeout]);
    }
  }
}
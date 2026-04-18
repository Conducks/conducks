import fs from "node:fs";
import path from "node:path";
import { chronicle } from "../git/chronicle-interface.js";
import { logger } from "../../core/utils/logger.js";
import { SynapseRegistry } from "../../../registry/synapse-registry.js";
import duckdb from "duckdb";

/**
 * Conducks — Synapse Persistence Engine (DuckDB v2) 🏺 🟦
 * 
 * Manages the high-fidelity persistence of structural DNA and kinetic blast radius.
 * Implements the Oracle Standard for structural health monitoring.
 */

export class SynapsePersistence {
  private static instance: SynapsePersistence;
  private db: any = null;
  private registry = new SynapseRegistry<any>();
  private lazy: boolean = true;
  private readOnly: boolean = false;

  constructor(private vaultPath: string, readOnly = false) {
    this.readOnly = readOnly;
  }

  public static getInstance(vaultPath: string): SynapsePersistence {
    if (!SynapsePersistence.instance) {
      SynapsePersistence.instance = new SynapsePersistence(vaultPath);
    }
    return SynapsePersistence.instance;
  }

  public setReadOnly(val: boolean) {
    this.readOnly = val;
  }

  public isConnected(): boolean {
    return this.db !== null;
  }

  private async ensureVaultOpen(): Promise<any> {
    if (this.db) return this.db;
    
    const vaultDir = path.resolve(this.vaultPath, '.conducks');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const dbPath = path.join(vaultDir, 'conducks-synapse.db');
    
    return new Promise((resolve, reject) => {
      // 🛡️ [Conducks Gating] Explicitly set read_only mode for Mirror/Diagnostic access.
      const db = new duckdb.Database(dbPath, { access_mode: this.readOnly ? 'READ_ONLY' : 'READ_WRITE' }, (err) => {
        if (err) {
          logger.error(`🛡️ [Vault Error] Could not anchor synapse at ${dbPath}. Vault may be locked or busy.`, err);
          return reject(err);
        }
        this.db = db;
        this.initializeSchema().then(() => resolve(db)).catch(reject);
      });
    });
  }

  private async initializeSchema(): Promise<void> {
    if (this.readOnly) return; // 🛡️ [Conducks Gating] Skip schema initialization in read-only mode.
    const run = (sql: string) => new Promise<void>((r, j) => this.db.run(sql, (e: any) => e ? j(e) : r()));

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

    await run(`CREATE INDEX IF NOT EXISTS idx_nodes_id ON nodes(id);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(sourceId);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(targetId);`);
  }

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

  public async saveNodes(nodes: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    return new Promise(async (resolve, reject) => {
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
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  public async saveEdges(edges: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    return new Promise(async (resolve, reject) => {
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
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  public async purgeUnits(unitIds: string[]): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    const ids = unitIds.map(id => `'${id.toLowerCase()}'`).join(',');
    if (!ids) return;

    await this.run(`BEGIN TRANSACTION`);
    await this.run(`DELETE FROM nodes WHERE unitId IN (${ids})`);
    await this.run(`DELETE FROM edges WHERE sourceId IN (SELECT id FROM nodes WHERE unitId IN (${ids}))`);
    await this.run(`COMMIT`);
  }

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

  public async run(sql: string, params: any[] = []): Promise<void> {
    if (this.readOnly) {
      throw new Error(`🛡️ [Persistence] WRITE BLOCKED: Attempted to execute mutational SQL on a Read-Only vault connection.`);
    }
    const db = await this.ensureVaultOpen();
    return await new Promise((res, rej) => {
      db.run(sql, ...params, (err: Error | null) => err ? rej(err) : res());
    });
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.ensureVaultOpen();
    return new Promise((res, rej) => {
      db.all(sql, ...params, (err: Error | null, rows: T[]) => err ? rej(err) : res(rows));
    });
  }

  public async updateRanks(nodeRanks: Array<{ id: string, gravity: number }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    return new Promise(async (resolve, reject) => {
      try {
        const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e: any) => e ? j(e) : r()));
        await exec("BEGIN TRANSACTION");
        const stmt = db.prepare(`UPDATE nodes SET gravity = ? WHERE id = ?`);
        for (const entry of nodeRanks) {
          await new Promise<void>((r, j) => stmt.run(entry.gravity, entry.id.toLowerCase(), (e: Error | null) => e ? j(e) : r()));
        }
        stmt.finalize();
        await exec("COMMIT");
        resolve();
      } catch (fail) {
        reject(fail);
      }
    });
  }

  public async updateEdgeTargets(rebinds: Array<{ id: string, newTargetId: string }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    return new Promise(async (resolve, reject) => {
      try {
        const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e: any) => e ? j(e) : r()));
        await exec("BEGIN TRANSACTION");
        const stmt = db.prepare(`UPDATE edges SET targetId = ? WHERE id = ?`);
        for (const entry of rebinds) {
          await new Promise<void>((r, j) => stmt.run(entry.newTargetId, entry.id, (e: Error | null) => e ? j(e) : r()));
        }
        stmt.finalize();
        await exec("COMMIT");
        resolve();
      } catch (fail) {
        reject(fail);
      }
    });
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

  public getRawConnection(): any {
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((res) => {
        this.db.close(() => {
          this.db = null;
          res();
        });
      });
    }
  }
}
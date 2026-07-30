import fs from "node:fs";
import path from "node:path";
import { chronicle } from "../git/chronicle-interface.js";
import { logger } from "../../core/utils/logger.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import duckdb from "duckdb";
import { traceMemory } from "@/lib/core/utils/mem-trace.js";
import type { ConducksComponent } from "../../../contracts/types.js";

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
  // When true, individual write methods run INSIDE one big analyze transaction instead of
  // self-committing. An interrupted analyze then never commits → duckdb rolls the whole pulse
  // back on next open, so the previous good graph survives (no silent partial-graph corruption).
  private inPulse: boolean = false;

  /** Open an atomic analyze pulse: every write until save()/abortPulse() is one transaction. */
  public async beginPulse(): Promise<void> {
    if (this.readOnly || this.inPulse) return;
    await this.ensureVaultOpen();
    await this.run("BEGIN TRANSACTION");
    this.inPulse = true;
  }

  /** Roll the pulse back (on error). A process kill mid-pulse auto-rolls-back on the next open. */
  public async abortPulse(): Promise<void> {
    if (!this.inPulse) return;
    this.inPulse = false;
    try { await this.run("ROLLBACK"); } catch { /* connection may already be gone */ }
  }

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
            if (err) return reject(err);
            this.db = db;
            this.initializeSchema().then(() => resolve(db)).catch(reject);
          });
        });
        return this.db!;
      } catch (err) {
        // Log ONCE, on the last attempt. Logging per attempt printed the same wall of DuckDB text
        // three times and buried the one line that matters.
        if (attempt === maxAttempts) {
          logger.error(this.explainOpenFailure(err, dbPath));
          throw err;
        }
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
    throw new Error('🛡️ [Vault Error] Failed to open database after all attempts');
  }

  /**
   * Turns DuckDB's lock error into the fact the caller needs.
   *
   * MEASURED (todo17 Phase 4): DuckDB's file lock is exclusive for the whole file. N concurrent
   * READ_ONLY openers are fine — six agents queried this vault in parallel in 6-8ms each — but while
   * ANY writer holds it, a read-only open FAILS outright. It does not queue and it does not wait, so
   * "your call is behind a pulse" is the only useful thing to say, and the raw message never says it.
   */
  private explainOpenFailure(err: unknown, dbPath: string): string {
    const raw = String((err as { message?: string })?.message ?? err);
    if (/Could not set lock|Conflicting lock/i.test(raw)) {
      const pid = raw.match(/PID (\d+)/)?.[1];
      return [
        `🛡️ [Vault Locked] Another process is WRITING this vault${pid ? ` (PID ${pid})` : ""}, so it cannot be read right now.`,
        `  That is almost always a running 'conducks analyze' — one writer at a time, by design.`,
        `  Wait for it to finish and retry. Docs-layer tools (docs-status, docs-lint, conducks_docs)`,
        `  take no connection and keep working throughout.`,
        `  Vault: ${dbPath}`,
      ].join("\n");
    }
    return `🛡️ [Vault Error] Could not anchor synapse at ${dbPath}: ${raw}`;
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
      metadata JSON,
      -- Cross-service HTTP binding (todo22#P15). These lived only inside the metadata blob, and
      -- addNode keeps a fixed skeleton that never included them, so after ANY reload the fields
      -- were undefined and bindRouteCircuits matched nothing. Real columns because they are real
      -- data the vault should own, not a JSON side-channel.
      is_route BOOLEAN,
      is_request BOOLEAN,
      http_method VARCHAR,
      http_path VARCHAR,
      http_url VARCHAR
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

    // One row per symbol PER PULSE — the history `nodes` cannot hold, because `nodes.id` is a
    // PRIMARY KEY and therefore stores only the current state. `drift` and `audit --history` were
    // written against `nodes` as if it were this table, which is why both were structurally
    // incapable of returning a result (todo22#P14).
    const historySql = `CREATE TABLE IF NOT EXISTS node_history (
      pulseId VARCHAR,
      nodeId VARCHAR,
      gravity REAL,
      complexity INTEGER,
      fingerprint VARCHAR,
      PRIMARY KEY (pulseId, nodeId)
    );`;

    const metaSql = `CREATE TABLE IF NOT EXISTS metadata (
      key VARCHAR PRIMARY KEY,
      value TEXT
    );`;

    // A content hash per analyzed FILE, so a save can be dismissed by one string comparison before any
    // parsing happens (todo17 Phase 1). Deliberately NOT the `nodes.fingerprint` column: that is a
    // per-SYMBOL hash of `path|name|dna` used by the drift engine, so it cannot answer "did this file
    // change" — a file with no symbols has no fingerprint at all, and an edit that adds a comment
    // changes no fingerprint while still needing a re-parse to move line numbers.
    const fileHashSql = `CREATE TABLE IF NOT EXISTS file_hashes (
      file VARCHAR PRIMARY KEY,
      hash VARCHAR,
      sizeBytes BIGINT,
      updatedAt BIGINT
    );`;

    await run(nodesSql);
    await run(historySql);
    // Existing vaults predate the HTTP columns; ADD COLUMN IF NOT EXISTS is a no-op on new ones.
    for (const col of ['is_route BOOLEAN', 'is_request BOOLEAN', 'http_method VARCHAR',
                       'http_path VARCHAR', 'http_url VARCHAR']) {
      await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await run(edgesSql);
    await run(pulsesSql);
    await run(metaSql);
    await run(fileHashSql);

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
  /**
   * Materialise the vault into an in-memory graph.
   *
   * `shallow` skips the per-node compression `addNode` otherwise performs — MEASURED at 102 MB to
   * ingest 6,544 nodes, and it is pure waste for a caller that only reads skeleton properties,
   * because `getAllNodes()` returns skeletons and never the compressed half. It also makes
   * `getNode()` cheap: with meat present that call inflates zlib and re-parses JSON EVERY time.
   *
   * It is opt-in rather than the default because a shallow node genuinely loses its non-skeleton
   * properties, and the mirror's `hydrateNode` depends on them.
   */
  public async load(graph: any, options: { shallow?: boolean } = {}): Promise<void> {
    const db = await this.ensureVaultOpen();
    // Only the columns this method actually reads. `SELECT *` fetched all 26 and the driver
    // materialises every one as a JavaScript value — MEASURED at 190 MB to pull 6,544 node rows,
    // roughly 29 KB per row for data that is a fraction of that. `dna`, `signature` and `kinetic`
    // are deliberately absent: they are stored BOTH as their own columns and inside `metadata`, and
    // the spread below already carries them, so selecting them again cost three extra JSON parses
    // per node for values that were then overwritten with equal ones.
    // A shallow load fetches REAL COLUMNS ONLY and never the `metadata` blob. `addNode` keeps a
    // fixed skeleton and discards the rest, and all but four of those fields are real columns; the
    // four that are not (`parentname`, `rank`, `kineticEnergy`, `isExport`) have no reader on the
    // analyze path. The full load keeps the blob because `explain`, `rename`, `diff` and the
    // mirror's `hydrateNode` do read it.
    const nodes = await this.query(options.shallow
      ? `SELECT id, canonicalKind, name, file, semantic_kind, canonicalRank, gravity, complexity,
                risk, unitId, parentId, namespaceId, layer_path, depth,
                fingerprint, rootId, structureId, isEntryPoint, lineStart, lineEnd,
                is_route, is_request, http_method, http_path, http_url FROM nodes`
      : `SELECT id, canonicalKind, name, file, semantic_kind, canonicalRank, gravity, complexity,
                risk, unitId, parentId, namespaceId, layer_path, depth, metadata,
                is_route, is_request, http_method, http_path, http_url FROM nodes`);
    traceMemory(`load: ${nodes.length} node rows fetched`);
    const edges = await this.query(
      `SELECT id, sourceId, targetId, type, weight, confidence, properties FROM edges`);
    traceMemory(`load: ${edges.length} edge rows fetched`);

    for (const row of nodes) {
      graph.addNode({
        id: row.id,
        label: row.canonicalKind,
        name: row.name,
        isShallow: options.shallow === true,
        properties: {
          // A shallow row carries no blob, so the skeleton fields that used to be pulled out of it
          // come from their real columns instead. The four that exist ONLY inside `metadata` —
          // `parentname`, `rank`, `kineticEnergy`, `isExport` — have no reader on this path, which
          // is what makes dropping the blob safe rather than merely cheaper.
          ...(options.shallow ? {
            fingerprint: row.fingerprint,
            rootId: row.rootId ?? undefined,
            structureId: row.structureId,
            isEntryPoint: row.isEntryPoint,
            range: { start: { line: row.lineStart }, end: { line: row.lineEnd } },
          } : JSON.parse(row.metadata)),
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
          // Restored from real columns so cross-service binding survives a reload. `?? undefined`
          // rather than the raw null, because `bindRouteCircuits` tests truthiness.
          isRoute: row.is_route ?? undefined,
          isRequest: row.is_request ?? undefined,
          method: row.http_method ?? undefined,
          path: row.http_path ?? undefined,
          url: row.http_url ?? undefined
        }
      });
    }

    traceMemory('load: nodes ingested into graph');
    for (const row of edges) {
      // A ConducksEdge carries its data on `.properties` — there is no `.metadata` field. Loading
      // into `.metadata` (old code) left EVERY vault-loaded edge with `properties === undefined`,
      // the mirror of the save-side bug fixed in saveEdges. Load into the real field.
      graph.addEdge({
        id: row.id,
        sourceId: row.sourceId,
        targetId: row.targetId,
        type: row.type,
        weight: row.weight,
        confidence: row.confidence,
        properties: JSON.parse(row.properties || '{}')
      });
    }
  }

  /**
   * The largest number of bound parameters one statement may carry.
   *
   * The node driver passes parameters through `Function.prototype.apply`, so a big enough batch
   * overflows the JS call stack rather than failing in the database. Measured: 26 columns x 2000
   * rows = 52,000 params throws `RangeError: Maximum call stack size exceeded`; 13,000 is fine.
   * The cap is on PARAMETERS rather than rows because the two tables have very different widths —
   * a row count safe for 10-column edges is not safe for 26-column nodes.
   */
  private static readonly MAX_BOUND_PARAMS = 10000;

  /**
   * How many rows one multi-row statement may carry, for a table of `width` columns.
   *
   * Two independent limits, and BOTH are load-bearing:
   *
   * The parameter cap is a JavaScript limit, not a database one — the node driver passes bound
   * parameters through `Function.prototype.apply`, so 26 columns x 2000 rows throws
   * `RangeError: Maximum call stack size exceeded` before DuckDB is reached.
   *
   * The power-of-two rounding is a DuckDB limit. It processes in vectors of 2048 rows, and a
   * multi-row `INSERT OR REPLACE` at a batch that does not divide that vector crashed the process
   * with `INTERNAL Error: Unaligned fetch in validity and main column data for update` inside
   * `MergeIntoGlobalState::Sink -> PhysicalUpdate::Sink`. MEASURED at batch 384: roughly one run in
   * three, on a FRESH vault as well as an old one, so neither vault corruption nor a timing
   * artefact. At batch 256 the same analyze ran 20 times with no failure.
   *
   * This is exported for a test rather than left inline because the failure it prevents is
   * NONDETERMINISTIC — a behavioural test would pass two runs in three while broken, which is
   * exactly how this shipped in the first place. The rule can be asserted even though the crash
   * cannot be reliably reproduced.
   */
  public static batchSizeFor(width: number): number {
    const fit = Math.max(1, Math.floor(SynapsePersistence.MAX_BOUND_PARAMS / width));
    return Math.max(1, 2 ** Math.floor(Math.log2(fit)));
  }

  /**
   * Write rows in batches: UPDATE the ids that exist, INSERT the ones that do not, DELETE nothing.
   *
   * Batching is for memory. DuckDB allocates transaction-local storage PER STATEMENT and coalesces
   * none of it before the COMMIT, so inside the atomic pulse a row-by-row writer costs ~885 KB per
   * row instead of ~0.8 KB — measured, 26 columns, 20,000 rows: 17,281 MB against 15 MB.
   *
   * The update/insert SPLIT is for a DuckDB bug, and it replaced two earlier shapes that each fed
   * it differently. Deleting and re-inserting the same primary key inside one transaction hits
   * over-eager index checking (duckdb/duckdb#2241, #16520, #16604; edge cases remain after #15836)
   * and fails with `Duplicate key ... violates primary key constraint` — but only under enough
   * surrounding churn, which is why every small probe of the pattern passes while a real pulse
   * against an aged vault failed deterministically. Proven by capturing a failing pulse's statement
   * log (`CONDUCKS_SQL_LOG`), replaying it verbatim, and delta-shrinking: the minimal repro is
   * BEGIN; delete+insert one batch of OTHER committed rows; then delete+insert a batch containing
   * the victim key. Both halves are needed, the victim is written only ONCE, and the failure
   * survives vault compaction — so "track ids written twice" (the previous fix here) only removed
   * one trigger and dodged the other through batch composition. Never re-inserting an existing key
   * removes the pattern itself.
   *
   * `INSERT OR REPLACE` is not an option either: multi-row it compiles to a MERGE, and DuckDB
   * crashes inside `MergeIntoGlobalState::Sink` with `INTERNAL Error: Unaligned fetch in validity
   * and main column data for update`, about one run in three at some batch shapes.
   *
   * The UPDATE is one statement per batch — `UPDATE ... FROM (VALUES ...)` — not row-by-row, or the
   * per-statement memory cost above comes straight back through the other door.
   *
   * Rows are deduplicated on their id, last one winning, which preserves what row-by-row
   * `INSERT OR REPLACE` did. The existence probe reads the table INSIDE the open transaction, so it
   * sees earlier writes of this same pulse — a row this pulse inserted is updated on re-write.
   */
  private async insertBatched(table: string, columns: string[], rows: unknown[][]): Promise<void> {
    if (!rows.length) return;

    const deduped = new Map<unknown, unknown[]>();
    for (const row of rows) deduped.set(row[0], row);

    const width = columns.length;
    const perBatch = SynapsePersistence.batchSizeFor(width);
    const idColumn = columns[0];
    const all = Array.from(deduped.values());

    // Which of these ids already exist? Batched IN-list probes; reads cost no transaction-local
    // storage. Seen through the open transaction, so purged rows correctly count as absent.
    const existing = new Set<unknown>();
    for (let off = 0; off < all.length; off += perBatch) {
      const ids = all.slice(off, off + perBatch).map(row => row[0]);
      const found = await this.query<{ id: unknown }>(
        `SELECT ${idColumn} AS id FROM ${table} WHERE ${idColumn} IN (${ids.map(() => '?').join(',')})`, ids);
      for (const r of found) existing.add(r.id);
    }

    const inserts = all.filter(row => !existing.has(row[0]));
    const updates = all.filter(row => existing.has(row[0]));

    const tuple = `(${Array(width).fill('?').join(',')})`;
    const insertHead = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `;
    for (let off = 0; off < inserts.length; off += perBatch) {
      const slice = inserts.slice(off, off + perBatch);
      await this.run(insertHead + Array(slice.length).fill(tuple).join(','), slice.flat());
    }

    if (updates.length) {
      const setters = columns.slice(1).map(c => `${c} = v.${c}`).join(', ');
      const updateHead = `UPDATE ${table} SET ${setters} FROM (VALUES `;
      const updateTail = `) AS v(${columns.join(', ')}) WHERE ${table}.${idColumn} = v.${idColumn}`;
      for (let off = 0; off < updates.length; off += perBatch) {
        const slice = updates.slice(off, off + perBatch);
        await this.run(updateHead + Array(slice.length).fill(tuple).join(',') + updateTail, slice.flat());
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async saveNodes(nodes: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    await this.ensureVaultOpen();
    const owned = !this.inPulse;
    const columns = ['id', 'pulseId', 'fingerprint', 'canonicalKind', 'canonicalRank', 'semantic_kind', 'name', 'file', 'lineStart', 'lineEnd', 'parentId', 'rootId', 'namespaceId', 'unitId', 'structureId', 'layer_path', 'depth', 'risk', 'gravity', 'complexity', 'isEntryPoint', 'visibility', 'dna', 'signature', 'kinetic', 'metadata', 'is_route', 'is_request', 'http_method', 'http_path', 'http_url'];
    try {
      if (owned) await this.run("BEGIN TRANSACTION");
      const rows = nodes.map(n => {
        const m = n.properties || {};
        const name = m.name || n.name || 'unknown';
        const filePath = m.filePath || n.filePath || '';

        // 🛡️ [Synapse Taxonomy] Priority mapping for semantic kind
        const semanticKind = (m.kind || n.kind || n.label || 'unknown').toLowerCase();
        const canonicalKind = m.canonicalKind || n.label || 'STRUCTURE';
        const canonicalRank = m.canonicalRank || n.canonicalRank || 0;

        return [
          n.id.toLowerCase(), pulseId, m.fingerprint || null, canonicalKind, canonicalRank, semanticKind, name, filePath.toLowerCase(), m.range?.start.line || 0, m.range?.end.line || 0,
          m.parentId?.toLowerCase() || null, m.rootId?.toLowerCase() || null, m.namespaceId?.toLowerCase() || null, m.unitId?.toLowerCase() || null, m.structureId?.toLowerCase() || null,
          m.layer_path || null, m.depth || 0, m.risk || 0, n.gravity || m.gravity || 0, n.complexity || m.complexity || 1,
          m.isEntryPoint || false, m.visibility || 'public', JSON.stringify(m.dna || {}), JSON.stringify(m.signature || {}), JSON.stringify(m.kinetic || {}),
          JSON.stringify({ ...m, id: n.id, name, range: m.range }),
          m.isRoute ?? null, m.isRequest ?? null, m.method ?? null, m.path ?? null, m.url ?? null
        ];
      });
      await this.insertBatched('nodes', columns, rows);
      if (owned) await this.run("COMMIT");
    } catch (err) {
      if (owned) { try { await this.run('ROLLBACK'); } catch {} }
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async saveEdges(edges: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    await this.ensureVaultOpen();
    const owned = !this.inPulse;
    const columns = ['id', 'pulseId', 'sourceId', 'targetId', 'category', 'type', 'weight', 'confidence', 'lineNumber', 'properties'];
    try {
      if (owned) await this.run("BEGIN TRANSACTION");
      const rows = edges.map(e => {
        // Graph edges (ConducksEdge) carry their data on `.properties`, not `.metadata`; weight lives
        // on `.confidence`. Reading `.metadata`/`.weight` (old code) silently dropped EVERY edge's
        // properties + lineNumber and forced weight=1.0. Read the real fields.
        const props = e.properties || e.metadata || {};
        return [
          e.id, pulseId, e.sourceId?.toLowerCase(), e.targetId?.toLowerCase(), e.type === 'IMPORTS' ? 'dependency' : 'structural', e.type, e.weight || e.confidence || 1.0, e.confidence || 1.0, props?.line || 0, JSON.stringify(props)
        ];
      });
      await this.insertBatched('edges', columns, rows);
      if (owned) await this.run("COMMIT");
    } catch (err) {
      if (owned) { try { await this.run('ROLLBACK'); } catch {} }
      throw err;
    }
  }

  public async purgeUnits(unitIds: string[]): Promise<void> {
    if (this.readOnly) return;
    if (!unitIds.length) return;
    await this.ensureVaultOpen();

    const lowered = unitIds.map(id => id.toLowerCase());
    const placeholders = lowered.map(() => '?').join(',');
    const owned = !this.inPulse;

    try {
      if (owned) await this.run(`BEGIN TRANSACTION`);
      // A unit's own row has `unitId = NULL` — it IS the unit, so it belongs to none. Matching only
      // on `unitId` therefore deleted every CHILD and left the UNIT row behind, and the consequences
      // were not subtle: `analyze`'s reconcile found the same 46 units "no longer discoverable" on
      // EVERY pulse, purged their (already absent) children, and found them again next time. That is
      // unbounded churn against a store that never reclaims deleted row versions (ADR 0037), and the
      // graph meanwhile kept answering with 44 files that do not exist on disk.
      // The ids passed in ARE the unit ids (`<file>::unit`), so matching `id` too is exact.
      const owns = `(unitId IN (${placeholders}) OR id IN (${placeholders}))`;
      const both = [...lowered, ...lowered];
      await this.run(`DELETE FROM edges WHERE sourceId IN (SELECT id FROM nodes WHERE ${owns})`, both);
      // Drop the content hashes of the purged files BEFORE their nodes go, while the subquery can still
      // find them. Leaving a hash behind is the sharp edge of the hash gate (ADR 0030): the file would
      // look "already analyzed" to the gate and be skipped forever, while having no nodes at all.
      await this.run(
        `DELETE FROM file_hashes WHERE file IN (SELECT DISTINCT file FROM nodes WHERE ${owns})`,
        both
      );
      await this.run(`DELETE FROM nodes WHERE ${owns}`, both);
      if (owned) await this.run(`COMMIT`);
    } catch (err) {
      if (owned) { try { await this.run('ROLLBACK'); } catch {} }
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // NOTE: this used to accept a `metadataOnly` flag that the body never read. Two call-site
  // comments described it as the switch that suppressed row writes, so the obvious fix for a
  // binder whose output vanished was to flip it — which would have changed nothing. save() writes
  // metadata and the pulse row and commits; it has never written node or edge rows in any mode.
  public async save(graph: any, options: { nodeCount?: number, edgeCount?: number } = {}): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    const pulseId = graph.getMetadata('targetPulseId') || `pulse_${Date.now()}`;
    const headHash = chronicle.getHeadHash() || 'unknown';

    // save() is the FINAL step of an analyze pulse: writing the pulse record + metadata and then
    // COMMITting is what atomically publishes the whole pulse. If we're inside a pulse (inPulse),
    // this COMMIT closes that big transaction; otherwise save() runs standalone in its own.
    const owned = !this.inPulse;
    try {
      if (owned) await this.run(`BEGIN TRANSACTION`);
      const metadata = graph.getAllMetadata();
      for (const [key, value] of metadata.entries()) {
        await this.run(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`, [key, String(value)]);
      }
      await this.run(`INSERT OR REPLACE INTO pulses (id, timestamp, commitHash, nodeCount, edgeCount, metadata) VALUES (?, ?, ?, ?, ?, ?)`, [
        // `stats` is a GETTER on ConducksAdjacencyList — there is no nodeCount()/edgeCount() method,
        // and calling one threw for every caller that omitted the counts. That was the watcher: both
        // its auto-pulse and its writer save() call sites pass no options, so every incremental save
        // died with "graph.nodeCount is not a function", got logged by the watcher's catch, and the
        // delta was never written to the vault. The two callers that pass counts explicitly never hit
        // this line, which is why it survived.
        pulseId, Date.now(), headHash, options.nodeCount ?? graph.stats?.nodeCount ?? 0, options.edgeCount ?? graph.stats?.edgeCount ?? 0, JSON.stringify(Object.fromEntries(metadata))
      ]);
      await this.run(`COMMIT`);   // publishes the pulse (owned tx, or the big inPulse tx)
      this.inPulse = false;
    } catch (err) {
      // On failure leave inPulse as-is so the caller's abortPulse() rolls the whole pulse back.
      if (owned) { try { await this.run('ROLLBACK'); } catch {} }
      throw err;
    }
  }

  public async run(sql: string, params: unknown[] = []): Promise<void> {
    if (this.readOnly) {
      throw new Error(`🛡️ [Persistence] WRITE BLOCKED: Attempted to execute mutational SQL on a Read-Only vault connection.`);
    }
    // `CONDUCKS_SQL_LOG=<file>` appends every write statement as one JSONL row, so a failing pulse
    // can be REPLAYED verbatim instead of reconstructed from a description of it. Exists because
    // four reconstructions of a duplicate-key failure each failed to reproduce it — the fixture
    // encoded a theory of the pulse, and the theory was the unreliable part. Off unless asked for.
    if (process.env.CONDUCKS_SQL_LOG) {
      fs.appendFileSync(process.env.CONDUCKS_SQL_LOG, JSON.stringify({ sql, params }) + '\n');
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

  /**
   * The stored content hash for a file, or undefined if it has never been analyzed.
   *
   * Keys are lowercased absolute paths, matching `nodes.file` (CONDUCKS-4 — ids and paths are
   * lowercase-normalized for APFS). A caller passing a differently-cased path gets a miss, which
   * costs a re-parse rather than a wrong answer.
   */
  public async getFileHash(file: string): Promise<string | undefined> {
    const rows = await this.query<{ hash: string }>(
      "SELECT hash FROM file_hashes WHERE file = ?",
      [file.toLowerCase()]
    );
    return rows[0]?.hash;
  }

  /** Every stored hash, for a caller that is about to check many files (a full pulse, or the monitor). */
  public async getAllFileHashes(): Promise<Map<string, string>> {
    const rows = await this.query<{ file: string; hash: string }>("SELECT file, hash FROM file_hashes");
    return new Map(rows.map(r => [r.file, r.hash]));
  }

  /**
   * Records the hash of a file that was just analyzed. Silent no-op on a read-only connection — a
   * missing hash only costs a redundant parse next time, so it must never fail the caller.
   */
  /**
   * Seed the hash gate for MANY files in one statement per batch.
   *
   * `analyze` called the per-file version once per unit — MEASURED at 974 statements and 720 ms on a
   * 974-unit project, the slowest per statement of the three per-row writers found by todo22#P8.
   * Reuses `insertBatched`, so it inherits the update-or-insert split that avoids the DuckDB
   * delete-and-reinsert bug (ADR 0041) rather than re-deriving it here.
   */
  public async setFileHashBatch(
    entries: Array<{ file: string; hash: string; sizeBytes: number }>
  ): Promise<void> {
    if (this.readOnly || !entries.length) return;
    const now = Date.now();
    await this.insertBatched('file_hashes', ['file', 'hash', 'sizeBytes', 'updatedAt'],
      entries.map(e => [e.file.toLowerCase(), e.hash, e.sizeBytes, now]));
  }

  public async setFileHash(file: string, hash: string, sizeBytes: number): Promise<void> {
    if (this.readOnly) return;
    await this.run(
      "INSERT OR REPLACE INTO file_hashes (file, hash, sizeBytes, updatedAt) VALUES (?, ?, ?, ?)",
      [file.toLowerCase(), hash, sizeBytes, Date.now()]
    );
  }

  /** Drops a hash so the file is re-analyzed next time — used when its nodes are purged. */
  public async forgetFileHash(file: string): Promise<void> {
    if (this.readOnly) return;
    await this.run("DELETE FROM file_hashes WHERE file = ?", [file.toLowerCase()]);
  }

  public async updateRanks(nodeRanks: Array<{ id: string, gravity: number, isEntryPoint?: boolean }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();

    // Write only what CHANGED. Every pulse recomputes gravity for the whole graph and used to write
    // all of it back — 2,380 rows at 329 ms, on a pulse where one line of one file moved. Measured
    // on an unchanged graph, the number of rows whose value genuinely differs is ZERO.
    //
    // The comparison is RELATIVE and at float32 precision, because `gravity` is a REAL column: a
    // float64 recomputed in JS never round-trips exactly, so an exact comparison finds 1,048 of
    // 2,380 rows "changed" when none are, and skipping the read would look pointless. Anything
    // above 1e-7 relative is a real movement in the rank, not storage noise.
    const EPS = 1e-7;
    const stored = new Map(
      (await this.query<{ id: string; gravity: number; isEntryPoint: boolean }>(
        'SELECT id, gravity, isEntryPoint FROM nodes'))
        .map(r => [r.id, { gravity: Number(r.gravity) || 0, isEntryPoint: Boolean(r.isEntryPoint) }]));

    const changed = nodeRanks.filter(entry => {
      const prev = stored.get(entry.id.toLowerCase());
      if (!prev) return true;                       // unknown row: write it, do not guess
      const next = entry.gravity || 0;
      const scale = Math.max(Math.abs(prev.gravity), Math.abs(next), 1e-30);
      return Math.abs(prev.gravity - next) / scale > EPS
        || prev.isEntryPoint !== (entry.isEntryPoint ?? false);
    });
    if (!changed.length) return;

    try {
      const exec = (sql: string) => new Promise<void>((r, j) => db.exec(sql, (e: duckdb.DuckDbError | null) => e ? j(e) : r()));
      const owned = !this.inPulse;
      if (owned) await exec("BEGIN TRANSACTION");
      // Batched, not one statement per node. Inside the pulse DuckDB charges per statement, and
      // MEASURED on a 974-unit project this loop was 2,416 statements and 369 ms — the same trap
      // ADR 0041 batched the node and edge writes to escape, and the third call site found by
      // sweeping for it (todo22#P8).
      await this.updateFromValues('nodes', 'id',
        ['gravity', 'isEntryPoint'],
        changed.map(e => [e.id.toLowerCase(), e.gravity, e.isEntryPoint ?? false]));
      if (owned) await exec("COMMIT");
    } catch (fail) {
      if (!this.inPulse) { try { await this.run('ROLLBACK'); } catch {} }
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
      const owned = !this.inPulse;
      if (owned) await exec("BEGIN TRANSACTION");
      // PER-ROW ON PURPOSE, and the only survivor of the todo22#P8 sweep. Batching this into
      // `updateFromValues` — the same helper `updateRanks` above uses safely on `nodes` — fails the
      // pulse with `PRIMARY KEY or UNIQUE constraint violation: duplicate key "semantic::...
      // ::type_reference"` on an edge id the statement never writes. Reproducible; reverting this
      // one call and leaving the other two batched runs clean. Almost certainly the same DuckDB
      // index bug ADR 0041 documents (duckdb/duckdb#2241, #16520, #16604) reached from a third
      // direction, since `edges` has just taken a large insert in this transaction — but the
      // mechanism is NOT established, and 1,566 statements at 364 ms is not worth guessing at.
      // Capture the statement log and shrink it before trying again: todo22#P8.
      // Confidence is raised with the target, for the reason in `rebindEdgeTarget`: a resolved
      // edge is no longer a guess. Without this, ADR 0046's 0.4 stuck to edges the linker had
      // since resolved, so the column understated them — a new inaccuracy introduced by the fix
      // for the old one.
      const stmt = db.prepare(`UPDATE edges SET targetId = ?, confidence = CASE WHEN confidence < 0.6 THEN 0.85 ELSE confidence END WHERE id = ?`);
      for (const entry of rebinds) {
        await new Promise<void>((r, j) => stmt.run(entry.newTargetId.toLowerCase(), entry.id, (e: Error | null) => e ? j(e) : r()));
      }
      stmt.finalize();
      if (owned) await exec("COMMIT");
    } catch (fail) {
      if (!this.inPulse) { try { await this.run('ROLLBACK'); } catch {} }
      throw fail;
    }
  }

  /**
   * Taxonomy reconcile — cut DATA, edge-gate ATOM (ADR 0013 / todo09 C0).
   *
   * Runs AFTER linking, so the reference edges exist. An ATOM node survives only if it carries a
   * real reference edge (IMPORTS/CALLS/CONSTRUCTS/TYPE_REFERENCE/ACCESSES/…) — anything not in
   * STRUCTURAL_EDGE_TYPES. Local vars/params/fields with only containment edges are demoted (their
   * param info already lives in the parent BEHAVIOR's dna). DATA (parameters/arguments/literals) is
   * always cut — nothing depends on it. This kills the ~72% ATOM flood (~5,000 → ~1,400 nodes).
   *
   * Reference edges that touched a dropped node are rerouted onto its parent so no dependency is
   * lost. Executes via run() inside the active pulse transaction (inPulse), so it commits atomically
   * with save() and rolls back with abortPulse() on any failure — never leaves a half-pruned graph.
   */
  /**
   * Delete every row this pulse did not touch (ADR 0050).
   *
   * ONLY safe after a FULL pulse. An incremental one — the watcher, a micro-pulse — writes a handful
   * of files, so sweeping there would delete the entire rest of the graph. The caller is responsible
   * for that distinction and this method cannot check it, which is why the name says what it does
   * rather than sounding like maintenance.
   *
   * The sweep keys on `pulseId`, which is correct ONLY because induction now re-stamps the virtual
   * nodes it skips. Before that, those rows kept the pulse that first created them, so this delete
   * would have removed every still-valid external symbol — measured, 1,653 of them on a two-pulse
   * vault. That is the counterexample the ADR is built on; do not re-introduce the skip.
   */
  /**
   * Delete edges that were written as a GUESS and never resolved (ADR 0055).
   *
   * Run at the very end of a pulse, after IntraLinker has rebound what it can and induction has
   * materialised the genuinely external targets. What is left pointing at nothing, carrying the
   * give-up confidence ADR 0046 assigns, is a call on a local value: `line.trim`, `args.includes`,
   * `results.filter`. Those name no symbol this project contains and none it depends on, so there is
   * nothing for the target to ever become.
   *
   * The confidence floor is the whole safety of this. An edge at 0.85 or 1.0 that still dangles is a
   * real reference the resolver could not place — a bug to investigate, not a row to delete — and it
   * survives. Only the band that already says "this was a guess" is swept.
   */
  public async sweepUnresolvedGuesses(minConfidence: number = 0.6): Promise<number> {
    if (this.readOnly) return 0;
    await this.ensureVaultOpen();
    const [before] = await this.query<{ c: number }>(
      `SELECT count(*)::INT AS c FROM edges e
       LEFT JOIN nodes n ON e.targetId = n.id
       WHERE n.id IS NULL AND e.confidence < ?`, [minConfidence]);
    await this.run(
      `DELETE FROM edges WHERE confidence < ?
         AND targetId NOT IN (SELECT id FROM nodes)`, [minConfidence]);
    return Number(before?.c ?? 0);
  }

  public async sweepRowsNotInPulse(pulseId: string): Promise<{ nodes: number; edges: number }> {
    if (this.readOnly) return { nodes: 0, edges: 0 };
    await this.ensureVaultOpen();

    const [before] = await this.query<{ n: number; e: number }>(
      `SELECT (SELECT count(*) FROM nodes WHERE pulseId <> ?)::INT AS n,
              (SELECT count(*) FROM edges WHERE pulseId <> ?)::INT AS e`, [pulseId, pulseId]);

    // Edges first: an edge outliving its endpoints is the dangling state this project spent a day
    // measuring, so the order is not incidental.
    await this.run(`DELETE FROM edges WHERE pulseId <> ?`, [pulseId]);
    await this.run(`DELETE FROM nodes WHERE pulseId <> ?`, [pulseId]);

    return { nodes: Number(before?.n ?? 0), edges: Number(before?.e ?? 0) };
  }

  /**
   * The visual wave, answered from SQL (ADR 0042).
   *
   * The mirror used to render from the IN-MEMORY graph, which meant `conducks mirror` had to
   * materialise every node and edge just to draw a few hundred of them — the exact inversion ADR
   * 0042 argues against, on the one surface where it is least justified, because a dashboard shows a
   * SUMMARY by construction. It also meant the dashboard served an empty wave whenever the graph had
   * not been loaded, which is what `mirror` actually did: it sits in STALENESS_BYPASS, so nothing
   * populated memory and the browser got 0 nodes against a vault holding thousands.
   *
   * A `getCompactWave` was called for this through an `as any` and never existed — the cast made a
   * missing method compile, and the caller's catch turned the runtime failure into an empty result.
   * This is that method, written.
   *
   * TRUNCATION IS REPORTED, never silent: a wave capped at `limit` says so and says by how much, so
   * a reader can tell "this is the whole graph" from "this is the top slice of it".
   */
  public async getVisualWave(
    layers?: number[],
    spread: number = 1200,
    limit: number = 1500
  ): Promise<{ nodes: any[]; links: any[]; clusters: any[]; truncated: boolean; totalNodes: number }> {
    await this.ensureVaultOpen();

    // Containment tiers by default (ecosystem -> unit). Symbol-level ranks are excluded because a
    // force graph of every function is unreadable, not because they are uninteresting.
    const ranks = (layers && layers.length) ? layers : [0, 1, 2, 3, 4, 5, 6];
    const rankList = ranks.map(() => '?').join(',');

    const [{ total }] = await this.query<{ total: number }>(
      `SELECT count(*)::INT AS total FROM nodes WHERE canonicalRank IN (${rankList})`, ranks);

    // Heaviest first, so a truncated wave is the most connected slice rather than an arbitrary one.
    const rows = await this.query<any>(
      `SELECT id, name, canonicalKind, canonicalRank, parentId, file, gravity, complexity, risk
       FROM nodes WHERE canonicalRank IN (${rankList})
       ORDER BY gravity DESC NULLS LAST LIMIT ${Math.max(1, limit)}`, ranks);

    const ids = rows.map(r => r.id);
    if (ids.length === 0) return { nodes: [], links: [], clusters: [], truncated: false, totalNodes: 0 };

    // Only edges whose BOTH endpoints survived the slice — a link to an invisible node is a line to
    // nowhere, which is worse on a canvas than an absent line.
    const inList = ids.map(() => '?').join(',');
    const edges = await this.query<any>(
      `SELECT sourceId, targetId, type, confidence FROM edges
       WHERE sourceId IN (${inList}) AND targetId IN (${inList}) AND sourceId <> targetId`,
      [...ids, ...ids]);

    // Clustering follows ADR 0028's rule, which `mirror.engine.detectCluster()` defines: walk up
    // `parentId` until a DIRECTORY, REPOSITORY or NAMESPACE is reached, and fall back to the global
    // ecosystem. Grouping by the IMMEDIATE parent instead is a different rule with a different
    // answer — it produced 404 clusters here against the containers a reader actually recognises —
    // so the rule is ported rather than replaced, even though the code that runs it moved.
    //
    // The parent chain needs the whole tree, but only three columns of it: id, parentId and kind.
    // That is a projection, not the graph, which is the distinction ADR 0042 draws.
    const parents = await this.query<{ id: string; parentId: string | null; canonicalKind: string }>(
      `SELECT id, parentId, canonicalKind FROM nodes`);
    const byId = new Map(parents.map(n => [n.id, n]));
    const CONTAINERS = new Set(['DIRECTORY', 'REPOSITORY', 'NAMESPACE']);
    const clusterOf = (startId: string): string => {
      let cur: string | null = startId;
      for (let hops = 0; hops < 20 && cur; hops++) {   // same 20-hop bound as detectCluster
        const n = byId.get(cur);
        if (!n) break;
        if (CONTAINERS.has(String(n.canonicalKind))) return cur;
        cur = n.parentId;
      }
      return 'ecosystem::global';
    };

    const clusterById = new Map<string, string>();
    const clusterCounts = new Map<string, number>();
    for (const r of rows) {
      const c = clusterOf(r.id);
      clusterById.set(r.id, c);
      clusterCounts.set(c, (clusterCounts.get(c) || 0) + 1);
    }
    const clusterIds = Array.from(clusterCounts.keys());
    const centres = new Map<string, { x: number; y: number }>();
    clusterIds.forEach((cid, i) => {
      const angle = (i / Math.max(1, clusterIds.length)) * Math.PI * 2;
      centres.set(cid, { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread });
    });

    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.sourceId, (degree.get(e.sourceId) || 0) + 1);
      degree.set(e.targetId, (degree.get(e.targetId) || 0) + 1);
    }

    const nodes = rows.map((r, i) => {
      const clusterId = clusterById.get(r.id) || 'ecosystem::global';
      const centre = centres.get(clusterId) || { x: 0, y: 0 };
      const deg = degree.get(r.id) || 0;
      const angle = (i / Math.max(1, rows.length)) * Math.PI * 2;
      return {
        id: r.id,
        name: r.name || String(r.id).split('::').pop(),
        parentId: r.parentId,
        group: r.canonicalKind,
        level: Number(r.canonicalRank ?? 0),
        clusterId,
        clusterX: centre.x,
        clusterY: centre.y,
        degree: deg,
        mass: 1 + deg / 10,
        gravity: Number(r.gravity ?? 0),
        complexity: Number(r.complexity ?? 0),
        risk: Number(r.risk ?? 0),
        filePath: r.file,
        x: centre.x + Math.cos(angle) * 120,
        y: centre.y + Math.sin(angle) * 120,
      };
    });

    const links = edges.map((e, i) => ({
      id: `${e.sourceId}->${e.targetId}::${e.type}::${i}`,
      source: e.sourceId,
      target: e.targetId,
      type: e.type,
      category: (e.type === 'MEMBER_OF' || e.type === 'CONTAINS') ? 'LINEAGE' : 'KINESIS',
      weight: 1,
      confidence: Number(e.confidence ?? 1),
    }));

    const clusters = clusterIds.map(id => ({
      id,
      count: clusterCounts.get(id) || 0,
      ...(centres.get(id) || { x: 0, y: 0 }),
    }));

    return { nodes, links, clusters, truncated: Number(total) > nodes.length, totalNodes: Number(total) };
  }

  public async pruneTaxonomy(): Promise<void> {
    if (this.readOnly) return;
    await this.ensureVaultOpen();
    const STRUCTURAL = `('MEMBER_OF','CONTAINS','HAS_METHOD','HAS_PROPERTY')`;

    // 1. Freeze the drop set BEFORE mutating edges — the ATOM edge test reads the current edge set.
    await this.run(`CREATE OR REPLACE TEMP TABLE _pruned AS
      SELECT id, parentId FROM nodes n
      WHERE n.canonicalKind = 'DATA'
         OR (n.canonicalKind = 'ATOM' AND NOT EXISTS (
               SELECT 1 FROM edges e
               WHERE (e.sourceId = n.id OR e.targetId = n.id)
                 AND e.type NOT IN ${STRUCTURAL}))`);

    // 2. Reroute reference edges off the dropped nodes onto their parent (dependency preserved).
    await this.run(`UPDATE edges SET sourceId = (SELECT parentId FROM _pruned WHERE id = edges.sourceId)
      WHERE type NOT IN ${STRUCTURAL}
        AND sourceId IN (SELECT id FROM _pruned)
        AND (SELECT parentId FROM _pruned WHERE id = edges.sourceId) IS NOT NULL`);
    await this.run(`UPDATE edges SET targetId = (SELECT parentId FROM _pruned WHERE id = edges.targetId)
      WHERE type NOT IN ${STRUCTURAL}
        AND targetId IN (SELECT id FROM _pruned)
        AND (SELECT parentId FROM _pruned WHERE id = edges.targetId) IS NOT NULL`);

    // 3. Delete edges still touching a dropped node (structural, or reroute had no parent) + self-loops.
    await this.run(`DELETE FROM edges WHERE sourceId IN (SELECT id FROM _pruned) OR targetId IN (SELECT id FROM _pruned)`);
    await this.run(`DELETE FROM edges WHERE sourceId = targetId`);

    // 4. Drop the nodes.
    await this.run(`DELETE FROM nodes WHERE id IN (SELECT id FROM _pruned)`);
    await this.run(`DROP TABLE _pruned`);
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

  /**
   * `UPDATE <table> SET <cols> FROM (VALUES ...)` — one statement per batch, not per row.
   *
   * Every per-row write inside the pulse pays per-statement transaction-local storage, and the cost
   * GROWS through the transaction: ADR 0041 measured 885 KB per row against 0.8 KB self-committing.
   * Three call sites were found by sweeping for the pattern rather than waiting for the next
   * symptom — `updateRanks` (2,416 statements, 369 ms), `updateEdgeTargets` (1,566, 364 ms) and the
   * file-hash gate (974, 720 ms), all on a single 974-unit project.
   *
   * `rows` are `[key, ...values]` matching `[keyColumn, ...columns]`. Deduplicated on the key, last
   * one winning, because two updates to one row inside a single statement is not defined behaviour.
   */
  private async updateFromValues(
    table: string, keyColumn: string, columns: string[], rows: unknown[][]
  ): Promise<void> {
    if (this.readOnly || !rows.length) return;

    const deduped = new Map<unknown, unknown[]>();
    for (const row of rows) deduped.set(row[0], row);
    const all = Array.from(deduped.values());

    const width = columns.length + 1;
    const perBatch = SynapsePersistence.batchSizeFor(width);
    const tuple = `(${Array(width).fill('?').join(',')})`;
    const setters = columns.map(c => `${c} = v.${c}`).join(', ');
    const head = `UPDATE ${table} SET ${setters} FROM (VALUES `;
    const tail = `) AS v(${keyColumn}, ${columns.join(', ')}) WHERE ${table}.${keyColumn} = v.${keyColumn}`;

    for (let off = 0; off < all.length; off += perBatch) {
      const slice = all.slice(off, off + perBatch);
      await this.run(head + Array(slice.length).fill(tuple).join(',') + tail, slice.flat());
    }
  }

  /**
   * Write kinetic columns for MANY symbols in one statement per batch.
   *
   * The per-symbol `updateKineticColumns` below runs one UPDATE per row, and `analyze` called it
   * once for every symbol in every wave — inside the open pulse transaction, where DuckDB allocates
   * transaction-local storage PER STATEMENT and coalesces none of it before the COMMIT. That is the
   * same trap ADR 0041 batched the node and edge writes to escape; this call site was simply missed.
   *
   * MEASURED on a 4,000-file project, 9 waves: the per-symbol loop cost 1,243 ms in wave 1 and grew
   * to 1,665 ms by wave 8 while the rows written per wave stayed flat — the cost per statement rises
   * as the transaction accumulates. On a 9,310-unit project the same stage grew from 11 s to 97 s.
   * Batching makes it one statement per 2,500 rows instead of one per row.
   *
   * All four columns are written for every row, with COALESCE preserving whatever is already stored
   * when a symbol has no value for one of them. The per-row version built a partial SET clause
   * instead; doing that in a batch would need a different statement per column combination, and
   * COALESCE keeps one statement while leaving untouched columns untouched.
   */
  public async updateKineticBatch(rows: Array<{
    nodeId: string;
    blame_age_days?: number;
    churn_count_90d?: number;
    entropy_score?: number;
    last_author?: string;
  }>): Promise<void> {
    if (this.readOnly || !rows.length) return;

    const deduped = new Map<string, typeof rows[number]>();
    for (const r of rows) deduped.set(r.nodeId.toLowerCase(), r);
    const all = Array.from(deduped.entries());

    const WIDTH = 5;
    const perBatch = SynapsePersistence.batchSizeFor(WIDTH);
    const tuple = `(${Array(WIDTH).fill('?').join(',')})`;
    const head = `UPDATE nodes SET
        blame_age_days = COALESCE(v.blame_age_days, nodes.blame_age_days),
        churn_count_90d = COALESCE(v.churn_count_90d, nodes.churn_count_90d),
        entropy_score = COALESCE(v.entropy_score, nodes.entropy_score),
        last_author = COALESCE(v.last_author, nodes.last_author)
      FROM (VALUES `;
    const tail = `) AS v(id, blame_age_days, churn_count_90d, entropy_score, last_author)
      WHERE nodes.id = v.id`;

    for (let off = 0; off < all.length; off += perBatch) {
      const slice = all.slice(off, off + perBatch);
      const params: unknown[] = [];
      for (const [id, d] of slice) {
        params.push(id, d.blame_age_days ?? null, d.churn_count_90d ?? null,
          d.entropy_score ?? null, d.last_author ?? null);
      }
      await this.run(head + Array(slice.length).fill(tuple).join(',') + tail, params);
    }
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

  /**
   * Record what every symbol looked like at the end of this pulse.
   *
   * `nodes` keeps one row per id — the current state — so nothing in the vault could answer "what
   * was this symbol's gravity last pulse". `drift` and `audit --history` were both written as if
   * `nodes` held history and were structurally incapable of returning a row (todo22#P14). This is
   * the table they needed.
   *
   * `INSERT INTO ... SELECT` is one server-side statement with no bound parameters, so it costs one
   * statement of transaction-local storage regardless of project size and cannot hit the multi-row
   * write bugs of ADR 0041.
   *
   * Retention is bounded because this grows per pulse — roughly 4,836 rows on a 974-unit project,
   * so an unbounded table would outgrow the graph it describes. `KEEP_PULSES` back is enough for
   * `audit --history`, whose own window defaults to 5.
   */
  private static readonly KEEP_PULSES = 20;

  public async snapshotHistory(pulseId: string): Promise<void> {
    if (this.readOnly) return;
    await this.run(
      `INSERT INTO node_history (pulseId, nodeId, gravity, complexity, fingerprint)
       SELECT ?, id, gravity, complexity, fingerprint FROM nodes`, [pulseId]);
    // Drop snapshots older than the retention window. Done here rather than as a chore because a
    // maintenance command nobody runs is a table nobody prunes (the reasoning of ADR 0037).
    await this.run(
      `DELETE FROM node_history WHERE pulseId NOT IN (
         SELECT id FROM pulses ORDER BY timestamp DESC LIMIT ${SynapsePersistence.KEEP_PULSES})`);
  }

  /**
   * Reclaim the vault by rewriting it into a fresh database and swapping the file in.
   *
   * DuckDB never reclaims deleted row versions in place. `purgeUnits()` + re-insert leaves the old
   * versions in their row groups permanently, and `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and
   * `FORCE CHECKPOINT` were each measured and each left the file byte-identical (ADR 0036,
   * `memory.md`). Rewriting is the ONLY thing that reclaims: `duckdb_tables().estimated_size`
   * reported 285,868 edge rows against 12,590 real, and this took 235.3 MB to 14.0 MB in 100 ms
   * with every table, every row count and the content hashes of `nodes` and `edges` unchanged.
   *
   * Crash safety is the whole design. The rewrite goes to a sibling temp file, is closed so DuckDB
   * flushes it, and only then replaced by an atomic `rename` — a crash at any point leaves either
   * the old vault or the new one intact, never a half-written vault. The temp file is removed on
   * any failure, so a crashed compaction costs disk once and not forever.
   *
   * Returns the before/after byte sizes so a caller can report what it saved. Returns null when
   * there is no vault, or when the rewrite came out no smaller than the original — see the
   * young-vault case inline.
   */
  /**
   * How many row versions DuckDB is carrying per row that actually exists.
   *
   * `duckdb_tables().estimated_size` counts versions, not rows, so it is the only thing that sees
   * the leak: this repo's vault reported 285,868 edges against 12,590 real. One cheap query answers
   * "is a rewrite worth 100 ms" without doing the rewrite to find out, which is what lets a watcher
   * call this on every pulse and pay almost nothing on a healthy vault.
   *
   * Returns 1 for a clean vault, and null when there is nothing to measure.
   */
  public async bloatRatio(): Promise<number | null> {
    const rows = await this.query<{ estimated: number; actual: number }>(`
      SELECT (SELECT sum(estimated_size) FROM duckdb_tables() WHERE table_name IN ('nodes','edges')) AS estimated,
             (SELECT count(*) FROM nodes) + (SELECT count(*) FROM edges) AS actual`);
    const estimated = Number(rows[0]?.estimated ?? 0);
    const actual = Number(rows[0]?.actual ?? 0);
    if (!actual) return null;
    return Math.max(1, estimated / actual);
  }

  /**
   * Compact, but only once the vault has decayed enough to be worth the rewrite.
   *
   * The gate lives HERE rather than in composition because it is the load-bearing half: too high a
   * threshold and the vault grows forever behind a check that always says "healthy", too low and
   * every pulse pays a rewrite it does not need. A rule that important has to be reachable by a test
   * that points at a real vault — with it in the registry, a test could only re-implement it and
   * would then pass while the shipped wiring was broken. Composition just calls this.
   */
  public async reclaimIfBloated(minRatio = 3): Promise<{ before: number; after: number } | null> {
    const ratio = await this.bloatRatio();
    if (ratio === null || ratio < minRatio) return null;
    return this.compact();
  }

  public async compact(): Promise<{ before: number; after: number } | null> {
    if (this.readOnly) {
      throw new Error('🛡️ [Persistence] COMPACT BLOCKED: cannot rewrite a read-only vault.');
    }
    if (this.inPulse) {
      // A pulse holds rows this rewrite would not see. Compacting mid-write is how you publish a
      // vault that is missing the very symbols the pulse was recording.
      throw new Error('🛡️ [Persistence] COMPACT BLOCKED: a pulse is in flight.');
    }

    const dbPath = path.join(path.resolve(this.vaultPath, '.conducks'), 'conducks-synapse.db');
    if (!fs.existsSync(dbPath)) return null;

    const before = fs.statSync(dbPath).size;
    const tmpPath = `${dbPath}.compact-${process.pid}`;
    fs.rmSync(tmpPath, { force: true });

    try {
      await this.ensureVaultOpen();

      // `COPY FROM DATABASE <src> TO <dst>` needs the SOURCE by name, and DuckDB names a
      // file-backed database after its file stem — not `memory`, which is the plausible guess and
      // fails with "Catalog memory does not exist". Read the name instead of assuming it: the stem
      // changes with the filename, and a temp-file rename would silently break a hardcoded one.
      const [{ database_name: source }] = await this.query<{ database_name: string }>(
        `SELECT database_name FROM duckdb_databases() WHERE path IS NOT NULL LIMIT 1`);

      // ATTACH + COPY FROM DATABASE reproduces schema and data together, so this does not have to
      // know which tables exist — a table added later is carried without touching this method.
      await this.run(`ATTACH '${tmpPath.replace(/'/g, "''")}' AS compacted`);
      await this.run(`COPY FROM DATABASE "${source}" TO compacted`);
      await this.run(`DETACH compacted`);

      // A rewrite is not always a win, and this is the case that surprises: on a young vault most
      // rows are still in the write-ahead log, so the .db file is tiny — 12 KB in the test that
      // caught this — while a properly materialised database has a floor around 1 MB. Compacting
      // there GROWS the file. Since this is meant to run after a pulse rather than as a chore,
      // that would quietly inflate every small project. Measure the result and keep the smaller
      // file; the rewrite is cheap enough (100 ms for 235 MB) to pay for the answer.
      const rewritten = fs.statSync(tmpPath).size;
      if (rewritten >= before) {
        fs.rmSync(tmpPath, { force: true });
        fs.rmSync(`${tmpPath}.wal`, { force: true });
        return null;
      }

      // Close BEFORE the swap: DuckDB flushes on close, and renaming a file the process still holds
      // open leaves the old inode alive and the reclaimed space unreclaimed.
      await this.close();
      fs.renameSync(tmpPath, dbPath);

      // The write-ahead log belongs to the database that was just replaced, and DuckDB replays
      // `<db>.wal` on the NEXT open by filename alone. Leaving it turns a successful compaction
      // into a vault that will not open: it replays CREATE TABLE nodes against a database that
      // already has one, and the open fails with "Table with name nodes already exists". Both logs
      // go — the old vault's, and any the rewrite produced under the temp name.
      fs.rmSync(`${dbPath}.wal`, { force: true });
      fs.rmSync(`${tmpPath}.wal`, { force: true });

      const after = fs.statSync(dbPath).size;
      logger.info(`🛡️ [Vault] Compacted ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
      return { before, after };
    } catch (err) {
      // Never leave a partial rewrite behind. The vault itself is untouched until the rename, so
      // failing here costs nothing but the temp file.
      fs.rmSync(tmpPath, { force: true });
      fs.rmSync(`${tmpPath}.wal`, { force: true });
      throw err;
    }
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
      // The timer MUST be cleared when the close wins the race. `Promise.race` settles on the first
      // promise, but a pending setTimeout keeps Node's event loop alive until it fires — so an
      // instant, successful close still held the process open for the full 5 seconds. Every command
      // that opened a vault paid it: `conducks query` printed its answer at 451ms and exited at 5.5s.
      let timer: NodeJS.Timeout;
      const timeout = new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DB close timed out after 5s')), 5000);
      });
      return Promise.race([closePromise, timeout]).finally(() => clearTimeout(timer));
    }
  }
}
import { isUniversalMemberCall, UNRESOLVED_CONFIDENCE } from "@/contracts/index.js";
import { createHash } from "node:crypto";
import { clusterOf } from "@/lib/core/graph/index.js";
import fs from "node:fs";
import path from "node:path";
import { chronicle } from "@/lib/core/git/index.js";
import { logger } from "@/lib/core/utils/index.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { traceMemory } from "@/lib/core/utils/index.js";
import type { ConducksComponent } from "@/contracts/index.js";

/**
 * Conducks — Synapse Persistence Engine (DuckDB v2) 🏺 🟦
 *
 * Manages the high-fidelity persistence of structural DNA and kinetic blast radius.
 * Implements the Oracle Standard for structural health monitoring.
 */



/**
 * The vault — every read and write of the analysed graph, and the only place DuckDB is spoken to
 * (CONDUCKS-5).
 *
 * ONE WRITER, MANY READERS, and that is the constraint most of this file exists to serve. A write
 * takes an exclusive lock, so a reader arriving mid-pulse is served the PREVIOUS pulse's snapshot
 * rather than blocked or given a half-written graph (ADR 0040). `servedFromSnapshot` is how a caller
 * can tell which it got.
 *
 * `save()` DOES NOT WRITE STRUCTURE. It writes metadata and the `pulses` row and commits. Nodes and
 * edges go through `saveNodes` and `saveEdges` — a caller expecting `save(graph)` to persist a graph
 * gets a successful call that stored nothing, which is precisely what the watcher did for as long as
 * it existed (todo67).
 */
export class SynapsePersistence {
  private static instance: SynapsePersistence;
  private db: DuckDBConnection | null = null;
  // The instance owns the FILE LOCK; the connection only borrows it. Closing the connection alone
  // leaves the vault locked, which breaks compact()'s close-then-rename and every reader after it —
  // so both are held here and both are closed in close().
  private instance: DuckDBInstance | null = null;
  private registry = new SynapseRegistry<ConducksComponent>();
  private lazy: boolean = true;
  private readOnly: boolean = false;
  // When true, individual write methods run INSIDE one big analyze transaction instead of
  // self-committing. An interrupted analyze then never commits → duckdb rolls the whole pulse
  // back on next open, so the previous good graph survives (no silent partial-graph corruption).
  private inPulse: boolean = false;
  // True when this connection is answering from the reader snapshot rather than the vault itself,
  // i.e. a pulse held the vault when we opened and we fell back to the PREVIOUS pulse. Read by
  // `servedFromSnapshot()` so `conducks_status` can say which pulse an answer came from — one
  // pulse stale is acceptable, one pulse stale and invisible is not (ADR 0040).
  private answeringFromSnapshot: boolean = false;
  // Set once this write session has published a reader snapshot, so `close()` knows to take it
  // away again. The 2x disk cost is meant to last for the write session, not forever.
  private publishedSnapshot: boolean = false;

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

  /** Does NOT open the vault — `ensureVaultOpen` does, on first use, so constructing one is free. */
  constructor(private vaultPath: string, readOnly = false) {
    this.readOnly = readOnly;
  }

  /** One instance per vault path, because two writers to one file is the case the lock exists for. */
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

  /**
   * Read-only is the DEFAULT for every command except `analyze` and `clean` (cli/index.ts).
   *
   * It is not advisory: `run()` throws on a mutational statement against a read-only handle, which
   * is what stops a read command taking the write lock and blocking every other reader.
   */
  public setReadOnly(val: boolean) {
    this.readOnly = val;
  }

  /** Whether a connection is open. False is normal — the vault opens lazily on first use. */
  public isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * The root this handle was built for.
   *
   * The bootstrapper used to decide "do I need a new handle?" from `chronicle.getProjectDir()`, which
   * describes where the REGISTRY is anchored — not what this object opens. The module-level
   * placeholder is `new SynapsePersistence(":memory:", true)`, so a handle pointing at `:memory:`
   * could sit under a chronicle already anchored to a real repo and look correct (todo52).
   */
  public get anchoredAt(): string {
    return this.vaultPath;
  }

  /** The vault file every process agrees on. Readers open this; a pulse writes it. */
  private dbFile(): string {
    return path.join(path.resolve(this.vaultPath, '.conducks'), 'conducks-synapse.db');
  }

  /**
   * The sibling a reader falls back to while a pulse holds the vault (ADR 0040).
   *
   * A fixed name, not a pid-suffixed one: a reader in ANOTHER process has to be able to find it
   * without knowing which process is pulsing.
   */
  private snapshotFile(): string {
    return `${this.dbFile()}.reader`;
  }

  /**
   * Whether DuckDB refused because another process holds the write lock — the ONE error that has a
   * good answer. A reader that hits it falls back to the previous pulse's snapshot; anything else is
   * a real failure and is not swallowed (ADR 0040).
   */
  private isLockError(err: unknown): boolean {
    return /Could not set lock|Conflicting lock/i.test(String((err as { message?: string })?.message ?? err));
  }

  /** Open one specific file into `this.db`. Split out so the snapshot fallback reuses it verbatim. */
  private async openAt(filePath: string): Promise<void> {
    const instance = await DuckDBInstance.create(filePath, {
      access_mode: this.readOnly ? 'READ_ONLY' : 'READ_WRITE',
    });
    this.instance = instance;
    try {
      this.db = await instance.connect();
      await this.initializeSchema();
    } catch (err) {
      // A failure AFTER the instance exists still holds the file lock, and the retry loop above only
      // clears `db` — so the snapshot fallback would then open against a vault this process itself
      // is still holding. Hand the lock back before letting the error out.
      this.db = null;
      this.instance = null;
      try { instance.closeSync(); } catch { /* already gone */ }
      throw err;
    }
  }

  /**
   * Opens the vault if it is not open, and decides what a reader gets when a writer holds it.
   *
   * Every public method funnels through here rather than opening its own connection, so the lock
   * fallback, the schema check and the read-only refusal are decided once instead of per call site.
   */
  private async ensureVaultOpen(): Promise<DuckDBConnection> {
    if (this.db) return this.db;

    const vaultDir = path.resolve(this.vaultPath, '.conducks');
    // A READ never creates. It used to mkdir unconditionally, so running any read command outside a
    // project left a `.conducks/` behind and then failed — and that leftover directory reads as a
    // project on the next run, which is how a wrong answer becomes durable (ADR 0116). Only a write
    // session, which is `analyze` and `clean`, may bring a vault into being.
    if (!fs.existsSync(vaultDir)) {
      if (this.readOnly) {
        throw new Error(
          `🛡️ [No Vault] ${this.vaultPath} has no \`.conducks/\` and no parent does either, ` +
          `so there is nothing to read. Run \`conducks analyze\` here to build one.`
        );
      }
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const dbPath = this.dbFile();
    if (this.readOnly && !fs.existsSync(dbPath) && !fs.existsSync(this.snapshotFile())) {
      throw new Error(
        `🛡️ [No Vault] ${vaultDir} exists but holds no synapse yet. ` +
        `Run \`conducks analyze\` to build one.`
      );
    }

    const maxAttempts = 3;
    const retryDelay = 500;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.openAt(dbPath);
        this.answeringFromSnapshot = false;
        // A write session publishes the previous pulse for readers to fall back to, so that from
        // here until close() a read arriving mid-pulse is answered instead of refused.
        if (!this.readOnly) await this.publishReaderSnapshot();
        return this.db!;
      } catch (err) {
        lastErr = err;
        this.db = null;

        // THE POINT OF ADR 0040. A reader that arrives while a pulse holds the vault gets the
        // PREVIOUS pulse's answer rather than an error. Only on a LOCK error: a corrupt vault or a
        // missing table is a real failure and must still surface, not be papered over with stale
        // data. Tried on every attempt because on the very first write session the snapshot may
        // still be being copied — the retry delay is what covers that window.
        if (this.readOnly && this.isLockError(err) && fs.existsSync(this.snapshotFile())) {
          try {
            await this.openAt(this.snapshotFile());
            this.answeringFromSnapshot = true;
            logger.debug(`🛡️ [Vault] Pulse in flight — answering from the previous pulse's snapshot.`);
            return this.db!;
          } catch (snapErr) {
            lastErr = snapErr;
            this.db = null;
          }
        }

        // Log ONCE, on the last attempt. Logging per attempt printed the same wall of DuckDB text
        // three times and buried the one line that matters.
        if (attempt === maxAttempts) {
          logger.error(this.explainOpenFailure(lastErr, dbPath));
          throw lastErr;
        }
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
    throw new Error('🛡️ [Vault Error] Failed to open database after all attempts');
  }

  /**
   * Copy the vault as it stands to the sibling readers fall back to, and swap it in atomically.
   *
   * This is `compact()`'s mechanism used for a different reason (ADR 0040 says so explicitly):
   * ATTACH a sibling, `COPY FROM DATABASE`, DETACH — which flushes it — then `rename` over the old
   * snapshot. A crash at any point leaves either the old snapshot or the new one, never a
   * half-written one, for the same reason compaction is safe.
   *
   * The WAL removal is not optional and not tidiness. DuckDB replays `<db>.wal` on the next open by
   * FILENAME, so the PREVIOUS snapshot's log left beside the file just renamed into its place is
   * replayed against a database that already has those tables, and the reader's open dies with
   * "Table with name nodes already exists" — the exact failure ADR 0037 pinned for compaction.
   *
   * Never fails the caller. Without a snapshot a reader is back to the old behaviour of erroring on
   * a locked vault, which is worse than it was but is not a reason to fail somebody's analyze.
   */
  private async publishReaderSnapshot(): Promise<void> {
    if (this.readOnly) return;
    // Only ever at the START of a write session. Mid-pulse the vault holds rows the pulse has not
    // committed, and the ATTACH would run inside somebody's open transaction — a snapshot taken
    // there could publish half a pulse, which is the one thing this must never do.
    if (this.inPulse) return;
    const snapPath = this.snapshotFile();
    const tmpPath = `${snapPath}.tmp-${process.pid}`;

    try {
      // A vault with nothing in it has no previous pulse to serve, and a snapshot of an empty
      // database would answer "0 symbols" — a wrong answer is worse than the lock error.
      const [counts] = await this.query<{ n: number }>(`SELECT count(*)::INT AS n FROM nodes`);
      if (!Number(counts?.n ?? 0)) return;

      fs.rmSync(tmpPath, { force: true });
      fs.rmSync(`${tmpPath}.wal`, { force: true });

      // Read the source database's name rather than assuming it — DuckDB names a file-backed
      // database after its file stem, and hardcoding it breaks the moment the filename changes
      // (the same trap compact() documents).
      const [{ database_name: source }] = await this.query<{ database_name: string }>(
        `SELECT database_name FROM duckdb_databases() WHERE path IS NOT NULL AND path <> '' LIMIT 1`);

      await this.run(`ATTACH '${tmpPath.replace(/'/g, "''")}' AS reader_snapshot`);
      await this.run(`COPY FROM DATABASE "${source}" TO reader_snapshot`);
      await this.run(`DETACH reader_snapshot`);

      fs.rmSync(`${tmpPath}.wal`, { force: true });
      fs.renameSync(tmpPath, snapPath);
      fs.rmSync(`${snapPath}.wal`, { force: true });
      this.publishedSnapshot = true;
    } catch (err) {
      fs.rmSync(tmpPath, { force: true });
      fs.rmSync(`${tmpPath}.wal`, { force: true });
      logger.warn(`🛡️ [Vault] Could not publish a reader snapshot; reads during this pulse may be refused`, err);
    }
  }

  /**
   * Which pulse this connection is answering from, and whether that is the live vault or the
   * snapshot of the pulse before it.
   *
   * `conducks_status` reports staleness against git already; this answers the second question the
   * same field has to carry now — "one pulse stale" is only acceptable while it is visible.
   */
  public servedFromSnapshot(): boolean {
    return this.answeringFromSnapshot;
  }

  /** The pulse the vault currently answers from, and whether it came from the live file or a snapshot. */
  public async currentPulse(): Promise<{ id: string; timestamp: number; commitHash: string | null; branch: string | null } | null> {
    const rows = await this.query<{ id: string; timestamp: number; commitHash: string | null; branch: string | null }>(
      `SELECT id, timestamp, commitHash, branch FROM pulses ORDER BY timestamp DESC LIMIT 1`);
    if (!rows.length) return null;
    return {
      id: rows[0].id,
      timestamp: Number(rows[0].timestamp),
      commitHash: rows[0].commitHash ?? null,
      branch: rows[0].branch ?? null,
    };
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

  /**
   * Creates the tables and adds any column this build knows that the file does not.
   *
   * ADDITIVE ONLY — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. An older vault opened by a newer
   * build gains the column and keeps its rows; a newer vault opened by an older build is missing
   * nothing it reads. Neither direction requires a re-analyze, which is why no migration exists.
   */
  private async initializeSchema(): Promise<void> {
    if (this.readOnly) return; // 🛡️ [Conducks Gating] Skip schema initialization in read-only mode.
    const run = async (sql: string) => { await this.db!.run(sql); };

    const nodesSql = `CREATE TABLE IF NOT EXISTS nodes (
      id VARCHAR PRIMARY KEY,
      pulseId VARCHAR,
      fingerprint VARCHAR,
      canonicalKind VARCHAR,
      canonicalRank INTEGER,
      semantic_kind VARCHAR,
      doc TEXT,
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
      http_url VARCHAR,
      -- A variable declared as new Y() records Y here (todo29#P3b). A real column for the same
      -- reason the five above are: IntraLinker reads it, and a value that lives only in the
      -- metadata blob is absent from every SHALLOW load, which is the load the analyze path uses.
      instance_of VARCHAR,
      -- A variable declared from a factory call records the CALL here (ADR 0082 follow-up); the type
      -- is the callee's declared return type, read by IntraLinker once the whole graph exists.
      instance_of_call VARCHAR,
      -- A function's DECLARED return type. Its own column rather than a read of the dna blob,
      -- because dna is not in the shallow SELECT and shallow is the load analyze uses — the same
      -- trap the route columns and instance_of each fell into.
      declared_return VARCHAR,
      -- Object-literal wiring: a JSON map of property PATH to the identifier it aliases (todo30).
      -- A real column for the reason the five above are: a shallow load never reads the metadata
      -- blob, and shallow is the load the analyze path uses.
      object_paths JSON,
      -- A function's parameter NAMES and declared types, so a receiver that is a parameter can be
      -- resolved (todo34). Its own column for the reason the others are: dna lives in the metadata
      -- blob, and the shallow load never reads the blob.
      param_types JSON,
      -- An interface's members and their declared types, so a chain through one can be walked
      -- (todo36). Its own column, like the four above: dna and metadata are absent from the shallow
      -- load, and shallow is the load analyze uses.
      member_types JSON
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

    // `branch` sits beside the commit this table already recorded (ADR 0035, todo20#P1).
    //
    // The commit alone cannot answer "is this graph describing the tree I am standing in?" — two
    // branches can share a commit, and a branch can move. NULL is a real value here and means a
    // detached HEAD or no repository, which is why the guard reading this must treat null as
    // "unknown, do not refuse" rather than as a mismatch.
    const pulsesSql = `CREATE TABLE IF NOT EXISTS pulses (
      id VARCHAR PRIMARY KEY,
      timestamp BIGINT,
      commitHash TEXT,
      branch TEXT,
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
                       'http_path VARCHAR', 'http_url VARCHAR', 'instance_of VARCHAR',
                       'instance_of_call VARCHAR', 'declared_return VARCHAR', 'object_paths JSON', 'param_types JSON', 'member_types JSON',
                       // The harvested doc comment (ADR 0133). Adding it to the CREATE alone would
                       // have broken EVERY existing vault on upgrade: `CREATE TABLE IF NOT EXISTS`
                       // never alters a table that already exists, so the first read naming the
                       // column failed with the schema-drift message ADR 0115 added. Measured on
                       // the CLI fixture before this line existed.
                       'doc TEXT']) {
      await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await run(edgesSql);
    await run(pulsesSql);
    // Existing vaults predate the column; adding it is what keeps an old vault readable.
    await run(`ALTER TABLE pulses ADD COLUMN IF NOT EXISTS branch TEXT;`);
    await run(`ALTER TABLE pulses ADD COLUMN IF NOT EXISTS scoped BOOLEAN;`);
    // The commit-layer schema was REMOVED (todo48#P4). It was additive, dormant and unread: no
    // pulse ever wrote a layer, no command could read one, and five tables plus their content-key
    // machinery were created in every vault to hold nothing. ADR 0035's branch guard — the half that
    // actually protects an answer — lives in `chronicle.branchRefusal` and is untouched.
    await run(metaSql);
    await run(fileHashSql);

    // Kinetic columns — safe to run on existing databases (DuckDB IF NOT EXISTS)
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS blame_age_days INTEGER;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS churn_count_90d INTEGER;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS entropy_score DOUBLE;`);
    await run(`ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_author TEXT;`);

    // INVARIANT: `nodes` must carry NO secondary index on a column the pulse writes.
    //
    // Not a style preference — measured. Adding `CREATE INDEX idx_nodes_gravity ON nodes(gravity)`,
    // on a column the multi-row `UPDATE ... FROM (VALUES)` writes, makes a cold pulse fail 2 runs
    // out of 2, deterministically, at the wave-2 node flush:
    //   Constraint Error: PRIMARY KEY or UNIQUE constraint violation: duplicate key "ecosystem::..."
    // — a duplicate on a key the statement never duplicates, the same signature as the `edges`
    // failure ADR 0064 records. Without it, 10+ clean runs.
    //
    // So `nodes` is safe because it has no such index, NOT because the multi-row UPDATE shape is
    // sound. `idx_nodes_id` below is redundant with the PRIMARY KEY and harmless; anything added
    // beside it is one well-meant index away from a deterministic pulse failure (todo22#P8).
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
  public async load(graph: any, options: { shallow?: boolean; layerId?: string } = {}): Promise<void> {
    const db = await this.ensureVaultOpen();

    // A COMMIT layer loads from layer storage; the uncommitted layer is `nodes`/`edges` (todo20#P3).
    //
    // This is why the ~30 read commands needed NO rewiring. They all obtain their graph through
    // `load()`, so teaching THIS ONE METHOD about layers makes every one of them layer-aware —
    // `impact`, `trace`, `flows`, `audit` and the rest answer from whichever layer was loaded,
    // without knowing layers exist. Rewiring each command to a row-reading API would have been
    // thirty edits to reach the same place, and would have handed each of them rows when what they
    // actually need is a graph.

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
      ? `SELECT id, canonicalKind, name, file, semantic_kind, doc, canonicalRank, gravity, complexity,
                risk, unitId, parentId, namespaceId, layer_path, depth,
                fingerprint, rootId, structureId, isEntryPoint, lineStart, lineEnd,
                is_route, is_request, http_method, http_path, http_url, instance_of, instance_of_call, declared_return, object_paths, param_types, member_types FROM nodes`
      : `SELECT id, canonicalKind, name, file, semantic_kind, doc, canonicalRank, gravity, complexity,
                risk, unitId, parentId, namespaceId, layer_path, depth, metadata,
                is_route, is_request, http_method, http_path, http_url, instance_of, instance_of_call, declared_return, object_paths, param_types, member_types FROM nodes`);
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
          doc: row.doc ?? undefined,
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
          url: row.http_url ?? undefined,
          instanceOf: row.instance_of ?? undefined,
          instanceOfCall: row.instance_of_call ?? undefined,
          declaredReturn: row.declared_return ?? undefined,
          objectPaths: row.object_paths ? (typeof row.object_paths === 'string' ? JSON.parse(row.object_paths) : row.object_paths) : undefined,
          paramTypes: row.param_types ? (typeof row.param_types === 'string' ? JSON.parse(row.param_types) : row.param_types) : undefined,
          memberTypes: row.member_types ? (typeof row.member_types === 'string' ? JSON.parse(row.member_types) : row.member_types) : undefined
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
      // `parentId` is COALESCED, not assigned — the same rule as `updateFromValues` and for the same
      // reason, which is why it has to be in BOTH: this is the path `saveNodes` takes, and patching
      // only the other helper left 384 orphans while looking like a fix.
      //
      // Containment is established by the SKELETON pass, which runs once and flushes before any
      // wave. A wave then re-writes the same node rows with no opinion about the parent, and the
      // graph is CLEARED between waves, so at that moment the row being updated is the only place
      // the value still exists. Assigning would erase it.
      const setters = columns.slice(1)
        .map(c => c === 'parentId' ? `${c} = COALESCE(v.${c}, ${table}.${c})` : `${c} = v.${c}`)
        .join(', ');
      const updateHead = `UPDATE ${table} SET ${setters} FROM (VALUES `;
      const updateTail = `) AS v(${columns.join(', ')}) WHERE ${table}.${idColumn} = v.${idColumn}`;
      for (let off = 0; off < updates.length; off += perBatch) {
        const slice = updates.slice(off, off + perBatch);
        await this.run(updateHead + Array(slice.length).fill(tuple).join(',') + updateTail, slice.flat());
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  /**
   * Writes node rows. One of the two methods that persist STRUCTURE — `save()` does not.
   *
   * The column list is a fixed whitelist: a property this does not name never reaches the vault,
   * whatever the graph holds. `metadata` is the carrier for anything outside it.
   */
  public async saveNodes(nodes: any[], pulseId: string): Promise<void> {
    if (this.readOnly) return;
    await this.ensureVaultOpen();
    const owned = !this.inPulse;
    const columns = ['id', 'pulseId', 'fingerprint', 'canonicalKind', 'canonicalRank', 'semantic_kind', 'doc', 'name', 'file', 'lineStart', 'lineEnd', 'parentId', 'rootId', 'namespaceId', 'unitId', 'structureId', 'layer_path', 'depth', 'risk', 'gravity', 'complexity', 'isEntryPoint', 'visibility', 'dna', 'signature', 'kinetic', 'metadata', 'is_route', 'is_request', 'http_method', 'http_path', 'http_url', 'instance_of', 'instance_of_call', 'declared_return', 'object_paths', 'param_types', 'member_types'];
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
          n.id.toLowerCase(), pulseId, m.fingerprint || null, canonicalKind, canonicalRank, semanticKind, m.doc || null, name, filePath.toLowerCase(), m.range?.start.line || 0, m.range?.end.line || 0,
          m.parentId?.toLowerCase() || null, m.rootId?.toLowerCase() || null, m.namespaceId?.toLowerCase() || null, m.unitId?.toLowerCase() || null, m.structureId?.toLowerCase() || null,
          m.layer_path || null, m.depth || 0, m.risk || 0, n.gravity || m.gravity || 0, n.complexity || m.complexity || 1,
          m.isEntryPoint || false, m.visibility || 'public', JSON.stringify(m.dna || {}), JSON.stringify(m.signature || {}), JSON.stringify(m.kinetic || {}),
          JSON.stringify({ ...m, id: n.id, name, range: m.range }),
          m.isRoute ?? null, m.isRequest ?? null, m.method ?? null, m.path ?? null, m.url ?? null, m.instanceOf ?? null, m.instanceOfCall ?? null, m.dna?.returns ?? null, m.objectPaths ? JSON.stringify(m.objectPaths) : null,
          (() => { const ps = (m.dna?.params ?? []).filter((x: any) => x?.type); return ps.length ? JSON.stringify(Object.fromEntries(ps.map((x: any) => [String(x.name).toLowerCase(), String(x.type).toLowerCase()]))) : null; })(),
          m.memberTypes ? JSON.stringify(m.memberTypes) : null
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
  /**
   * Writes edge rows. Reads `.properties` and `.confidence` — NOT `.metadata`/`.weight`, which is
   * what an earlier version did, silently dropping every edge's properties and line number.
   */
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

  /**
   * Removes a unit's rows and the edges it OWNS — matched on `unitId` OR `id`, because a unit's own
   * row carries `unitId = NULL` and matching one alone left every unit row behind, which produced
   * unbounded churn against a store that never reclaims deleted versions (ADR 0037).
   *
   * Its file hash goes too, deliberately: leaving one behind makes the file look analysed to the
   * gate and it is skipped forever, with no nodes at all (ADR 0030).
   */
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
  public async save(graph: any, options: { nodeCount?: number, edgeCount?: number, scoped?: boolean } = {}): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    const pulseId = graph.getMetadata('targetPulseId') || `pulse_${Date.now()}`;
    const headHash = chronicle.getHeadHash() || 'unknown';
    const branch = chronicle.getCurrentBranch();   // null on a detached HEAD — a real state, not a failure

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
      // `scoped` decides whether this pulse may serve as the "everything is analyzed up to here"
      // mark. A subfolder pulse is a real pulse and gets a real row — it just cannot answer that
      // question for the files it never looked at (see the incremental gate in domain/analysis).
      await this.run(`INSERT OR REPLACE INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata, scoped) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        // `stats` is a GETTER on ConducksAdjacencyList — there is no nodeCount()/edgeCount() method,
        // and calling one threw for every caller that omitted the counts. That was the watcher: both
        // its auto-pulse and its writer save() call sites pass no options, so every incremental save
        // died with "graph.nodeCount is not a function", got logged by the watcher's catch, and the
        // delta was never written to the vault. The two callers that pass counts explicitly never hit
        // this line, which is why it survived.
        pulseId, Date.now(), headHash, branch, options.nodeCount ?? graph.stats?.nodeCount ?? 0, options.edgeCount ?? graph.stats?.edgeCount ?? 0, JSON.stringify(Object.fromEntries(metadata)), options.scoped === true
      ]);
      await this.run(`COMMIT`);   // publishes the pulse (owned tx, or the big inPulse tx)
      this.inPulse = false;
    } catch (err) {
      // On failure leave inPulse as-is so the caller's abortPulse() rolls the whole pulse back.
      if (owned) { try { await this.run('ROLLBACK'); } catch {} }
      throw err;
    }
  }

  /** One mutational statement. THROWS on a read-only handle — the refusal is the point, not a check. */
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.run(sql, params as any[]);
  }

  /** One read. Available on a read-only handle, which is every command except `analyze` and `clean`. */
  public async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.ensureVaultOpen();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = await db.runAndReadAll(sql, params as any[]);
      // `getRowObjectsJS`, not `getRowObjects`: the latter hands back DuckDB value wrappers
      // (`DuckDBTimestampValue` and friends) where the callback driver handed back JS natives.
      // MEASURED against the old driver on this repo's own vault — same columns, same types
      // (BIGINT stays a BigInt in both), same values.
      return reader.getRowObjectsJS() as unknown as T[];
    } catch (err) {
      throw SynapsePersistence.explainQueryFailure(err);
    }
  }

  /**
   * Turn a driver error into something a reader can act on.
   *
   * There is no schema version in the vault, so a database written by an older conducks fails on the
   * first SELECT naming a column that did not exist then. What reached the user was the raw DuckDB
   * object — `Binder Error: Referenced column "is_route" not found in FROM clause!` plus a caret
   * diagram — which says nothing about the cause and nothing about the remedy. Measured on a stale
   * vault via `conducks resonance` (ADR 0115).
   *
   * A missing COLUMN is the signature of schema drift specifically: the table exists, the query is
   * valid against the current schema, and the file predates it. Nothing else is reinterpreted —
   * every other driver error passes through untouched, because guessing at causes is how a wrong
   * diagnosis gets printed with confidence.
   */
  private static explainQueryFailure(err: unknown): Error {
    const message = String((err as { message?: string })?.message ?? err);
    const missingColumn = /Referenced column "([^"]+)" not found/i.exec(message);
    if (missingColumn) {
      return new Error(
        `This vault predates the current conducks schema — it has no "${missingColumn[1]}" column. ` +
        `Rebuild it with \`conducks analyze\` (or \`conducks clean\` first for a full rebuild).\n` +
        `  original: ${message.split('\n')[0]}`
      );
    }
    return err as unknown as Error;
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

  /** Records that a file was analysed at this content. The gate skips a file whose hash is unchanged. */
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

  /** Writes PageRank back after the ranker runs — computed in memory, persisted once (CONDUCKS-6). */
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
      // Runs against the connection DIRECTLY rather than through `run()`, because these statements
      // are the transaction itself — routing them through the read-only guard would refuse the
      // COMMIT that publishes a legitimate write.
      const exec = async (sql: string) => { await db.run(sql); };
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

  /** Recomputes the risk column from what is already stored, in SQL rather than row by row (CONDUCKS-7). */
  public async updateRisks(): Promise<void> {
    if (this.readOnly) return;
    await this.run(`UPDATE nodes SET risk = LEAST(COALESCE(complexity, 1) / 50.0, 1.0) WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE', 'ATOM')`);
  }

  /** Rebinds edges the intra-linker resolved, so a later session need not re-derive them. */
  public async updateEdgeTargets(rebinds: Array<{ id: string, newTargetId: string }>): Promise<void> {
    if (this.readOnly) return;
    const db = await this.ensureVaultOpen();
    try {
      // Runs against the connection DIRECTLY rather than through `run()`, because these statements
      // are the transaction itself — routing them through the read-only guard would refuse the
      // COMMIT that publishes a legitimate write.
      const exec = async (sql: string) => { await db.run(sql); };
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
      const stmt = await db.prepare(`UPDATE edges SET targetId = ?, confidence = CASE WHEN confidence < 0.6 THEN 0.85 ELSE confidence END WHERE id = ?`);
      try {
        for (const entry of rebinds) {
          stmt.bind([entry.newTargetId.toLowerCase(), entry.id]);
          await stmt.run();
        }
      } finally {
        stmt.destroySync();
      }
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
  public async sweepUnresolvedGuesses(minConfidence: number = 0.6): Promise<{ deleted: number; kept: number; downgraded: number }> {
    if (this.readOnly) return { deleted: 0, kept: 0, downgraded: 0 };
    await this.ensureVaultOpen();

    // Decide by CAUSE, not by confidence (ADR 0096, todo35).
    //
    // The old rule deleted every dangling edge below 0.6 and reported the survivors as "the dangling
    // rate" — 1.15% against an honest 14.62% on this repository, because 2,734 rows had been removed
    // first. Its defence was that low confidence means "a call on a local value", but low confidence
    // means "the call processor did not resolve this". A real method that failed to resolve —
    // `graph.getAllNodes`, node present, three call sites — was deleted alongside `arr.map`.
    //
    // Now only a UNIVERSAL MEMBER goes: `.map`, `.trim`, `.then` — names every JavaScript value has
    // and no project declares. Everything else stays as a visible dangler, because an unresolved
    // reference is a fact about this tool, and deleting it is how the fact was hidden.
    // EVERY dangling edge, not only the ones already marked unresolved.
    //
    // This used to read `AND e.confidence < 0.6`, which made the sweep blind to exactly the edges
    // that lie hardest. `CallProcessor` stamps 0.85 whenever it resolved the RECEIVER's file, even
    // though that says nothing about whether the file declares the member: `cache.get('k')` where
    // `makeCache()` has no declared return type produced `cache.ts::cache.get` at 0.85 — an id no
    // node has, presented as a confident resolution (oracle T02, ADR 0104).
    //
    // So the same cause rules now see the whole dangling population, and the survivors are
    // re-stamped below. `minConfidence` is kept as the parameter name and is no longer a filter —
    // it is the value an unresolved edge is downgraded TO.
    const dangling = await this.query<{ id: string; targetId: string; ty: string; params: string | null; conf: number }>(
      `SELECT e.id, e.targetId, e.type AS ty, sn.param_types AS params, e.confidence AS conf
       FROM edges e
       LEFT JOIN nodes n  ON e.targetId = n.id
       LEFT JOIN nodes sn ON sn.id = e.sourceId
       WHERE n.id IS NULL`);

    const removable = dangling.filter(e => {
      const symbol = String(e.targetId).split('::').pop() ?? '';
      if (isUniversalMemberCall(symbol)) return true;

      // NOT REFERENCES AT ALL — three shapes that should never have produced an edge, removed here
      // rather than left to look like resolution failures (ADR 0098).

      // A call to a PARAMETER of the enclosing function: `new Promise((resolve) => resolve(x))`.
      // `resolve` is that function's own argument, so it names nothing outside it.
      if (!symbol.includes('.') && e.params) {
        try {
          if (Object.prototype.hasOwnProperty.call(JSON.parse(e.params), symbol.toLowerCase())) return true;
        } catch { /* a malformed map is not a licence to delete */ }
      }

      // A GENERIC TYPE PARAMETER: `<T>` is declared by the signature it appears in. A reference to
      // one points at the declaration itself, and there is no cross-file symbol to find.
      if (e.ty === 'TYPE_REFERENCE' && /^[A-Za-z]$|^[A-Za-z][0-9]$|^(T|K|V|U|R|E|P|S)[A-Za-z]*$/.test(symbol)
          && symbol.length <= 2) return true;

      return false;
    }).map(e => e.id);

    for (let i = 0; i < removable.length; i += 500) {
      const chunk = removable.slice(i, i + 500);
      await this.run(
        `DELETE FROM edges WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    }

    // An edge whose target does not exist DID NOT RESOLVE, whatever the processor believed when it
    // stamped the row. Resolution is only knowable after linking, and this runs after linking.
    //
    // Leaving 0.85 on a dangler is the same failure the confidence column was split to prevent
    // (ADR 0085): `WHERE confidence < 0.6` returned zero rows on a graph where half the edges
    // dangled. It came back in a narrower form — a dotted target whose RECEIVER resolved to a file
    // kept the confident score even when the member was never found there.
    const gone = new Set(removable);
    const survivors = dangling.filter(e => !gone.has(e.id) && e.conf >= minConfidence).map(e => e.id);
    for (let i = 0; i < survivors.length; i += 500) {
      const chunk = survivors.slice(i, i + 500);
      await this.run(
        `UPDATE edges SET confidence = ? WHERE id IN (${chunk.map(() => '?').join(',')})`,
        [UNRESOLVED_CONFIDENCE, ...chunk]);
    }

    return { deleted: removable.length, kept: dangling.length - removable.length, downgraded: survivors.length };
  }

  /**
   * Plain multi-row INSERT, chunked to the bound-parameter ceiling.
   *
   * Deliberately not `insertBatched`: that one carries an update/insert split for a DuckDB bug on
   * re-writing an existing key, and the layer tables never re-write one. Simpler here is also safer
   * — the bug cannot be hit by a path that only ever inserts new keys.
   */
  private async insertRows(table: string, columns: string[], rows: unknown[][]): Promise<void> {
    if (rows.length === 0) return;
    const perRow = columns.length;
    const chunk = Math.max(1, Math.floor(SynapsePersistence.MAX_BOUND_PARAMS / perRow));
    const cols = columns.map(c => `"${c}"`).join(', ');
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk);
      const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      await this.run(`INSERT INTO ${table} (${cols}) VALUES ${placeholders}`, batch.flat());
    }
  }




  /**
   * What the vault HOLDS — the same rows `status` counts.
   *
   * Must be asked AFTER `sweepRowsNotInPulse`, which is what makes it different from any number the
   * pulse can compute on its way through: the sweep deletes rows left by earlier pulses, so a count
   * taken before it is high by exactly those (ADR 0117).
   *
   * DuckDB returns `count(*)` as a BigInt — it formats as `19n` and breaks arithmetic against a
   * number — so both are coerced here rather than at each call site.
   */
  public async countGraph(): Promise<{ nodes: number; edges: number }> {
    await this.ensureVaultOpen();
    const [row] = await this.query<{ n: number | bigint; e: number | bigint }>(
      `SELECT (SELECT count(*) FROM nodes) AS n, (SELECT count(*) FROM edges) AS e`);
    return { nodes: Number(row?.n ?? 0), edges: Number(row?.e ?? 0) };
  }

  /**
   * Deletes rows no longer claimed by the current pulse — how a deleted file leaves the graph.
   *
   * Keyed on the pulse rather than on the filesystem: a file that failed to parse is absent from the
   * pulse but present on disk, and treating absence-from-disk as the rule would delete it.
   */
  public async sweepRowsNotInPulse(pulseId: string, scope?: string): Promise<{ nodes: number; edges: number }> {
    if (this.readOnly) return { nodes: 0, edges: 0 };
    await this.ensureVaultOpen();

    // `scope` bounds the sweep to one subtree, and a SCOPED analyze must always pass it (ADR 0069).
    //
    // Without it this deletes every row not written by the current pulse — correct for a whole
    // project, catastrophic for one service of a workspace. Measured on subject-b the moment its
    // five services began sharing one vault: analyzing `app` wrote 3,022 app nodes and deleted all
    // 29 of `database`'s, because they carried an earlier pulseId. The vault ended up describing
    // whichever service was analyzed last, which is a worse failure than the split vaults this
    // change set out to fix, and it is silent.
    //
    // Nodes are matched on `file`; edges on either endpoint's file, so an edge is swept only when
    // the node it belongs to is in scope.
    const inScopeNode = scope ? ` AND lower(file) LIKE ?` : '';
    const scopeArg = scope ? [`${scope.toLowerCase()}%`] : [];
    const inScopeEdge = scope
      ? ` AND (sourceId IN (SELECT id FROM nodes WHERE lower(file) LIKE ?)
              OR targetId IN (SELECT id FROM nodes WHERE lower(file) LIKE ?))`
      : '';
    const scopeArgEdge = scope ? [`${scope.toLowerCase()}%`, `${scope.toLowerCase()}%`] : [];

    const [before] = await this.query<{ n: number; e: number }>(
      `SELECT (SELECT count(*) FROM nodes WHERE pulseId <> ?${inScopeNode})::INT AS n,
              (SELECT count(*) FROM edges WHERE pulseId <> ?${inScopeEdge})::INT AS e`,
      [pulseId, ...scopeArg, pulseId, ...scopeArgEdge]);

    // Edges first: an edge outliving its endpoints is the dangling state this project spent a day
    // measuring, so the order is not incidental.
    await this.run(`DELETE FROM edges WHERE pulseId <> ?${inScopeEdge}`, [pulseId, ...scopeArgEdge]);
    await this.run(`DELETE FROM nodes WHERE pulseId <> ?${inScopeNode}`, [pulseId, ...scopeArg]);

    return { nodes: Number(before?.n ?? 0), edges: Number(before?.e ?? 0) };
  }

  /**
   * The default cap on a visual wave (ADR 0079). Named rather than inline because it is a DEFAULT
   * now, not a constant: `?limit=` and `mirror --wave-cap` override it, and a number that can be
   * overridden should say so where it is declared.
   *
   * The value is not claimed to be the RIGHT number — only that truncation keeps the heaviest slice
   * (`ORDER BY gravity DESC`) and reports itself. Measured on a five-service monorepo: 2,321 of
   * 6,002 nodes eligible, so the default hides about a third there.
   */
  private static readonly DEFAULT_WAVE_CAP = 1500;

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
    limit: number = SynapsePersistence.DEFAULT_WAVE_CAP
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

    // Clustering follows ADR 0028's rule, which now lives in ONE place — `cluster-rule.ts` — and is
    // shared with `mirror.engine.detectCluster()`. It was ported here rather than replaced when
    // ADR 0054 moved this work off the materialised graph, and the second copy was accepted as debt
    // at the time (todo25#P9). ADR 0079 closes it: the rule was never the problem, so it is kept and
    // the duplicate removed. Grouping by the IMMEDIATE parent is a different rule with a different
    // answer — 404 clusters here against the 128 containers a reader actually recognises.
    //
    // The parent chain needs the whole tree, but only three columns of it: id, parentId and kind.
    // That is a projection, not the graph, which is the distinction ADR 0042 draws.
    const parents = await this.query<{ id: string; parentId: string | null; canonicalKind: string }>(
      `SELECT id, parentId, canonicalKind FROM nodes`);
    const byId = new Map(parents.map(n => [n.id, n]));

    const clusterById = new Map<string, string>();
    const clusterCounts = new Map<string, number>();
    for (const r of rows) {
      const c = clusterOf(r.id, id => byId.get(id));
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

  /**
   * Returns what it removed, counted per semantic kind — because this method deletes SILENTLY, and a
   * silent delete downstream of a classification is how every React component vanished (ADR 0136):
   * arrow functions were filed as ATOM, an exported component has no reference inside its own file,
   * and this method removed them all. Nothing reported it; the graph was simply thin. The counts make
   * the next swallowed symbol class visible in the analyze log instead of needing a hand-built
   * reproduction to find.
   */
  public async pruneTaxonomy(): Promise<Record<string, number>> {
    if (this.readOnly) return {};
    await this.ensureVaultOpen();
    const STRUCTURAL = `('MEMBER_OF','CONTAINS','HAS_METHOD','HAS_PROPERTY')`;

    // 1. Freeze the drop set BEFORE mutating edges — the ATOM edge test reads the current edge set.
    //
    // An EXPORTED value is spared even with no reference edge (todo63#P2). Its use is invisible to
    // the graph — a bare read produces no edge — so the edge gate cannot tell an exported constant
    // nobody imports from one used everywhere, and it was deleting both. `prune` then had nothing to
    // report and an exported-but-dead value could never be found.
    //
    // This is the one exception to the gate and it is bounded, which is why it is safe: MEASURED by
    // counting `export const` VALUE declarations never named in any import, it is 21 nodes on
    // conducks (0.32% of 6,469) and 49 on subject-c. The ATOM flood the gate exists to stop was ~5,000
    // -> ~1,400, a 72% cut, so this is three orders of magnitude away from re-creating it. A
    // non-exported local with no edges is still cut, which is the bulk of them.
    await this.run(`CREATE OR REPLACE TEMP TABLE _pruned AS
      SELECT id, parentId FROM nodes n
      WHERE n.canonicalKind = 'DATA'
         OR (n.canonicalKind = 'ATOM'
             AND COALESCE(n.dna->>'$.isExported', 'false') <> 'true'
             AND NOT EXISTS (
               SELECT 1 FROM edges e
               WHERE (e.sourceId = n.id OR e.targetId = n.id)
                 AND e.type NOT IN ${STRUCTURAL}))`);

    // Counted by the node's SEMANTIC kind, not its canonical one: the canonical kinds here are DATA
    // and ATOM by construction, and "dropped 233 variable" vs "dropped 233 function" is exactly the
    // distinction that would have named the component bug on first sight.
    const droppedRows = await this.query(
      `SELECT coalesce(n.semantic_kind, n.canonicalKind) AS kind, COUNT(*) AS c
         FROM nodes n JOIN _pruned p ON n.id = p.id GROUP BY 1`) as Array<{ kind: string; c: unknown }>;

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

    const dropped: Record<string, number> = {};
    for (const row of droppedRows) dropped[String(row.kind)] = Number(row.c);
    return dropped;
  }

  /** Empties the vault. The write half of `conducks clean`; refuses on a read-only handle. */
  public async clear(): Promise<void> {
    if (this.readOnly) return;
    await this.run('DELETE FROM nodes');
    await this.run('DELETE FROM edges');
    await this.run('DELETE FROM pulses');
  }

  /** One node with its heavy columns — the ones the graph load deliberately leaves behind. */
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

  /**
   * The DuckDB connection itself, for the two callers that genuinely need it. Exported through the
   * door so every such caller is visible in one place rather than wherever an import can be written
   * (CONDUCKS-5).
   */
  public async getRawConnection(): Promise<DuckDBConnection> {
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
    // `parentId` is COALESCED rather than assigned. Containment is established by the SKELETON pass,
    // which runs once and flushes before any wave; a wave then re-writes the same node rows and had
    // no opinion about the parent, so a plain assignment erased it. The graph is cleared between
    // waves (ADR 0041), so the writer cannot recover the value from memory either — the only place
    // it still exists at that moment is the row being updated.
    //
    // Narrowed to this one column deliberately: "an update should never erase what it does not know"
    // is a tempting general rule and a wrong one, because it would also make a genuine clear
    // impossible. Containment is the case where the writer is known to be uninformed.
    const setters = columns
      .map(c => c === 'parentId' ? `${c} = COALESCE(v.${c}, ${table}.${c})` : `${c} = v.${c}`)
      .join(', ');
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

  /** Writes the kinetic columns in one statement, rather than a round trip per node. */
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

  /** Copies the vault beside itself, so a reader arriving mid-write has a consistent file (ADR 0040). */
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

  /**
   * Rewrites the file to reclaim space. DuckDB never reclaims deleted row versions in place
   * (ADR 0037), so a long-lived vault grows regardless of how much it holds — measured at 8.7 MB of
   * rows inside 235 MB.
   */
  public async compact(): Promise<{ before: number; after: number } | null> {
    if (this.readOnly) {
      throw new Error('🛡️ [Persistence] COMPACT BLOCKED: cannot rewrite a read-only vault.');
    }
    if (this.inPulse) {
      // A pulse holds rows this rewrite would not see. Compacting mid-write is how you publish a
      // vault that is missing the very symbols the pulse was recording.
      throw new Error('🛡️ [Persistence] COMPACT BLOCKED: a pulse is in flight.');
    }

    const dbPath = this.dbFile();
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

  /** Releases the connection and the lock. A held lock is what makes every other reader wait. */
  public async close(): Promise<void> {
    // The snapshot exists so that readers survive THIS write session. Once the session is over the
    // vault is unlocked again and readers go straight to it, so keeping the copy would make ADR
    // 0040's "2x on disk for the duration of a pulse" into 2x on disk forever. Unlinking it does
    // not disturb a reader that already has it open — on POSIX that reader finishes against the
    // old inode, the same property the atomic rename relies on.
    if (!this.readOnly && this.publishedSnapshot) {
      this.publishedSnapshot = false;
      fs.rmSync(this.snapshotFile(), { force: true });
      fs.rmSync(`${this.snapshotFile()}.wal`, { force: true });
    }
    // Connection first, then the instance that owns the file lock. Closing only the connection
    // leaves the vault locked, and compact() renames over a file it still holds.
    //
    // No 5s timeout race any more: the old driver's close took a callback that could never fire, and
    // the timer guarding it kept the event loop alive for the full 5s on every command that opened a
    // vault (`conducks query` answered at 451ms and exited at 5.5s). `closeSync` cannot hang, so both
    // the race and the bug it introduced are gone.
    if (this.db) {
      this.db.closeSync();
      this.db = null;
    }
    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
  }
}
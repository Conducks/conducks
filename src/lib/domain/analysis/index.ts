import { AnalyzeOrchestrator } from "./orchestrator.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { essenceLens } from "@/lib/core/parsing/essence-lens.js";
import { buildBoard, enforcedByPaths } from "@/lib/domain/analysis/docs-board.js";
import { Logger } from "@/lib/core/utils/logger.js";
import path from "node:path";
import fsSync from "node:fs";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { traceMemory } from "@/lib/core/utils/mem-trace.js";
import fs from "node:fs/promises";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { IntraLinker } from "@/lib/core/graph/linker-intra.js";
import { externalNodeProps, libraryNamespaceId } from "@/lib/core/graph/external-nodes.js";
import { HttpServiceLinker } from "@/lib/core/graph/http-service-linker.js";
import { CanonicalKind, CanonicalRank } from "@/lib/core/parsing/taxonomy.js";

import { QueryService } from "./query-service.js";

const logger = new Logger("AnalysisDomain");

/**
 * Conducks — Analysis Domain Service
 * 
 * High-level product logic for structural analysis, discovery, 
 * and neural context regeneration.
 */
export class AnalysisService {
  public readonly query: QueryService;

  constructor(
    private orchestrator: AnalyzeOrchestrator,
    private graph: ConducksGraph,
    private persistence: SynapsePersistence
  ) {
    this.query = new QueryService(this.persistence);
  }

  /**
   * Conducks Re-Anchoring 🏺
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
    this.query.setPersistence(persistence);
    (this.orchestrator as any).persistence = persistence;
    (this.graph as any).persistence = persistence;
  }

  /**
   * Performs a high-fidelity structural analysis on the project (or a scoped subdirectory).
   * Consolidates discovery, batch reflection, gravity resonance, and persistence.
   */
  public async analyze(options: { root?: string, staged?: boolean, verbose?: boolean, force?: boolean } = {}): Promise<{ success: boolean, files: number }> {
    const projectRoot = chronicle.getProjectDir();
    const targetRoot = options.root ? path.resolve(options.root) : projectRoot;

    // Safeguard against indexing the root of the filesystem
    if (targetRoot === '/' || targetRoot === '\\') {
      logger.warn(`Analysis root resolved to system root (/). Re-resolving to process.cwd()`);
      return this.analyze({ ...options, root: process.cwd() });
    }

    logger.info(`Analyzing Project Structure: ${projectRoot}`);
    if (targetRoot !== projectRoot) {
      logger.info(`🛡️ [Scoped Analysis] Targeted Pulse: ${targetRoot}`);
    }

    // 1. Digital Reflection via Chronicle Interface (Discovery)
    traceMemory('analyze entry');
    const voyager = chronicle;
    let files = await voyager.discoverFiles(options.staged);
    traceMemory(`after discoverFiles (${files.length} paths)`);

    // [Conducks State-Sync] Change Detection & Incremental Targeting 🏺
    // We filter the discovery set to only include "Dirty Units" (changed since last synapse)
    const lastPulse = await this.persistence.query("SELECT timestamp FROM pulses ORDER BY timestamp DESC LIMIT 1");
    const lastSyncTime = lastPulse.length > 0 ? Number(lastPulse[0].timestamp) : 0;
    const ignoreManager = (this.orchestrator as any).ignoreManager;
    
    let filteredFiles = files;
    if (ignoreManager) {
        filteredFiles = files.filter(f => !ignoreManager.isIgnored(f));
        
        if (filteredFiles.length < files.length) {
            logger.info(`🛡️ [Conducks] Structural Ignore: Excluding ${files.length - filteredFiles.length} units from the structural wave.`);
        }
    }

    traceMemory(`after ignore filter (${filteredFiles.length} kept)`);
    let dirtyFiles = filteredFiles;
    if (!options.staged && lastSyncTime > 0) {
      const statsPromises = filteredFiles.map(async f => {
        try {
          const s = await fs.stat(f);
          return s.mtimeMs > lastSyncTime ? f : null;
        } catch { return null; }
      });
      dirtyFiles = (await Promise.all(statsPromises)).filter(f => f !== null) as string[];

      // A file the vault has NEVER SEEN is dirty however old it is (ADR 0069).
      //
      // mtime-vs-last-pulse alone assumes the vault already covers everything discovery returns.
      // That held while each project had its own vault and its own pulse timeline. It stops holding
      // the moment one workspace vault is shared across services: analyzing `database` stamps a
      // pulse at NOW, and `app`'s files — untouched since May, never analyzed into this vault — are
      // then all older than it and read as clean. Measured on mentorseed: the app scope reported
      // "already at 100% resonance" against a vault holding 40 nodes, none of them app's.
      //
      // `file_hashes` is the honest record of what was actually analyzed, and the pulse already
      // seeds it. Absence from it means never seen, which is exactly what mtime cannot express.
      const seen = new Set([...(await this.persistence.getAllFileHashes()).keys()].map(f => f.toLowerCase()));
      if (seen.size > 0) {
        const unseen = filteredFiles.filter(f => !seen.has(f.toLowerCase()));
        if (unseen.length > 0) {
          const already = new Set(dirtyFiles);
          dirtyFiles = [...dirtyFiles, ...unseen.filter(f => !already.has(f))];
          logger.info(`🛡️ [Conducks] ${unseen.length} unit(s) the vault has never seen — analyzing regardless of mtime.`);
        }
      }

      if (dirtyFiles.length > 0) {
          logger.info(`🛡️ [Sovereiorn Discovery] Found ${dirtyFiles.length} dirty units since last pulse.`);
          dirtyFiles.slice(0, 5).forEach(f => logger.info(`  - ${path.basename(f)}`));
          if (dirtyFiles.length > 5) logger.info(`  ... and ${dirtyFiles.length - 5} more.`);
      }
    }

    // Conducks Filter: Scoped Discovery 🏺
    if (targetRoot !== projectRoot) {
      dirtyFiles = dirtyFiles.filter(f => f.startsWith(targetRoot));
    }

    // Reconcile BEFORE the no-changes gate: units the vault holds that discovery no longer returns.
    //
    // The per-unit purge later only covers files being RE-analyzed. A file that was deleted,
    // gitignored, or dropped from the discovery surface is in neither list — and deleting a file makes
    // no OTHER file dirty, so the gate below returned "already at 100% resonance" and the dead symbols
    // survived every subsequent pulse. The graph kept answering with symbols from files that are gone.
    // Measured on mentorseed: 53 image units persisted through a full `analyze --force`, and only a
    // `clean` cleared them.
    //
    // Skipped for `--staged`, where discovery returns ONLY the staged files: reconciling against that
    // subset would purge the entire rest of the project.
    if (!options.staged) {
      const discovered = new Set(filteredFiles.map(f => f.toLowerCase()));
      const known = await this.persistence.query<{ file: string }>(
        "SELECT DISTINCT file FROM nodes WHERE canonicalKind = 'UNIT' AND file IS NOT NULL"
      );
      // Scoped runs stay in scope — a subfolder analyze must not delete the rest of the vault.
      const scope = targetRoot.toLowerCase();
      const vanished = known
        .map(r => r.file)
        .filter(f => f && f.startsWith(scope) && !discovered.has(f));

      if (vanished.length > 0) {
        logger.info(`🛡️ [Persistence] Reconciling: purging ${vanished.length} unit(s) no longer discoverable.`);
        await this.persistence.purgeUnits(vanished.map(f => `${f}::unit`));
      }
    }

    traceMemory('after vault reconcile');
    if (dirtyFiles.length === 0 && !options.force) {
      logger.warn("No changes detected. Structural Synapse is already at 100% resonance.");
      return { success: true, files: 0 };
    }

    if (options.force) {
      logger.info(`🛡️ [Force Resonance] Forcing re-induction of all ${filteredFiles.length} units.`);
      dirtyFiles = filteredFiles;
    }

    // Did this pulse re-stamp EVERY discoverable unit in scope, or only the changed ones?
    //
    // `sweepRowsNotInPulse` deletes every row whose `pulseId` is not this one, which is only correct
    // when this one covers everything. On an INCREMENTAL run it covers the dirty files alone, so a
    // one-file edit deleted the entire rest of the graph: 5,221 nodes -> 217 on this repository,
    // reproduced identically on the previous commit, so it is not new. `analyze` was correct exactly
    // once per vault, and the second run — the ordinary daily one — destroyed it.
    //
    // The hazard was already known for the WATCHER ("the watcher's incremental path must never call
    // this; it writes a handful of files and would delete the rest of the graph", below), and the
    // CLI's own incremental path called it anyway.
    //
    // Nothing is lost by skipping it, which is the part that makes this safe rather than a trade:
    // a DELETED file is purged by the vault-reconcile block above, and a CHANGED file by
    // `purgeUnits` below. The sweep's only remaining job is catching rows those two miss, and that
    // can only be judged against a complete pass (ADR 0101).
    const isFullPass = dirtyFiles.length >= filteredFiles.filter(f => f.startsWith(targetRoot)).length;

    logger.info(`Analyzing ${dirtyFiles.length} units...`);

    // [Conducks Incremental Hardening] 🏺
    // Clear the in-memory graph before analysis to ensure only the DELTA is flushed.
    // The bootstrapper pre-loads the full graph, which would cause a redundant full-flush.
    this.graph.getGraph().clear();

    traceMemory(`after file discovery, before reading ${dirtyFiles.length} files`);

    // 2. Reflecting structural stream
    const allUnits = [];
    for await (const batch of voyager.streamBatches(dirtyFiles, 500, options.staged)) {
      allUnits.push(...batch);
    }
    traceMemory('after reading files into memory');

    // [Conducks Atomic Pulse] purge + flush + rank + save are ONE transaction. An interrupted
    // analyze never reaches the final COMMIT, so duckdb rolls the whole pulse back on next open —
    // the previous good graph survives instead of being left half-written (nodes but no edges).
    await this.persistence.beginPulse();
    try {

    // 2.2 Conducks Purge: Remove old structural DNA for these units
    logger.info(`🛡️ [Persistence] Purging structural DNA for ${dirtyFiles.length} units...`);
    const unitIds = dirtyFiles.map(f => `${f.toLowerCase()}::unit`);
    await this.persistence.purgeUnits(unitIds);


    // 2.5 Discover Sub-Repositories for Multi-Project Resonance
    const bootstrapper = (this as any).registry?.bootstrapper || (this.orchestrator as any).registry?.bootstrapper;
    const projectRoots = bootstrapper ? bootstrapper.discoverProjects(projectRoot) : [projectRoot];

    // Execute the core analysis wave with project context
    // `filteredFiles` — every discoverable file — not `dirtyFiles`. Import resolution searches this
    // list, and on an incremental pulse the dirty set does not contain the files being imported
    // FROM, so every import edge of a changed file went unbuilt (ADR 0107).
    const pulseStats = await (this.orchestrator as any).analyze(allUnits, {
      projectRoots, workspaceRoot: projectRoot, allDiscoveredPaths: filteredFiles,
    });
    const { pulseId, nodeCount, edgeCount } = pulseStats;

    // 3. Metadata enrichment that doesn't require the full in-memory graph
    for (const unit of allUnits) {
      const fw = essenceLens.detectFramework(path.basename(unit.path), unit.source);
      if (fw) this.graph.getGraph().setMetadata('framework', fw);

      if (path.basename(unit.path) === 'package.json' || path.basename(unit.path) === 'requirements.txt') {
        const spectrum = essenceLens.refract(unit.path, unit.source);
        this.graph.ingestSpectrum(unit.path, spectrum);
      }
    }

    // 4. Reload the graph from the vault. The orchestrator flushed and CLEARED the in-memory graph
    // between waves (ADR 0041), so every consumer below here that needs a whole-project view has to
    // have it rebuilt: `resonate()` (the binders and PageRank), `IntraLinker`, virtual induction and
    // doc governance. FOUR consumers, not one — this comment used to name PageRank alone, which is
    // how todo23#P2 came to be scoped to the ranker and sized against a reload only the ranker
    // needed.
    //
    // It stays, and ADR 0060 is why: measured twice on `mentorseed` (974 files, 9,910 nodes), the
    // whole read half — this load, PageRank, the linkers and induction — is roughly 33 MB of a
    // 686 MB peak, under 5%. The +293 MB this was once thought to cost is not there. The peak is set
    // by the wave flushes on the write side. Anyone proposing to remove this has to beat 5%.
    //
    // Shallow: everything downstream reads skeleton properties only, and `getAllNodes()` never
    // returns the compressed half anyway. It saves compressing every node on the way in and
    // re-inflating it on every `getNode()` — kept on that merit rather than for memory (todo23#P1
    // measured it at 7 MB, which is noise).
    await this.persistence.load(this.graph.getGraph(), { shallow: true });
    traceMemory('after reloading the whole graph for PageRank');

    this.graph.resonate();
    traceMemory('after PageRank');

    // `resonate()` runs after the last wave flush, and `save()` below writes no node or edge rows
    // — so cross-service CALLS edges were built in memory and dropped on every pulse. This is the
    // final gap in todo22#P15: the binder worked, the vault never heard about it.
    // MOVED to after linking and induction — see below. Persisting here captured endpoints as they
    // stood mid-pipeline: `bindPulseCircuits` runs inside `resonate()`, while `IntraLinker` (which
    // resolves bare call targets) and virtual induction (which materialises external ones) both run
    // AFTER it. A handover edge written at this point kept a target id that was about to be
    // resolved, leaving 41 edges pointing from a name that no longer existed anywhere.


    // 4.1 Commit computed gravity values back to the vault (targeted UPDATE, safe on shallow nodes).
    const gravityValues = Array.from(this.graph.getGraph().getAllNodes()).map(n => ({
      id: n.id,
      gravity: (n.properties.gravity as number) || 0,
      isEntryPoint: (n.properties.isEntryPoint as boolean) || false
    }));
    await this.persistence.updateRanks(gravityValues);
    await this.persistence.updateRisks();

    // 4.2 Intra-Project Symbol Resolution
    // Resolves bare cross-file targetIds (e.g. "synapsepersistence") to fully-qualified
    // node IDs (e.g. "…/persistence.ts::synapsepersistence") using IMPORTS adjacency.
    // Must run after the full graph is in memory and gravity is committed.
    const intraLinker = new IntraLinker();
    const resolvedEdges = intraLinker.resolve(this.graph.getGraph());
    await this.persistence.updateEdgeTargets(resolvedEdges);

    // 4.2b COLLAPSE A BARREL RE-EXPORT ONTO THE THING IT RE-EXPORTS.
    //
    // `export { allocateHostPort } from './host-port'` mints an ATOM in the barrel, and a caller
    // importing from the barrel lands its CALLS edge there. So the REAL declaration showed no
    // callers, and `explain allocateHostPort` resolved to the re-export — an ATOM at the export
    // line, not the function. ADR 0109 made the consumers reachable by traversing ALIASES; this
    // makes them reachable by asking the declaration directly, which is how anyone actually asks.
    //
    // Only REFERENCE edges move. An IMPORTS edge stays on the barrel because the import genuinely
    // is from the barrel — rewriting it would misreport where the file's dependency points
    // (ADR 0112).
    const collapsed = this.collapseReExports(this.graph.getGraph());
    if (collapsed.length > 0) {
      await this.persistence.updateEdgeTargets(collapsed);
      logger.info(`🛡️ [Conducks] Collapsed ${collapsed.length} reference(s) from a barrel onto the declaration.`);
    }

    // 4.3 Cross-Service HTTP Call Detection
    // Scans source files for HTTP URL literals and emits CALLS edges to matched service nodes.
    const serviceLinker = new HttpServiceLinker(this.graph.getGraph());
    const serviceEdges = serviceLinker.link(dirtyFiles);
    if (serviceEdges.length > 0) {
      logger.info(`[ServiceLinker] Created ${serviceEdges.length} cross-service HTTP edges`);
      await this.persistence.saveEdges(serviceEdges, pulseId);
    }

    const linker = new FederatedLinker();
    await linker.hydrate(this.graph.getGraph());

    // 4.2 Sync metadata and pulse record (no node/edge rows — they are already in vault)
    const headHash = voyager.getHeadHash();
    if (headHash) {
      this.graph.getGraph().setMetadata('lastAnalyzedCommit', headHash);
    }
    this.graph.getGraph().setMetadata('targetPulseId', pulseId);

    // 4.5 [Conducks Virtual Induction] 🏺
    await this.induceVirtualLibraries(this.graph.getGraph(), pulseId);

    // Doc -> code links, derived from the grammar the docs already use (ADR 0058).
    await this.deriveDocGovernance(pulseId, targetRoot);

    // The binders' edges are persisted HERE, once every resolver has run: IntraLinker has rebound
    // bare call targets and induction has materialised the external ones, so an endpoint that can
    // resolve has resolved. Anything still unresolved is dropped rather than written — ADR 0051:
    // both ends of an edge are node ids, or the edge is not written.
    const builtEdges = this.graph.lastResonanceEdges;
    if (builtEdges.length > 0) {
      const g = this.graph.getGraph();
      const writable = builtEdges.filter(e => g.hasNode(e.sourceId) && g.hasNode(e.targetId));
      const dropped = builtEdges.length - writable.length;
      if (writable.length > 0) {
        await this.persistence.saveEdges(writable, pulseId);
      }
      logger.info(
        `🛡️ [Resonance] Persisted ${writable.length} binder edge(s)` +
        (dropped > 0 ? `, dropped ${dropped} whose endpoints never resolved` : '') + '.'
      );
    }

    // 4.6 Taxonomy reconcile (ADR 0013): cut DATA, edge-gate ATOM. Runs last so every reference
    // edge (intra/service/federated/virtual) is present when deciding which atoms are load-bearing.
    traceMemory('after linkers and virtual induction');
    await this.persistence.pruneTaxonomy();

    // Sweep what this pulse did not touch (ADR 0050). Safe HERE and nowhere else: this is the full
    // pulse, so every live row has just been re-written with this pulseId — including the virtual
    // nodes induction re-stamps above. The watcher's incremental path must never call this; it
    // writes a handful of files and would delete the rest of the graph.
    // Guessed edges that never landed go before the stale-row sweep, so the row counts the sweep
    // reports are of live data rather than of rows about to be removed anyway (ADR 0055).
    // BOTH numbers, always. A single figure that has already had its failures deleted is exactly how
    // the dangling rate came to read 1.15% when it was 14.62% (ADR 0096).
    const sweep = await this.persistence.sweepUnresolvedGuesses();
    if (sweep.deleted > 0 || sweep.kept > 0) {
      logger.info(
        `🛡️ [Conducks] Dropped ${sweep.deleted} universal-member call(s) on local values; ` +
        `KEPT ${sweep.kept} unresolved reference(s) — those are references this analysis could not place.` +
        // Say how many claimed to be resolved and were not. A silent re-stamp is still a mutation,
        // and this number is the honest size of "the processor believed the receiver was enough".
        (sweep.downgraded > 0 ? ` Downgraded ${sweep.downgraded} that still claimed a confident target.` : '')
      );
    }

    // A scoped run sweeps only its own subtree — otherwise it deletes every other service in the
    // workspace (ADR 0069). An INCREMENTAL run does not sweep at all: it re-stamped only the dirty
    // units, so every untouched row would be "not in this pulse" and deleted (ADR 0101).
    if (isFullPass) {
      const swept = await this.persistence.sweepRowsNotInPulse(pulseId, targetRoot !== projectRoot ? targetRoot : undefined);
      if (swept.nodes > 0 || swept.edges > 0) {
        logger.info(`🛡️ [Conducks] Swept ${swept.nodes} node(s) and ${swept.edges} edge(s) left by earlier pulses.`);
      }
    }

    // Snapshot AFTER gravity is committed and the taxonomy is settled, so the history records what
    // the pulse actually published rather than an intermediate state. This is what makes `drift`
    // and `audit --history` answerable at all (todo22#P14).
    await this.persistence.snapshotHistory(pulseId);

    // save() writes the pulse record + metadata and COMMITs — atomically publishing the pulse.
    await this.persistence.save(this.graph.getGraph(), { nodeCount, edgeCount });

    } catch (pulseErr) {
      // Any failure before the commit rolls the entire pulse back — no partial graph is left behind.
      await this.persistence.abortPulse();
      throw pulseErr;
    }

    // No derived-doc regeneration. Structure lives in the graph and is queried on demand
    // (audit/impact/trace/coverage) — never written to a static file that goes stale.
    return { success: true, files: files.length };
  }

  /**
   * Conducks — Virtual Ecosystem Induction 🏺
   * 
   * Scans for dangling external references and induces virtual nodes to group them 
   * by library/namespace. This transforms "Orphans" into "Ecosystem Members".
   */
  /** Every `MODULE.md` under `docs/modules`, as a path relative to that directory. */
  /**
   * Point references at the DECLARATION rather than at the barrel that republishes it.
   *
   * A re-export node is an ATOM sitting on the `export { x } from './y'` line with an ALIASES edge
   * to the real `y::x`. Callers importing from the barrel bind to the ATOM, which means asking the
   * declaration "who calls you" answers nobody, and `explain x` describes an export statement
   * rather than a function.
   *
   * Reference edges are rebound to the alias target; IMPORTS is deliberately left alone, because
   * the importing file's dependency really is on the barrel and rewriting it would misreport the
   * module graph. Chains are followed to a fixed point — a barrel re-exporting a barrel is ordinary
   * — with a visited set, because `a → b → a` is a legal thing for someone to write and a cycle
   * here would hang the pulse (ADR 0112).
   */
  private collapseReExports(graph: any): Array<{ id: string, newTargetId: string }> {
    const REFERENCE = new Set(['CALLS', 'CONSTRUCTS', 'ACCESSES', 'TYPE_REFERENCE', 'EXTENDS', 'IMPLEMENTS']);
    const rebinds: Array<{ id: string, newTargetId: string }> = [];

    /** Follow ALIASES from a re-export to the thing that actually declares the symbol. */
    const declarationOf = (startId: string): string | null => {
      let current = startId;
      const seen = new Set<string>([current]);
      for (let hop = 0; hop < 8; hop++) {
        const alias = graph.getNeighbors(current, 'downstream')
          .find((e: any) => e.type === 'ALIASES' && graph.getNode(e.targetId));
        if (!alias) break;
        if (seen.has(alias.targetId)) break;
        current = alias.targetId;
        seen.add(current);
      }
      return current === startId ? null : current;
    };

    for (const node of graph.getAllNodes()) {
      // Only a re-export is a candidate: an ATOM that aliases something else.
      if (String(node.properties?.canonicalKind ?? '') !== 'ATOM') continue;
      const declaration = declarationOf(node.id);
      if (!declaration || declaration === node.id) continue;

      for (const edge of graph.getNeighbors(node.id, 'upstream')) {
        if (!REFERENCE.has(edge.type)) continue;
        // A file referencing its own re-export is the export statement itself, not a consumer.
        if (edge.sourceId === declaration) continue;
        graph.rebindEdgeTarget(edge, declaration);
        rebinds.push({ id: edge.id, newTargetId: declaration });
      }
    }

    return rebinds;
  }

  private static walkModuleDocs(dir: string, base: string, out: string[]): string[] {
    let entries: fsSync.Dirent[];
    try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) AnalysisService.walkModuleDocs(full, path.join(base, e.name), out);
      else if (e.name === 'MODULE.md') out.push(path.join(base, e.name));
    }
    return out;
  }

  /**
   * GOVERNS edges: a doc file -> the code file it names (ADR 0058).
   *
   * The links are already written and already parsed — `- Enforced by:` on an ADR names a
   * repo-relative path, and a `MODULE.md` sits beside the module it documents. Nothing about how a
   * doc is WRITTEN changes; this reads what the grammar already defines and stores the reference so
   * `impact` can answer "which decision pins this file".
   *
   * The docs LAYER is untouched: `docs-lint` and `docs-status` still boot no engine (ADR 0033). This
   * runs inside the pulse, which is the only direction ADRs 0023 and 0033 actually constrain.
   *
   * A path that does not resolve produces NO edge (ADR 0051). `docs-lint` reports it instead, which
   * is where a broken claim belongs.
   */
  private async deriveDocGovernance(pulseId: string, workspaceRoot: string): Promise<void> {
    const graph = this.graph.getGraph();
    const edges: any[] = [];
    const seen = new Set<string>();

    const link = (docFile: string, targetFile: string, reason: string) => {
      const docId = `${canonicalize(docFile)}::unit`;
      const tgtId = `${canonicalize(targetFile)}::unit`;
      // Both ends must exist as nodes. A doc outside the analysed set, or a path naming a file the
      // pulse never saw, produces nothing rather than a dangling edge.
      if (!graph.hasNode(docId) || !graph.hasNode(tgtId)) return;
      const id = `GOVERNS::${docId}->${tgtId}`;
      if (seen.has(id)) return;
      seen.add(id);
      edges.push({ id, sourceId: docId, targetId: tgtId, type: 'GOVERNS', confidence: 1.0, properties: { reason } });
    };

    try {
      const board = buildBoard(workspaceRoot);
      for (const d of (board.decisions ?? []) as any[]) {
        if (!d.enforcedBy || !d.file) continue;
        for (const rel of enforcedByPaths(String(d.enforcedBy))) {
          // `d.file` is relative to the DOCS directory (`decisions/0044-….md`), while the
          // `Enforced by` path is relative to the REPO (`tests/unit/…`). Resolving both against the
          // repo root silently produced zero edges, because `<root>/decisions/…` does not exist.
          link(path.resolve(workspaceRoot, 'docs', d.file), path.resolve(workspaceRoot, rel), 'enforced-by');
        }
      }
      // MODULE.md -> the module it documents. The mapping already existed in `docs-board.ts:346`
      // in the other direction (`src/lib/core/parsing` -> `docs/modules/core/parsing/MODULE.md`);
      // this reverses it. The doc governs the module's own index file, because a directory is not a
      // node and the index is what a reader opens first.
      for (const rel of AnalysisService.walkModuleDocs(path.join(workspaceRoot, 'docs', 'modules'), '', [])) {
        const modulePath = path.dirname(rel);            // e.g. core/parsing, or core/parsing/reflector
        const docFile = path.join(workspaceRoot, 'docs', 'modules', rel);
        // A module note names one of THREE shapes, and assuming only the first linked 6 of 21:
        //   a directory with an index      core/kinetic          -> src/lib/domain/kinetic/index.ts
        //   a single file                  parsing/reflector     -> src/lib/core/parsing/reflector.ts
        //   a directory with neither       core/graph            -> the DIRECTORY node itself
        for (const base of [path.join('src', 'lib', modulePath), path.join('src', modulePath)]) {
          const abs = path.join(workspaceRoot, base);
          link(docFile, path.join(abs, 'index.ts'), 'module-doc');
          link(docFile, `${abs}.ts`, 'module-doc');
          // The directory node is keyed differently from a unit — it has no `::unit` suffix.
          const dirId = `directory::${canonicalize(abs)}`;
          if (graph.hasNode(`${canonicalize(docFile)}::unit`) && graph.hasNode(dirId)) {
            const id = `GOVERNS::${canonicalize(docFile)}::unit->${dirId}`;
            if (!seen.has(id)) {
              seen.add(id);
              edges.push({ id, sourceId: `${canonicalize(docFile)}::unit`, targetId: dirId, type: 'GOVERNS', confidence: 1.0, properties: { reason: 'module-doc' } });
            }
          }
        }
      }
    } catch (err: any) {
      // The docs tree is optional; a project without one is not an error.
      logger.warn(`🛡️ [Conducks] Doc governance skipped: ${err.message}`);
      return;
    }

    if (edges.length > 0) {
      await this.persistence.saveEdges(edges, pulseId);
      logger.info(`🛡️ [Conducks] ${edges.length} doc->code governance edge(s) — which record pins which file.`);
    }
  }

  private async induceVirtualLibraries(graph: ConducksGraph | any, pulseId: string): Promise<void> {
    const allEdges = graph.getAllEdges();
    // Induction runs AFTER the last wave flush, so anything added here exists only in memory and
    // the pulse's final save() writes no node rows. The log said "Resonated with 2,691 virtual
    // ecosystem symbols" while `SELECT count(*) FROM nodes WHERE id LIKE 'lib::%'` returned 0 on
    // every vault. Collected and written explicitly, the same way cross-service edges are
    // (todo22#P15) — same failure, same shape, same remedy.
    const induced: any[] = [];
    const externalPrefixes = ['global', 'npm', 'std', 'pip', 'gem', 'mvn', 'go', 'crates'];
    
    let inducedCount = 0;
    let restampedCount = 0;

    // The names this project actually depends on, taken from the ECOSYSTEM nodes the manifest
    // parser produced: `path`, `fs`, `chalk`, `@jest/globals`, `duckdb`, and so on.
    //
    // This is the discriminator induction never had. A dotted target is only external when its
    // RECEIVER is one of these — `path.resolve` is, `results.forEach` is not. Without it, induction
    // materialised a "library symbol" for every unresolved method call on a local variable, because
    // it cannot tell an external reference from an unresolved local one and defaults to the former
    // (ADR 0053). 1,480 of 1,692 induced nodes on this repository were that mistake.
    const externalModules = new Set<string>();
    for (const n of graph.getAllNodes()) {
      if (n.properties?.canonicalKind === 'ECOSYSTEM') {
        const nm = String(n.properties?.name ?? '').toLowerCase();
        if (nm) externalModules.add(nm);
      }
    }
    const receiverIsExternal = (dotted: string): boolean => {
      const head = dotted.split('.')[0];
      // `node:fs` and `@scope/pkg` arrive with their prefix intact.
      return externalModules.has(head) || externalModules.has(head.replace(/^node:/, ''));
    };
    const projectRoot = chronicle.getProjectDir().toLowerCase();

    for (const edge of allEdges) {
      const targetId = edge.targetId.toLowerCase();
      
      // A target the graph already holds needs no NODE created — but if it is a virtual node this
      // pulse still depends on, it must be RE-STAMPED, or its row keeps the pulseId of whenever it
      // was first induced. That is what made `nodes.pulseId` mean "first seen" for exactly this
      // subset, and it is why a sweep keyed on pulseId would have deleted every still-valid external
      // symbol. Re-collecting it costs one UPDATE and makes the column mean "last seen" for every
      // row without adding a column (ADR 0050).
      if (graph.hasNode(targetId)) continue;

      // Identify External Ecosystem patterns: "namespace::symbol" or "naked_symbol"
      const parts = targetId.split('::');
      
      let namespace = 'unresolved';
      let symbol = targetId;
      let isCandidate = false;

      if (parts.length >= 2) {
        namespace = parts[0];
        symbol = parts[1];
        // The exact-match list could never work, because a real specifier carries the PACKAGE as
        // its namespace: `@jest/globals::jest.fn`, `minimatch::minimatch`, `node:fs::readdirsync`.
        // Local ids are absolute paths, so the rule that actually separates them is whether the
        // namespace looks like a path. Anything else is a module this project does not contain.
        // The named prefixes stay because `global::` and friends are synthesised, not paths.
        const namespaceIsLocalPath = namespace.startsWith('/') || namespace.startsWith('c:\\')
          || namespace.startsWith('.') || namespace.includes('.ts') || namespace.includes('.js');
        if (externalPrefixes.includes(namespace) || !namespaceIsLocalPath) isCandidate = true;
      } else {
        // A bare, unnamespaced target. It is external only when it reads as a member access on a
        // module this project depends on. Anything else is a local symbol the resolver could not
        // place, and inventing a node for it is how the vault filled with `results.foreach`.
        if (!targetId.startsWith('/') && !targetId.startsWith('c:\\')) {
          isCandidate = targetId.includes('.') ? receiverIsExternal(targetId) : false;
        }
      }

      if (isCandidate) {
        const libId = libraryNamespaceId(namespace);
        
        // 1. Induce Library Node (e.g. lib::unresolved or lib::npm)
        if (!graph.hasNode(libId)) {
          const libNode = {
            id: libId,
            label: 'LIBRARY',
            properties: {
              // Shape and parent from `external-nodes.ts`, the one definition of an external node
              // (todo25#P12). `filePath` is overridden below because a library namespace has a
              // meaningful `external://` path where a package boundary does not.
              ...externalNodeProps({ name: namespace, canonicalKind: 'STRUCTURE', canonicalRank: CanonicalRank[CanonicalKind.STRUCTURE] }),
              filePath: `external://${namespace}`,
              isShallow: true
            }
          };
          graph.addNode(libNode);
          induced.push({ ...libNode, name: namespace });
        }

        // 2. Induce Symbol Node
        const symbolNode = {
          id: targetId,
          label: 'LIBRARY_SYMBOL',
          properties: {
            // A symbol hangs off its NAMESPACE, not the external root — the one case where the
            // parent is not the default, which is why the factory takes it as a parameter.
            ...externalNodeProps({ name: symbol, canonicalKind: 'BEHAVIOR', canonicalRank: CanonicalRank[CanonicalKind.BEHAVIOR], parentId: libId }),
            filePath: `external://${namespace}/${symbol}`,
            isShallow: true
          }
        };
        graph.addNode(symbolNode);
        induced.push({ ...symbolNode, name: symbol });

        // 3. Bind to Library (Conducks Rule: Columnar Hierarchy Only) 🏺
        // We no longer persist MEMBER_OF edges; containment is in node.properties.parentId
        inducedCount++;
      }
    }

    // The log line only claims what the vault received. Reporting the in-memory count was how this
    // reported success for every pulse it silently discarded.
    // Re-stamp every virtual node the graph still holds (ADR 0050).
    //
    // Collected by PROPERTY, not by walking edges: a `lib::<namespace>` node is never an edge
    // TARGET — containment is carried on `parentId`, not by a MEMBER_OF edge — so a traversal-based
    // sweep of "things this pulse referenced" never reaches it. The first version of this did exactly
    // that and the sweep then deleted both library nodes on the second pulse, which the whole-pulse
    // test caught. Anything not re-stamped keeps an older pulseId and is swept as stale.
    const alreadyCollected = new Set(induced.map(n => n.id));
    for (const n of graph.getAllNodes()) {
      if (alreadyCollected.has(n.id)) continue;
      if (!String(n.properties?.filePath ?? '').startsWith('external://')) continue;
      induced.push({ id: n.id, name: n.properties.name, label: n.label, properties: n.properties });
      restampedCount++;
    }

    if (induced.length > 0) {
      await this.persistence.saveNodes(induced, pulseId);
      // Counted, not derived by subtraction: `induced` holds a library node AND a symbol node for
      // some candidates, so the difference would not be the re-stamp count.
      logger.info(
        `🛡️ [Conducks Induction] ${inducedCount} new external reference(s)` +
        (restampedCount > 0 ? `, ${restampedCount} re-stamped` : '') +
        ` — ${induced.length} row(s) written.`
      );
    }
  }
}

export { AnalyzeOrchestrator } from "./orchestrator.js";
export { ConducksReflector } from "@/lib/core/parsing/reflector.js";
export { Conducks } from "./conducks-core.js";

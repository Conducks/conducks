/**
 * Conducks — Optimized Graph Logic
 *
 * High-performance adjacency list for structural codebase representation.
 * Optimized for O(1) neighborhood lookups and recursive traversals.
 */

export type NodeId = string;
// PULSES_TO used to be written as `'PULSES_TO' as any` because it was missing here. A cast is how
// an edge type stays invisible to every exhaustive switch over EdgeType, and it is part of why
// nothing noticed the vault held none of them.
// DEFINES and ALIASES were BOTH reaching the vault through `as any` — `DEFINES` cast at its emit
// site, `ALIASES` through the blanket cast at the parser boundary. Four `DEFINES` rows were in the
// vault under a type the union did not contain. Naming them here is what lets the classification
// below be checked at all.
export type EdgeType = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'ACCESSES' | 'MEMBER_OF' | 'DEPENDS_ON' | 'FROM_IMAGE' | 'VIRTUAL_LINK' | 'CONSTRUCTS' | 'TYPE_REFERENCE' | 'CONTAINS' | 'HAS_METHOD' | 'HAS_PROPERTY' | 'PULSES_TO' | 'GOVERNS' | 'DEFINES' | 'ALIASES';

/**
 * Every edge type is runtime-visible at exactly one of these levels, and the levels NEST:
 * containment ⊂ erased ⊂ local ⊂ module. Each classification below therefore takes the widest
 * level it belongs to, and the three exported sets are derived rather than hand-listed.
 *
 * - `containment` — "X is defined inside Y", NOT "X depends on Y". A TS interface owning its fields
 *   (HAS_PROPERTY), a class owning its methods (HAS_METHOD), a member belonging to its file
 *   (MEMBER_OF), a file containing a symbol (CONTAINS) form trivial loops (type → property → file →
 *   type) that are not circular dependencies. Ignoring these is what stops every interface and
 *   singleton reading as a false cycle.
 * - `erased` — not runtime coupling at all: type references the compiler erases (ADR 0016), and
 *   doc→code links (ADR 0058). Cycle and hub findings ignore these; dead-code still counts a type
 *   reference as usage, which is a different question.
 * - `local` — real runtime coupling, but BELOW module level. A CALLS edge onto a parameter's method
 *   resolves onto the owning class purely because the parameter is type-annotated, which closes
 *   loops that do not exist between modules.
 * - `module` — a module-level dependency. ARCH-3 traverses exactly these.
 */
type EdgeCoupling = 'containment' | 'erased' | 'local' | 'module';

/**
 * The classification, as an exhaustive `Record` rather than a set of array literals.
 *
 * An array cannot be exhaustive, and that is not a hypothetical: `PULSES_TO` was added to `EdgeType`
 * and never added HERE, so ARCH-3 — which means a MODULE IMPORT cycle (ADR 0017) — traversed
 * dataflow edges and reported node's own standard library as circular:
 * `path.dirname -> path.join -> path.resolve`. Those three functions do not call each other. The
 * edges are handovers between nested `path` calls in this project's own source, and a handover
 * is not an import.
 *
 * With a `Record<EdgeType, …>` the compiler refuses a new member of the union until somebody has
 * said what it couples. This is the same remedy ADR 0053 applied to `RESOLVABLE`.
 */
const EDGE_COUPLING: Record<EdgeType, EdgeCoupling> = {
  // containment (ADR 0010)
  MEMBER_OF: 'containment',
  CONTAINS: 'containment',
  HAS_METHOD: 'containment',
  HAS_PROPERTY: 'containment',

  // erased — present in the source, absent at runtime
  TYPE_REFERENCE: 'erased',   // the compiler removes it (ADR 0016)
  GOVERNS: 'erased',          // a doc pinning a file is not a call (ADR 0058); letting it carry
                              // structural weight would make a module's rank a function of how much
                              // documentation sits beside it
  DEFINES: 'erased',          // a scope declaring an HTTP route. The route node is virtual — its
                              // `filePath` is the literal string 'network' — so it is not code and
                              // must not compete with code for gravity, on GOVERNS' reasoning

  // local — runtime coupling below module level
  CALLS: 'local',
  CONSTRUCTS: 'local',
  ACCESSES: 'local',
  PULSES_TO: 'local',         // a value handover between two calls. Further from a module import
                              // than CALLS is, which is why it belongs here and not in `module`
  ALIASES: 'local',           // a local renaming of a symbol (`import { x as y }`, Go/Ruby wildcard
                              // bindings). The IMPORTS edge already carries the module dependency,
                              // so counting the alias again would double-count one import

  // module — ARCH-3 traverses these
  IMPORTS: 'module',
  EXTENDS: 'module',
  IMPLEMENTS: 'module',
  DEPENDS_ON: 'module',
  FROM_IMAGE: 'module',
  VIRTUAL_LINK: 'module',
};

/**
 * Every edge type at or below the given coupling levels. The three lists below are DERIVED from one
 * table rather than written out — three hand-kept lists is how one of them ends up missing a type.
 */
const atOrBelow = (...levels: EdgeCoupling[]): EdgeType[] =>
  (Object.keys(EDGE_COUPLING) as EdgeType[]).filter(t => levels.includes(EDGE_COUPLING[t]));

/** Containment edges — see `EDGE_COUPLING`. */
export const STRUCTURAL_EDGE_TYPES: EdgeType[] = atOrBelow('containment');

/** Edges that are not runtime coupling: containment plus erased. */
export const NON_RUNTIME_EDGE_TYPES: EdgeType[] = atOrBelow('containment', 'erased');

/**
 * Edges ARCH-3 does not traverse: everything that is not module-level coupling. Pair with
 * `ignoreTypeOnly` to drop erased imports too.
 */
export const IMPORT_CYCLE_IGNORED_EDGE_TYPES: EdgeType[] = atOrBelow('containment', 'erased', 'local');

/**
 * One symbol in the graph. `id` is `canonicalize(file) + '::' + name`, lowercased (CONDUCKS-4), which
 * is why two spellings of one path would split a symbol in two — see `contracts/path-utils`.
 *
 * `properties` is a fixed PERSISTED whitelist, not a free bag: a field added here reaches the vault
 * only if the schema knows it. `metadata` is the carrier that survives the round trip.
 */
export interface ConducksNode<T = any> {
  id: NodeId;
  label: string;
  isShallow?: boolean;        // Conducks: If true, properties only contains Skeleton data
  properties: T & {
    name: string;
    filePath: string;
    kind?: string;            // Conducks: Language-specific kind (class, function)
    parentname?: string;      // Conducks: Hierarchical parent name (L1/L2)
    kineticEnergy?: number;
    rank?: number;
    isEntryPoint?: boolean;
    isExport?: boolean;
    canonicalKind: string;    // Conducks: Canonical Taxonomy Layer (STRUCTURE, BEHAVIOR, etc.)
    canonicalRank: number;    // Conducks: Architectural Rank (0-7)
    
    // Universal Structural DNA (Oracle Standard)
    fingerprint?: string;     // SHA256 of structural identity
    parentId?: string;        // Explicit hierarchical parent
    unitId?: string;          // Source file unit ID
    rootId?: string;          // Root ancestor node ID
    namespaceId?: string;     // Logical namespace container
    structureId?: string;     // Primary structure container
    layer_path?: string;      // Materialized path (e.g. L0/L1/L2)
    depth?: number;           // Hierarchy depth
    risk?: number;            // 0-1 complexity risk
    gravity?: number;         // PageRank importance
    complexity?: number;      // Cyclomatic/Halstead composite
    
    // Rich DNA Blocks (JSON)
    dna?: any;
    kinetic?: any;
    signature?: any;

    // Meat (Metadata - only present if not shallow)
    debtMarkers?: string[];
    resonance?: number;
    entropy?: number;
    primaryAuthor?: string;
    authorCount?: number;
    lastModified?: number;
    tenureDays?: number;
    coveredBy?: string[];
    layer?: number;
    range?: any;              // Position data
  };
}

/**
 * One reference between two symbols. `confidence` is load-bearing rather than decorative: an
 * unresolved call target is recorded at 0.4 and a resolved one at 0.85 or above, so a query can ask
 * for edges the resolver actually believes (ADR 0046).
 */
export interface ConducksEdge<T = any> {
  id: string; // "sourceId::targetId::type"
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  confidence: number;
  properties: T;
}

import { CycleDetector } from "./algorithms/cycle-detector.js";
import { StructuralRanker } from "./algorithms/ranker.js";
import { GraphTraversal } from "./algorithms/traversal.js";
import zlib from "zlib";


/**
 * High-performance graph storage optimized for intelligence analysis.
 */
/** Shared empty result, so a miss allocates nothing. */
const EMPTY_ID_SET: ReadonlySet<NodeId> = new Set<NodeId>();

/**
 * The store — every node, every edge, and three indexes over them.
 *
 * OWNS: what exists, what points at what, and the indexes that answer "by name" and "by file" in
 * O(1) rather than by scanning. DOES NOT OWN: whether a reference RESOLVES — that is the linkers\'
 * job, and this class holds an unresolved edge as willingly as a resolved one.
 *
 * The indexes are maintained in exactly three places — `addNode`, `unindex`, `clear` — and an index
 * that misses one silently returns an id whose node is gone, which the resolver then binds an edge
 * to. That failure mode is why `replaceFile` and `clearFile` are separate operations with different
 * rules about incoming edges (todo67).
 */
/**
 * Is this the whole-file unit node, rather than a symbol declared inside the file?
 *
 * Shared by `findSymbolAtLine` below and by `change-set.ts`'s `impactedSymbolIds`, which needs the
 * same rule (a file's whole-span node must not shadow a narrower symbol) but cannot call
 * `findSymbolAtLine` itself — that method reaches into `this.nodes` on a live instance, and
 * `impactedSymbolIds` is only ever handed a plain node list.
 *
 * Checks both spellings a node's unit-ness has been seen under: `label: 'module'`, set by
 * hand-built fixtures (see `symbol-mapping.test.ts`), and `label`/`canonicalKind` `'UNIT'`, which is
 * what a node built by the real pipeline (reflector.ts -> graph-engine.ts) actually carries — the
 * file's own node has `label` set to its `canonicalKind`, never to the string `'module'`. A check
 * against `'module'` alone matches nothing on any real graph.
 */
export function isUnitNode(n: { label?: string; properties?: { canonicalKind?: string } }): boolean {
  return n.label === 'module' || n.label === 'UNIT' || n.properties?.canonicalKind === 'UNIT';
}

export class ConducksAdjacencyList {
  /**
   * Set while a lazy load is DEFERRED: reading this graph is a bug until it is materialised.
   *
   * The registry already guards `infrastructure.graphEngine`, but that getter only sees callers who
   * go through it. `search`, `kinetic` and `governance` are handed `graph.getGraph()` at
   * CONSTRUCTION (`registry/index.ts:118,132,138`) and hold the object directly, so the getter never
   * runs for them — a deferred graph reads as an EMPTY one and every answer is a silent zero. That
   * is CONDUCKS-13, and it is why `needsGraph` had to be opt-OUT rather than opt-in (todo21#P5).
   *
   * The guard therefore lives on the OBJECT rather than on the accessor. Every holder shares this
   * one instance, whenever they captured it, so one flag covers all of them and no constructor
   * signature has to change.
   *
   * A WRITE clears it (see `addNode`), because a graph someone is filling is not deferred — that is
   * how `analyze` legitimately reads a graph it built from source rather than from the vault.
   * Only a read of a graph that is empty AND unfilled can silently answer "nothing".
   */
  private deferred: boolean = false;

  /** Mark the graph unreadable until `load()` materialises it. */
  public markDeferred(): void { this.deferred = true; }

  /** Called by the loader once rows are in: the graph now answers for real. */
  public markMaterialised(): void { this.deferred = false; }

  /** True while the graph is a promise rather than a graph — a read now would report zero, not error. */
  public get isDeferred(): boolean { return this.deferred; }

  /**
   * Fail loudly at the read that would otherwise return a confident nothing.
   *
   * The message names the caller's options rather than just the fault, because both are legitimate:
   * walk the graph after awaiting the load, or answer from SQL — which is the reason the load is
   * deferred in the first place.
   */
  private assertMaterialised(op: string): void {
    if (!this.deferred) return;
    throw new Error(
      `🛡️ [Graph] \`${op}\` read a graph that is not materialised, so it would have answered ` +
      `"nothing" rather than failing. Await \`registry.infrastructure.ensureGraphLoaded()\` before ` +
      `walking the graph, or answer from SQL — which is why the load is deferred (todo21#P5).`);
  }

  private nodes: Map<NodeId, ConducksNode> = new Map();
  private outEdges: Map<NodeId, Set<ConducksEdge>> = new Map(); // Forward: source -> edges
  private inEdges: Map<NodeId, Set<ConducksEdge>> = new Map();  // Backward: target -> edges
  private nameIndex: Map<string, Set<NodeId>> = new Map();        // Fast search index (Set for O(1) dedup)
  private metadata: Map<string, string> = new Map();             // Global project metadata (Phase 5.3)
  private compressedMeat: Map<NodeId, Buffer> = new Map();       // VMC: Memory Zip for non-skeleton properties

  /**
   * `getNode` decompresses and re-`JSON.parse`s the same buffer on every call — MEASURED
   * (todo22#P12) at 0 hits on `analyze --force` (the reload it worried about is shallow now, per
   * Phase 12), but 21501 calls landing on only 3945 distinct ids during `prune` — a 5.45x re-decode
   * rate costing 283 of 1480 ms wall time. That redundancy is what this caches, not the meat itself.
   *
   * Bounded rather than a plain memo: VMC's whole point (Phase 12) is keeping decompressed data OFF
   * the heap, and a long-lived caller (the MCP server) can touch every node in the graph over its
   * lifetime, at which point an unbounded cache re-inflates back to pre-VMC memory. A small LRU
   * captures the same-node re-reads a single command makes without holding the whole graph decoded.
   */
  private static readonly MEAT_CACHE_CAPACITY = 2000;
  private meatCache: Map<NodeId, Record<string, unknown>> = new Map();

  /** Evict the least-recently-used entry once the cache is over capacity. */
  private cacheMeat(id: NodeId, meat: Record<string, unknown>): void {
    this.meatCache.delete(id);
    this.meatCache.set(id, meat);
    if (this.meatCache.size > ConducksAdjacencyList.MEAT_CACHE_CAPACITY) {
      const oldest = this.meatCache.keys().next().value;
      if (oldest !== undefined) this.meatCache.delete(oldest);
    }
  }

  /**
   * Two more indexes over the same nodes, because three separate resolvers were each answering
   * "which nodes have this name / live in this file" by scanning EVERY node.
   *
   * `nameIndex` is keyed by the exact spelling, which is what `findNodesByName` wants and is
   * useless to a caller that already lowercased. Rather than change that method's semantics, the
   * lowercase view is its own map. Each costs O(N) in ids that already exist and turns an O(N)
   * scan per lookup into O(1) — for callers that run one lookup per import or per file, that is
   * the difference between O(M x N) and O(M + N).
   *
   * Every index here is maintained in exactly three places — `addNode`, `removeNodes`, `clear` —
   * and an index that misses one of them silently returns wrong answers rather than failing.
   */
  private lowerNameIndex: Map<string, Set<NodeId>> = new Map();
  private filePathIndex: Map<string, Set<NodeId>> = new Map();

  /** Empties everything, indexes included. The third of the three places an index must be maintained. */
  public clear(): void {
    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();
    this.nameIndex.clear();
    this.lowerNameIndex.clear();
    this.filePathIndex.clear();
    this.metadata.clear();
    this.compressedMeat.clear();
    this.meatCache.clear();
  }

  /**
   * Drop one node's entries from every index.
   *
   * One place, because the indexes are keyed by values that can CHANGE — a rename changes the name
   * key, a moved file changes the path key — so both removal paths (overwrite in `addNode`, purge
   * in `clearFile`) must undo exactly what `addNode` recorded, using the node as it was.
   */
  private unindex(id: NodeId, node: ConducksNode): void {
    const name = node.properties.name;
    if (name) {
      this.nameIndex.get(name)?.delete(id);
      this.lowerNameIndex.get(String(name).toLowerCase())?.delete(id);
    }
    const filePath = node.properties.filePath;
    if (filePath) this.filePathIndex.get(String(filePath).toLowerCase())?.delete(id);
  }

  /** Node ids whose lowercased name matches. O(1) — the caller does its own filtering. */
  public getNodeIdsByLowerName(lowerName: string): ReadonlySet<NodeId> {
    return this.lowerNameIndex.get(lowerName) ?? EMPTY_ID_SET;
  }

  /** Node ids declared in a given file path, matched case-insensitively. O(1). */
  public getNodeIdsByFilePath(filePath: string): ReadonlySet<NodeId> {
    return this.filePathIndex.get(filePath.toLowerCase()) ?? EMPTY_ID_SET;
  }

  /**
   * Adds or updates a node in the graph.
   * If isShallow is true, only structural properties are retained in RAM.
   * 
   * v1.7.0 (VMC): If isShallow is false, we compress the 'Meat' to preserve memory.
   */
  public addNode(node: ConducksNode): void {
    // A graph someone is FILLING is not a deferred one, whoever is filling it.
    //
    // `analyze` defers the load on purpose (it is in `STALENESS_BYPASS`) and then builds the graph
    // from source rather than from the vault — so it legitimately reads a graph nothing loaded.
    // Guarding on the deferral alone conflated that with the real failure and broke 53 tests, which
    // is the useful half of that mistake: the flag has to mean "empty AND nobody is filling it",
    // not "the vault load was skipped".
    this.deferred = false;

    const id = node.id.toLowerCase();
    node.id = id;

    // 1. Structural Skeleton Extraction (Always in RAM)
    const skeletonNode: ConducksNode = {
      id: node.id,
      label: node.label,
      isShallow: node.isShallow ?? false,
      properties: {
        name: node.properties.name,
        filePath: node.properties.filePath,
        kind: node.properties.kind,
        parentname: node.properties.parentname,
        rank: node.properties.rank,
        kineticEnergy: node.properties.kineticEnergy,
        isEntryPoint: node.properties.isEntryPoint,
        // PAIRED with `isEntryPoint`, and on the skeleton for the same reason `doc` and `instanceOf`
        // are: the two are written together by `StructuralRanker` and read together by `entry`, and
        // a field that is not on the skeleton cannot be CLEARED through it. `detectEntryPoints`
        // deliberately has no latch — a node that gains a caller stops being an entry — but the
        // delete landed on the skeleton while the meat kept its copy, and `getNode` merges meat over
        // skeleton, so a stale reason outlived the flag it explains.
        entryReason: node.properties.entryReason,
        isExport: node.properties.isExport,
        canonicalKind: node.properties.canonicalKind,
        canonicalRank: node.properties.canonicalRank,
        // DNA Columns (Oracle Skeleton)
        fingerprint: node.properties.fingerprint,
        // The identity WITHOUT the name, which is what lets `drift` see a rename. On the skeleton
        // for the reason every comment around it gives: a field left out here is computed correctly,
        // carried through the worker correctly, and then dropped silently at the graph boundary —
        // the column stays NULL and the feature reads as "nothing changed". Measured exactly that
        // way before it was added: `drift` still answered "Renamed/Moved: 0" after a rename.
        shapeFingerprint: node.properties.shapeFingerprint,
        parentId: node.properties.parentId,
        unitId: node.properties.unitId,
        rootId: node.properties.rootId ?? undefined,
        namespaceId: node.properties.namespaceId,
        structureId: node.properties.structureId,
        layer_path: node.properties.layer_path,
        range: node.properties.range,
        depth: node.properties.depth,
        risk: node.properties.risk,
        gravity: node.properties.gravity,
        complexity: node.properties.complexity,
        dna: node.properties.dna,
        kinetic: node.properties.kinetic,
        signature: node.properties.signature,
        // The author's own description of this symbol (ADR 0133). On the SKELETON because the
        // skeleton is what survives a vault load and what `saveNodes` reads — a field left out here
        // is harvested correctly, carried through the worker correctly, and then silently dropped at
        // the graph boundary. Measured exactly that way: the join reported `attached: 1` while the
        // `doc` column stayed NULL, which is the same shape as the route columns and `instanceOf`
        // above, both of which cost a debugging session before they were added.
        doc: node.properties.doc,
        docFirstLine: node.properties.docFirstLine,
        // Cross-service HTTP binding reads these, and the skeleton is what survives a load — so
        // omitting them made `bindRouteCircuits` match nothing on any graph that came from the
        // vault rather than straight from a parse (todo22#P15).
        // `const x = new Y()` — the variable's type, read off the declaration (todo29#P3b). On the
        // skeleton because IntraLinker resolves `x.method()` against it, and the skeleton is what
        // survives a vault load: left out, the link worked on a fresh parse and vanished on reload,
        // the same shape as the route columns below.
        instanceOf: node.properties.instanceOf,
        instanceOfCall: node.properties.instanceOfCall,
        declaredReturn: node.properties.declaredReturn ?? (node.properties.dna as any)?.returns,
        objectPaths: node.properties.objectPaths,
        paramTypes: node.properties.paramTypes,
        memberTypes: node.properties.memberTypes,
        isRoute: node.properties.isRoute,
        isRequest: node.properties.isRequest,
        method: node.properties.method,
        path: node.properties.path,
        url: node.properties.url
      }
    };

    // 2. Memory Zip (VMC): Compress the 'Meat' (metadata) if present
    //
    // A cached decompression of the OLD meat must not survive this id being rewritten, whether the
    // rewrite lands new meat (below) or goes shallow and leaves none — either way the cache would
    // otherwise hand a later `getNode` data that no longer matches what `compressedMeat` holds for
    // this id (todo22#P12).
    this.meatCache.delete(id);
    if (!node.isShallow) {
      try {
        // Every skeleton key is stripped, derived from the skeleton just built rather than from a
        // hand-written list. The list WAS hand-written and named four of about thirty-five, so a
        // property lived in both halves — and `getNode` merges meat OVER skeleton, which makes the
        // stale copy win.
        //
        // That is a live trap between the two accessors: `getAllNodes()` hands out the skeleton
        // itself, so `StructuralRanker` writes `gravity`, `rank` and `isEntryPoint` straight onto
        // it, while a later `getNode()` returns those fields from the meat as they were at ingest.
        // Write with one accessor, read with the other, and the write is invisible.
        //
        // It has not bitten production, and that was measured before changing anything: the vault
        // carries 264 distinct gravity values and six sensible entry points, because the persist
        // path reads skeletons. It bit the first test ever written against the ranker.
        const meat = { ...node.properties } as Record<string, unknown>;
        for (const key of Object.keys(skeletonNode.properties)) delete meat[key];
        
        const compressed = zlib.deflateSync(JSON.stringify(meat));
        this.compressedMeat.set(id, compressed);
      } catch (err) {
        console.error(`[Conducks VMC] Compression failed for node ${id}:`, err);
      }
    } else {
      // Pre-existing gap the meat-cache test caught: re-adding an id as shallow left the OLD
      // compressed buffer in place — nothing here ever cleared it — so `getNode` kept handing back
      // meat from before this node went shallow. A shallow node has no meat by definition.
      this.compressedMeat.delete(id);
    }

    // An id can be re-added with a DIFFERENT name or file — a symbol renamed, or a file moved. The
    // indexes are keyed by those values, so the old entries have to go before the new ones land, or
    // the id stays reachable under a name it no longer has. That is not merely stale: `clearFile`
    // reads this index to decide what to purge, so a leftover entry makes a pulse delete nodes that
    // belong to a different file, and the node count silently shifts.
    const previous = this.nodes.get(id);
    if (previous) this.unindex(id, previous);

    // A node is never its own parent. Enforced at the source now (graph-engine's ingest) and
    // preserved across waves by COALESCE on the parentId column — an earlier guard here tried to
    // recover the value from `previous`, which fails because the graph is CLEARED between waves, so
    // it turned 334 self-loops into 384 orphans instead.

    this.nodes.set(id, skeletonNode);

    // 3. Update Fast Search Index
    const name = node.properties.name || '';
    if (name) {
      if (!this.nameIndex.has(name)) this.nameIndex.set(name, new Set());
      this.nameIndex.get(name)!.add(id);

      const lower = name.toLowerCase();
      let lowerSet = this.lowerNameIndex.get(lower);
      if (!lowerSet) { lowerSet = new Set(); this.lowerNameIndex.set(lower, lowerSet); }
      lowerSet.add(id);
    }

    // Keyed LOWERCASE, because `clearFile` matches paths case-insensitively and it is the write
    // path that must not miss anything — an entry left behind after a purge hands out ids for nodes
    // that no longer exist. Readers that need exact-case semantics filter after the lookup.
    const filePath = node.properties.filePath || '';
    if (filePath) {
      const key = filePath.toLowerCase();
      let pathSet = this.filePathIndex.get(key);
      if (!pathSet) { pathSet = new Set(); this.filePathIndex.set(key, pathSet); }
      pathSet.add(id);
    }
  }



  /**
   * Adds a relationship between two nodes.
   * Allows adding edges even if nodes don't exist yet (Neural Binding).
   */
  public addEdge(edge: ConducksEdge): void {
    edge.id = edge.id.toLowerCase();
    edge.sourceId = edge.sourceId.toLowerCase();
    edge.targetId = edge.targetId.toLowerCase();
    // 1. Initialize adjacency sets
    if (!this.outEdges.has(edge.sourceId)) this.outEdges.set(edge.sourceId, new Set());
    if (!this.inEdges.has(edge.targetId)) this.inEdges.set(edge.targetId, new Set());

    const outSet = this.outEdges.get(edge.sourceId)!;
    const inSet = this.inEdges.get(edge.targetId)!;

    // 2. Conducks: ID-Based Idempotency check
    for (const e of outSet) if (e.id === edge.id) return;

    outSet.add(edge);
    inSet.add(edge);

    // Propagate Kinetic Energy during pulse
    this.recalculateGravity(edge.sourceId);
    this.recalculateGravity(edge.targetId);
  }

  /**
   * Checks if an edge exists by ID.
   */
  public hasEdge(edgeId: string): boolean {
    for (const edges of this.outEdges.values()) {
        for (const e of edges) {
            if (e.id === edgeId) return true;
        }
    }
    return false;
  }

  /**
   * Conducks — Surgical Rebinding
   *
   * Moves an edge to a new targetId in the backward index.
   * Essential for neural binding where temporary IDs are resolved to origins.
   */
  public rebindEdgeTarget(edge: ConducksEdge, newTargetId: NodeId): void {
    const oldTargetId = edge.targetId;
    if (oldTargetId === newTargetId) return;

    // 1. Remove from old target's in-set
    const oldInSet = this.inEdges.get(oldTargetId);
    if (oldInSet) {
      oldInSet.delete(edge);
      if (oldInSet.size === 0) this.inEdges.delete(oldTargetId);
    }

    // 2. Update edge property
    edge.targetId = newTargetId;

    // A rebind IS a resolution: the target is now known, so an edge that was written as a guess
    // (ADR 0046 records unresolved call targets at 0.4) is no longer one and must stop reporting
    // itself as low confidence. Only the guessed band is raised — an edge at 0.6 or above was
    // never a give-up and keeps whatever its processor decided.
    if (edge.confidence < 0.6) edge.confidence = 0.85;

    // 3. Add to new target's in-set
    if (!this.inEdges.has(newTargetId)) this.inEdges.set(newTargetId, new Set());
    this.inEdges.get(newTargetId)!.add(edge);
  }

  /**
   * Re-state one file: drop what that file said, keep what everyone else said about it.
   *
   * `clearFile` is the wholesale version and is wrong for a re-pulse. Measured on a two-node
   * fixture: clearing `a.ts` also removes the incoming `CALLS` that `main.ts` owns, so re-parsing a
   * file silently deletes other files' references to it — the same answer broken in the opposite
   * direction. A re-parse restates the file's OWN outgoing edges and says nothing about anyone's.
   *
   * `keepIds` is what the new spectrum declares. Anything the file used to declare and no longer
   * does is removed outright; an incoming edge left pointing at it becomes unresolved, which is the
   * same state as any other reference the graph cannot place and is honest about what is known.
   *
   * Without this the live pulse only ever ADDED, so a deleted call kept its edge — and the watcher
   * records the file's hash afterwards, so the next `analyze` saw 0 dirty units and never repaired
   * it (todo67).
   */
  public replaceFile(filePath: string, keepIds: ReadonlySet<NodeId>): void {
    if (!filePath || typeof filePath !== 'string') return;
    const ids = new Set(this.getNodeIdsByFilePath(filePath.toLowerCase()));

    for (const id of ids) {
      // 1. The file's OWN outgoing edges go, whether the node survives or not: the re-parse is
      //    about to restate them, and a stale one is exactly the defect this fixes.
      const outgoing = this.outEdges.get(id);
      if (outgoing) {
        for (const edge of outgoing) {
          const inSet = this.inEdges.get(edge.targetId);
          if (inSet) for (const e of [...inSet]) if (e.id === edge.id) inSet.delete(e);
        }
        this.outEdges.delete(id);
      }

      // 2. A node the file still declares stays, incoming edges and all.
      if (keepIds.has(id)) continue;

      // 3. A node it no longer declares is removed. Incoming edges are NOT hunted down and deleted —
      //    they belong to other files, and leaving them unresolved is the truthful record.
      const node = this.nodes.get(id);
      if (node) this.unindex(id, node);
      this.inEdges.delete(id);
      this.nodes.delete(id);
      this.meatCache.delete(id);
    }
  }

  /**
   * Removes a file's nodes and EVERY edge touching them, incoming included.
   *
   * That is the difference from `replaceFile`, and why a re-pulse must not use this one: clearing a
   * file also deletes the references other files own, so re-parsing `a.ts` would silently remove
   * `main.ts`'s call to it (todo67).
   */
  public clearFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') return;
    const targetPath = filePath.toLowerCase();
    
    // 1. Identify "Physical Units" in this file path. 
    // We skip 'NAMESPACE' (Phase 7.2) nodes as they are stable Virtual Containers 
    // that should persist even if specific files within them are being re-indexed.
    // Was a scan and a copy of EVERY node, and this runs once per file being re-indexed — so a
    // pulse over F files cost O(F x N) before any parsing happened. The index answers it directly,
    // and it is keyed lowercase precisely so this comparison stays the one it always was.
    const nodeIds = new Set(this.getNodeIdsByFilePath(targetPath));

    for (const id of nodeIds) {
      // 1. Clean up references in other nodes' sets
      const incoming = this.inEdges.get(id);
      if (incoming) {
        for (const edge of incoming) {
          const outSet = this.outEdges.get(edge.sourceId);
          if (outSet) {
            const toDelete: ConducksEdge[] = [];
            for (const e of outSet) if (e.id === edge.id) toDelete.push(e);
            for (const e of toDelete) outSet.delete(e);
          }
        }
      }

      const outgoing = this.outEdges.get(id);
      if (outgoing) {
        for (const edge of outgoing) {
          const inSet = this.inEdges.get(edge.targetId);
          if (inSet) {
            const toDelete: ConducksEdge[] = [];
            for (const e of inSet) if (e.id === edge.id) toDelete.push(e);
            for (const e of toDelete) inSet.delete(e);
          }
        }
      }

      // 2. Remove the node's own sets
      this.outEdges.delete(id);
      this.inEdges.delete(id);

      // 3. Remove from every index. A removal that forgets one leaves an id pointing at a node
      // that no longer exists, and the resolver then binds an edge to nothing.
      const node = this.nodes.get(id);
      if (node) this.unindex(id, node);

      // 4. Remove Node
      this.nodes.delete(id);

      // A purged id is unreachable through `getNode` regardless (it checks `this.nodes` first), so
      // this is memory hygiene rather than a correctness fix — but it keeps the cache from holding
      // decoded meat for a node that no longer exists.
      this.meatCache.delete(id);
    }
  }

  /**
   * Incremental Gravity Update (Heuristic)
   *
   * Provides a fast, local estimate of importance during indexing.
   * Full PageRank structural alignment occurs during globalRecalculateGravity.
   */
  private recalculateGravity(nodeId: NodeId): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const incoming = (this.inEdges.get(nodeId)?.size || 0);
    const outgoing = (this.outEdges.get(nodeId)?.size || 0);

    // Heuristic: (In * 2) + Out
    const energy = (incoming * 2) + outgoing;
    node.properties.kineticEnergy = energy;

    // Preliminary rank
    node.properties.rank = Math.log10(energy + 1) / 10;
  }

  /**
   * Fetches neighbors in a specific direction.
   */
  /**
   * Find an edge BY ID and retarget it, delegating the index work to `rebindEdgeTarget`.
   *
   * `IntraLinker` returns resolutions as `{id, newTargetId}` — it has the id, not the edge object —
   * and those were applied to the VAULT only, so the in-memory graph kept the unresolved names for
   * every consumer running later in the same pulse.
   *
   * This is a LOOKUP, deliberately not a second implementation: the index bookkeeping lives in
   * `rebindEdgeTarget` and nowhere else. Written as a full copy first, which would have been the
   * sixth duplicate of a predicate this codebase has been consolidating all week — caught because a
   * module note still cited the original.
   *
   * Returns false when no edge carries that id, so a caller cannot read "not found" as "retargeted".
   */
  public retargetEdge(edgeId: string, newTargetId: NodeId): boolean {
    const id = edgeId.toLowerCase();
    for (const [, outSet] of this.outEdges) {
      for (const edge of outSet) {
        if (edge.id !== id) continue;
        this.rebindEdgeTarget(edge, newTargetId.toLowerCase());
        return true;
      }
    }
    return false;
  }

  /** Edges touching a node, in one direction. `upstream` = who points AT it; `downstream` = what it points at. */
  public getNeighbors(nodeId: NodeId, direction: 'upstream' | 'downstream' = 'downstream', type?: EdgeType): ConducksEdge[] {
    this.assertMaterialised("getNeighbors");
    const normalizedId = nodeId.toLowerCase();
    const edgeSet = direction === 'downstream' ? this.outEdges.get(normalizedId) : this.inEdges.get(normalizedId);
    if (!edgeSet) return [];
    // `type` was DECLARED and never applied — a caller asking for ALIASES got MEMBER_OF and every
    // other edge, in first-insertion order, with no error. Found by an alias walk that followed a
    // containment edge into the directory tree. Every other caller omits the argument, so applying
    // it now changes nothing that already worked.
    return type ? Array.from(edgeSet).filter(e => e.type === type) : Array.from(edgeSet);
  }

  /**
   * Fetches all edges connected to nodes within a specific file.
   */
  public getNeighborsByFilePath(filePath: string, direction: 'upstream' | 'downstream'): Array<{ targetPath: string, edge: ConducksEdge }> {
    const fileEdges: Array<{ targetPath: string, edge: ConducksEdge }> = [];
    // Was `Array.from(this.nodes.values()).filter(...)` — a full scan AND a full copy of every node
    // in the graph, on every call. `cochange-engine` calls this twice per candidate pair, so the
    // cost was O(pairs x N) in time and O(N) in garbage per call. The index answers it directly.
    for (const nodeId of this.getNodeIdsByFilePath(filePath)) {
      // The index is case-insensitive; this method always compared paths exactly, so the exact
      // check is kept rather than quietly widening what counts as "in this file".
      if (this.nodes.get(nodeId)?.properties.filePath !== filePath) continue;
      const neighbors = this.getNeighbors(nodeId, direction);
      for (const edge of neighbors) {
        const targetId = direction === 'downstream' ? edge.targetId : edge.sourceId;
        const targetNode = this.nodes.get(targetId);
        if (targetNode && targetNode.properties.filePath !== filePath) {
          fileEdges.push({ targetPath: targetNode.properties.filePath, edge });
        }
      }
    }
    return fileEdges;
  }

  /**
   * Recursive BFS traversal to calculate "Blast Radius" (Impact Analysis).
   */
  public traverseUpstream(startId: NodeId, maxDepth: number = 5): Map<NodeId, number> {
    return GraphTraversal.traverseUpstream(this, startId, maxDepth);
  }

  /**
   * Conducks — Kinetic A* Search
   *
   * High-precision pathfinding between symbols using structural heuristics.
   */
  public traverseAStar(startId: NodeId, targetId: NodeId, heuristic?: (n: ConducksNode) => number): NodeId[] {
    return GraphTraversal.traverseAStar(this, startId, targetId, heuristic);
  }

  /**
   * Retrieves a node by ID (Case-Insensitive).
   * 
   * v1.7.0 (VMC): Hydrates the node with 'Meat' (properties) from the compressed store.
   */
  public getNode(nodeId: NodeId): ConducksNode | undefined {
    this.assertMaterialised("getNode");
    const id = nodeId.toLowerCase();
    const skeleton = this.nodes.get(id);
    if (!skeleton) return undefined;

    const compressed = this.compressedMeat.get(id);
    if (compressed) {
      // Decompress once per id and reuse from the LRU on repeat reads — MEASURED (todo22#P12) at a
      // 5.45x re-decode rate for the same ids on `prune` (21501 calls landing on 3945 distinct
      // nodes). `analyze --force` never reaches this branch at all (0 of 7306 `getNode` calls hit
      // meat), because Phase 12 made the mid-pulse reload shallow — this cache is for `explain`,
      // `diff`, `rename` and `prune`, which still load with meat and call `getNode` in loops.
      let meat = this.meatCache.get(id);
      if (!meat) {
        let decoded: Record<string, unknown>;
        try {
          decoded = JSON.parse(zlib.inflateSync(compressed).toString());
        } catch (err) {
          throw new Error(`Decompression failed for node ${id}: ${err}`);
        }
        meat = decoded;
        this.cacheMeat(id, meat);
      }
      return {
        ...skeleton,
        isShallow: false,
        properties: {
          ...skeleton.properties,
          ...meat
        }
      };
    }

    return skeleton;
  }


  /**
   * Checks if a node exists (Case-Insensitive).
   */
  public hasNode(nodeId: NodeId): boolean {
    this.assertMaterialised("hasNode");
    return this.nodes.has(nodeId.toLowerCase());
  }

  /** Every node. A snapshot — callers iterate it while mutating the graph, so it must not be a live view. */
  public getAllNodes(): IterableIterator<ConducksNode> {
    this.assertMaterialised("getAllNodes");
    return this.nodes.values();
  }

  /** The backing map, for callers that need identity rather than a copy. Handed out, so treat as read-only. */
  public getNodesMap(): Map<NodeId, ConducksNode> {
    this.assertMaterialised("getNodesMap");
    return this.nodes;
  }

  /** The outgoing-edge index, same contract as `getNodesMap`. */
  public getOutEdgesMap(): Map<NodeId, Set<ConducksEdge>> {
    return this.outEdges;
  }

  /** Graph-level facts — the pulse id, the branch, the last analysed commit. Survives to the vault. */
  public setMetadata(key: string, value: string): void {
    this.metadata.set(key, value);
  }

  /** One metadata value, or null. Null means never set, which is distinct from set-to-empty. */
  public getMetadata(key: string): string | undefined {
    return this.metadata.get(key);
  }

  /** Every metadata pair, which is what persistence writes back on save. */
  public getAllMetadata(): Map<string, string> {
    return this.metadata;
  }

  /**
   * Conducks — Structural Synapse Retrieval
   * 
   * Fetches the complete set of edges from the Synapse Graph.
   */
  public getAllEdges(): ConducksEdge[] {
    this.assertMaterialised("getAllEdges");
    const edges: ConducksEdge[] = [];
    for (const edgeSet of this.outEdges.values()) {
      edges.push(...Array.from(edgeSet));
    }
    return edges;
  }

  /**
   * High-fidelity structural search.
   * Performs O(1) exact lookup, falling back to O(N) fuzzy resonance if needed.
   */
  /**
   * Every node id. Read by `tryResolveSymbol` to resolve an input that IS an id — see the
   * relative-id branch there for the two printed shapes the name index cannot answer.
   */
  public allNodeIds(): Iterable<string> {
    return this.nodes.keys();
  }

  public findNodesByName(name: string): ConducksNode[] {
    const query = name.toLowerCase();
    const results = new Map<NodeId, ConducksNode>();

    // 1. Fast Index (Exact spelling).
    const exactIds = this.nameIndex.get(name);
    if (exactIds) {
      for (const id of exactIds) {
        const node = this.nodes.get(id);
        if (node) results.set(id, node);
      }
    }

    // 2. Case-insensitive EXACT-NAME union — ALWAYS run and UNION with the exact hits, rather than
    // returning early on any exact hit (F-01).
    //
    // `nameIndex` is keyed by the EXACT spelling on the file, so on the orchestrator subject
    // `Registry` (4 mixed-case usages) hit the fast index and returned right here, and the only
    // place that matches case-insensitively never ran. The real declaration is stored as
    // `registry` (lowercased), gravity 0.2364, ~5x every other candidate, and it never entered the
    // pool `impact`'s highest-gravity pick draws from: the pick was true of a pool that had already
    // discarded its winner.
    //
    // EQUALITY, not `.includes()` — an earlier version of this fix ran the broad SUBSTRING fuzzy
    // scan (see step 3) unconditionally, which pulled in anything merely containing the query as a
    // substring even when a perfectly good exact match already existed: the file's own unit node
    // (named after the file, e.g. `widget.ts`) matched a search for `Widget`, and `usewidget`
    // matched a search for `Widget` too — both real regressions, measured via
    // `traversal-truth.test.ts` and `rename-repeated-call-sites.test.ts` going red. Case-insensitive
    // EQUALITY only widens the net to true case variants, the actual shape of F-01.
    for (const node of this.nodes.values()) {
      if (results.has(node.id)) continue;
      const nodeName = node.properties.name?.toLowerCase() || '';
      if (nodeName === query) results.set(node.id, node);
    }

    // 3. Fuzzy / substring resonance — a genuine FALLBACK, run only when nothing above matched at
    // all. This is the original behaviour for a query that is not a name anywhere in the graph
    // (`query('process')` finding `processOrder`/`processPayment`) and must stay a last resort:
    // running it unconditionally is exactly the regression step 2's comment describes.
    if (results.size === 0) {
      let fuzzyCount = 0;
      for (const node of this.nodes.values()) {
        if (fuzzyCount >= 20) break;
        const nodeName = node.properties.name?.toLowerCase() || '';
        const nodeLabel = node.label?.toLowerCase() || '';
        if (nodeName.includes(query) || nodeLabel.includes(query)) {
          results.set(node.id, node);
          fuzzyCount++;
        }
      }
    }

    return [...results.values()];
  }

  /**
   * Conducks — Kinetic Symbol Resolver
   *
   * Returns the specific architectural symbol (function, class, module)
   * enclosing a given line number within a file.
   *
   * FIX 4 (macOS Path Case-Sensitivity):
   * chokidar on macOS/HFS+ can emit paths with different casing than what is
   * stored in the graph (e.g. the OS returns "src/Core/engine.ts" but the
   * graph stored "src/core/engine.ts"). The original implementation used a
   * simple `.toLowerCase()` on both sides — which is correct — but only on
   * the *outer* filter. The sort comparator and the module-label fallback
   * `find()` call were also using the raw `filePath` argument, causing
   * `.filter()` to silently return an empty array and skip symbol resolution.
   *
   * The fix normalises the incoming filePath once at the top of the method
   * and reuses that single canonical value everywhere inside.
   */
  public findSymbolAtLine(filePath: string, line: number): ConducksNode | undefined {
    if (!filePath || typeof filePath !== 'string') return undefined;
    // FIX 4: Normalise once — all comparisons below use this canonical value.
    const targetPath = filePath.toLowerCase();
    const nodesInFile = Array.from(this.nodes.values())
      .filter(n => {
        const path = n.properties.filePath;
        return path && path.toLowerCase() === targetPath;
      });

    // Sort by smallest range (innermost scope) first
    nodesInFile.sort((a, b) => {
      const aRange = (a as any).originalRange || a.properties.range;
      const bRange = (b as any).originalRange || b.properties.range;
      if (!aRange || !bRange) return 0;
      return (aRange.end.line - aRange.start.line) - (bRange.end.line - bRange.start.line);
    });

    for (const node of nodesInFile) {
      const range = (node as any).originalRange || node.properties.range;
      if (range && line >= range.start.line && line <= range.end.line) {
        // Exclude the whole-file unit node if more specific symbols exist.
        //
        // A freshly-built fixture may still set `label: 'module'` (see symbol-mapping.test.ts),
        // but a node that came through the real pipeline (reflector.ts -> graph-engine.ts) never
        // does: `label` is set to `canonicalKind`, which for the file's own node is the uppercase
        // string `'UNIT'` — so this check matched nothing on any real graph and the exclusion was
        // silently dead. Checking both spellings makes it work for real data without breaking the
        // hand-built fixture.
        if (isUnitNode(node) && nodesInFile.length > 1) continue;
        return node;
      }
    }

    // Fallback: Return the module node if no specific symbol matches the line.
    // nodesInFile is already filtered to the correct (normalised) path,
    // so this find() is safe and consistent with the outer filter.
    return nodesInFile.find(isUnitNode);
  }

  /** Counts and density. A GETTER, not a method — calling it as one threw for every caller that tried. */
  public get stats() {
    const degrees = Array.from(this.outEdges.values()).map(s => s.size);
    degrees.sort((a, b) => a - b);
    const median = degrees.length > 0 ? degrees[Math.floor(degrees.length / 2)] : 0;

    const nodeCount = this.nodes.size;
    const edgeCount = degrees.reduce((sum, d) => sum + d, 0);

    return {
      nodeCount,
      edgeCount,
      medianDegree: median,
      density: nodeCount > 0 ? (edgeCount / nodeCount) : 0
    };
  }

  /**
   * Detects all Strongly Connected Components (SCCs) using Tarjan's algorithm.
   * Linear time complexity: O(V + E).
   */
  public detectCycles(options: { ignoreTypes?: string[], ignoreTypeOnly?: boolean, onlyTypes?: Set<string> } = {}): NodeId[][] {
    return CycleDetector.detect(this, options);
  }
}
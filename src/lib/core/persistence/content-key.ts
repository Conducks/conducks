/**
 * Conducks — which node columns a layer's content hash may cover (ADR 0081).
 *
 * A content-addressed layer only pays if two layers sharing code share rows, and that turns
 * entirely on what goes into the hash. Measured across the 4,370 node ids present in two adjacent
 * commits of this repository:
 *
 *   metadata    92.9% of rows differ        layer_path  88.9%
 *   rootId      92.6%                       gravity     26.3%
 *
 * ...while fourteen other columns are identical on EVERY shared id. Hash the volatile four into the
 * key and the key changes whenever they do: dedup falls from 48.4% to 3.5%, and content-addressing
 * measures as a 2.14x LOSS against flat storage rather than the 0.564x win it actually is. A whole
 * day of contradictory numbers came from exactly that, so the split lives in code with a test rather
 * than in a comment.
 *
 * The failure mode this guards is silent: a column added to the content row simply makes the vault
 * grow, with nothing to notice. So a new column must be classified into one of these two lists or
 * the gate fails — defaulting is what costs the dedup.
 */

/**
 * Columns that move for symbols in files nobody touched. They belong on the SLOT row — one per
 * (layer, id) — never inside the content hash.
 *
 * `gravity` is a graph-wide PageRank float, so any edit anywhere perturbs it. The other three are
 * larger contributors and were NOT named by todo20#P0's coarser measurement: `metadata` carries
 * per-pulse detail, `rootId` and `layer_path` are workspace-anchored.
 */
export const VOLATILE_NODE_COLUMNS = [
  // Measured volatile: differ on 26-93% of shared ids across two adjacent commits.
  'metadata', 'rootId', 'layer_path', 'gravity',
  // TIME-DEPENDENT, and classified by READING THE CODE rather than by the measurement, because the
  // measurement is blind to them: both layers were analyzed minutes apart, so anything derived from
  // wall-clock time was identical by construction and scored 0% volatile.
  //
  // `reflector.ts` computes `tenureDays = Math.floor((now - earliestTime) / 86400)` — `now` is the
  // analysis moment, so two layers built on different days differ on EVERY file. `churn_count_90d`
  // is a rolling 90-day window with the same property, and `entropy_score` derives from the same
  // block. `kinetic` is the JSON blob that CARRIES `tenureDays`, so it inherits the volatility
  // despite measuring 0% — it is the clearest case of a column the numbers would have misfiled.
  'kinetic', 'blame_age_days', 'churn_count_90d', 'entropy_score',
] as const;

/**
 * Columns identical on every shared id across two adjacent layers, and therefore safe to hash.
 *
 * `id` is deliberately absent: it keys the SLOT, not the content. Two layers holding the same symbol
 * at the same id is the case dedup exists for, and putting the id in the hash would not prevent
 * that — but the id is how a slot finds its content, so it belongs on the slot side of the join.
 */
export const CONTENT_NODE_COLUMNS = [
  'fingerprint', 'canonicalKind', 'canonicalRank', 'semantic_kind', 'name', 'file',
  'lineStart', 'lineEnd', 'parentId', 'namespaceId', 'unitId', 'structureId',
  'depth', 'risk', 'complexity', 'isEntryPoint', 'visibility', 'dna', 'signature',
  // Route/request facts: 0% volatile, but on WEAK evidence — only 4 of 4,370 rows are non-null on
  // this repository, and a column that is null everywhere trivially never differs. They describe
  // what the code declares, so stability is the reasonable reading; re-measure on a subject with
  // real routes before relying on it.
  'is_route', 'is_request', 'http_method', 'http_path', 'http_url', 'last_author',
  // The type a variable is declared with (todo29#P3b). Content, and on strong grounds rather than
  // the weak ones above: it is read off the declaration, so it can only change when the declaration
  // text changes — which changes the fingerprint and therefore the content row anyway.
  'instance_of', 'instance_of_call', 'declared_return', 'object_paths',
] as const;

/** Every node column the layer schema accounts for. A column in neither list is unclassified. */
export const ALL_LAYERED_NODE_COLUMNS = [
  'id', ...CONTENT_NODE_COLUMNS, ...VOLATILE_NODE_COLUMNS,
] as const;

/** True when a column may be hashed into a layer's content key. */
export const isContentColumn = (column: string): boolean =>
  (CONTENT_NODE_COLUMNS as readonly string[]).includes(column);

/**
 * Edge columns a layer stores, split the same way as nodes (ADR 0081).
 *
 * An edge is almost entirely stable content: both endpoints, its type and category, and where it
 * was written. Only `confidence` and `weight` are recomputed by a pulse — ranking and binder passes
 * move them for edges nobody touched — so those are the slot half, mirroring `gravity` on the node
 * side. `pulseId` is bookkeeping and belongs to neither.
 *
 * Independently measured at 97.7% of edge rows identical between two adjacent commits, against
 * 91.8% for nodes, so addressing pays at least as well here.
 */
export const VOLATILE_EDGE_COLUMNS = ['weight', 'confidence'] as const;

export const CONTENT_EDGE_COLUMNS = [
  'sourceId', 'targetId', 'category', 'type', 'lineNumber', 'properties',
] as const;

export const ALL_LAYERED_EDGE_COLUMNS = ['id', ...CONTENT_EDGE_COLUMNS, ...VOLATILE_EDGE_COLUMNS] as const;

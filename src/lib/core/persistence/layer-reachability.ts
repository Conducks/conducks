/**
 * Conducks — which layers a vault must keep, and which it may collect (ADR 0035, todo20#P3).
 *
 * ADR 0035's model is git's own: a layer is keyed by COMMIT and a branch name is a POINTER to one.
 * The consequence that makes the whole design affordable is that a commit is immutable, so a
 * commit-keyed layer can never go stale — it never needs refreshing or invalidating. What it does
 * need is COLLECTING, because branches are cheap and frequently abandoned, and a layer nothing
 * points at is unreachable storage.
 *
 * Kept as pure functions over plain data, holding no database and no git, because reachability is
 * the part with the interesting failure modes and it has to be assertable directly. `git
 * for-each-ref` and the vault both live behind the caller.
 */

/** A layer's kind. `uncommitted` is the ONE mutable layer; everything else is frozen by its commit. */
export type LayerKind = 'uncommitted' | 'commit';

export interface LayerRow {
  layerId: string;
  kind: LayerKind;
  /** The commit this layer describes. Null only for `uncommitted`, which has no commit of its own. */
  commitHash: string | null;
}

/**
 * The id of the single mutable layer: the working tree and index, over whatever commit is checked
 * out. It is the only layer a pulse rewrites, and the only one that can be wrong.
 */
export const UNCOMMITTED_LAYER = 'uncommitted';

/** The layer id for a commit. Lower-cased so a caller passing an upper-case sha still matches. */
export const layerIdForCommit = (commitHash: string): string => `commit::${commitHash.toLowerCase()}`;

/**
 * Which layers may be deleted, given every commit that git currently has a pointer to.
 *
 * `pointedAt` is the set of commit hashes `git for-each-ref` resolves to — branches, tags, HEAD.
 * A layer survives when something still names its commit.
 *
 * THREE THINGS ARE NEVER COLLECTED, and each is a way this could quietly destroy a working vault:
 *
 *  1. `uncommitted` — it has no commit, so a naive "is your commit pointed at?" test collects it
 *     every time. It is the layer holding the user's current work. Matched by ID
 *     ALONE: a `kind !== 'uncommitted'` filter was written beside it and removed, because no test
 *     could be made to fail without it — the id check and the null-commit check between them cover
 *     every case a `kind` check would. Belt-and-braces that cannot be shown to bite is just a line
 *     the next reader has to reason about.
 *  2. The ACTIVE layer — whatever a reader is answering from right now. Collecting it would empty
 *     the graph mid-session, and the emptiness would read as "this project has no symbols" rather
 *     than as a fault (CONDUCKS-13).
 *  3. Any layer whose `commitHash` is null or empty — it cannot be matched against a pointer, so
 *     the honest answer is "unknown", and deleting on unknown is how data is lost. A layer that
 *     cannot prove it is unreachable is kept.
 *
 * An EMPTY `pointedAt` collects nothing rather than everything. That is the important direction:
 * `git for-each-ref` returning nothing means git could not answer — a corrupt repository, a
 * permissions failure, a non-repository — and treating silence as "no branch points anywhere" would
 * delete every commit layer in the vault at exactly the moment git is least trustworthy.
 */
export function collectableLayers(
  layers: readonly LayerRow[],
  pointedAt: ReadonlySet<string>,
  activeLayerId: string,
): string[] {
  if (pointedAt.size === 0) return [];

  const pointed = new Set([...pointedAt].map(h => h.toLowerCase()));
  return layers
    .filter(l => l.layerId !== UNCOMMITTED_LAYER)
    .filter(l => l.layerId !== activeLayerId)
    .filter(l => !!l.commitHash)
    .filter(l => !pointed.has(l.commitHash!.toLowerCase()))
    .map(l => l.layerId);
}

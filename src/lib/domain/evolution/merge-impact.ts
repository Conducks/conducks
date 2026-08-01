import { diffLayers, type LayerNode } from "@/lib/domain/evolution/layer-diff.js";

/**
 * Conducks — three-way semantic merge impact (ADR 0035, todo20#P4).
 *
 * The question git cannot answer. Git merges TEXT: two branches editing different files merge
 * cleanly, and it is right about the text every time. What it cannot see is that one side changed a
 * function's shape while the other side changed something that CALLS it — both hunks apply, the
 * merge is clean, and the result is broken.
 *
 * That is the whole reason a structural graph is worth keeping per ref: `merge-base`, `mine` and
 * `theirs` are three layers, and the collision is a graph fact rather than a textual one.
 *
 * Pure over three layers plus a caller lookup, holding no database and no git. The lookup is a
 * PARAMETER rather than a graph reference because callers come from different places depending on
 * what is stored — today the working tree's graph, and a layer's own edges once those exist — and
 * the classification should not have to change when that does.
 */

export interface MergeCollision {
  /** The symbol whose change is at issue. */
  id: string;
  kind:
    /** Both sides changed the same symbol. Git may or may not see this, depending on the text. */
    | 'both-changed'
    /** One side changed a symbol; the other changed something that calls it. Git sees NOTHING. */
    | 'changed-under-caller'
    /** One side deleted a symbol the other side's change still depends on. */
    | 'removed-under-caller';
  side: 'mine' | 'theirs' | 'both';
  /** The callers implicated, when the collision is about one. */
  callers?: string[];
}

export interface MergeImpact {
  collisions: MergeCollision[];
  /** Symbols changed on exactly one side with nothing depending on them — the safe majority. */
  cleanChanges: number;
  /**
   * Symbols where a fingerprint was missing, so "did this change?" could not be answered.
   *
   * Surfaced rather than folded into "clean". A merge report that quietly counts unproven symbols
   * as safe is the ADR 0044 failure in the most expensive possible place.
   */
  incomparable: number;
}

/** Who calls a symbol. Returns ids; an unknown symbol yields none. */
export type CallerLookup = (id: string) => readonly string[];

/**
 * What breaks if these two branches merge.
 *
 * Both sides are compared against the MERGE BASE rather than against each other, which is what makes
 * this three-way rather than a diff: a symbol both branches changed identically is not a collision,
 * and comparing mine-to-theirs directly cannot tell that from a genuine disagreement.
 *
 * `changed-under-caller` is the finding worth having. The other two are cases git usually catches;
 * this one it cannot see by construction, because the two edits are in different files and both
 * apply cleanly.
 */
export function mergeImpact(
  base: readonly LayerNode[],
  mine: readonly LayerNode[],
  theirs: readonly LayerNode[],
  callersOf: CallerLookup,
): MergeImpact {
  const dMine = diffLayers(base, mine);
  const dTheirs = diffLayers(base, theirs);

  // Keyed by id, VALUED by the resulting fingerprint — because "both sides changed it" is not yet a
  // collision. Two branches making the SAME edit merge cleanly, and only the resulting structure can
  // tell that from a genuine disagreement. Comparing the fact of change alone reported a conflict on
  // every symbol two branches happened to fix identically.
  const changedTo = (d: typeof dMine) => new Map(d.changed.map(c => [c.id, c.to.fingerprint ?? null]));
  const changedIn = (d: typeof dMine) => new Set(d.changed.map(c => c.id));
  const removedIn = (d: typeof dMine) => new Set(d.removed.map(r => r.id));
  const myChanged = changedIn(dMine);
  const theirChanged = changedIn(dTheirs);
  const myRemoved = removedIn(dMine);
  const theirRemoved = removedIn(dTheirs);

  const collisions: MergeCollision[] = [];
  const flagged = new Set<string>();

  // 1. Both sides touched the same symbol AND landed somewhere different.
  const myResult = changedTo(dMine);
  const theirResult = changedTo(dTheirs);
  for (const id of myChanged) {
    if (!theirChanged.has(id)) continue;
    if (myResult.get(id) === theirResult.get(id)) { flagged.add(id); continue; }   // same edit, clean
    collisions.push({ id, kind: 'both-changed', side: 'both' });
    flagged.add(id);
  }

  /**
   * 2. One side changed a symbol; the other changed one of its CALLERS.
   *
   * Deliberately asymmetric per side, and the `side` reported is the one that changed the SYMBOL —
   * because that is the edit whose contract moved, and the one a reviewer has to look at first.
   */
  const underCaller = (changed: Set<string>, otherChanged: Set<string>, side: 'mine' | 'theirs') => {
    for (const id of changed) {
      if (flagged.has(id)) continue;                 // already reported as both-changed
      const callers = callersOf(id).filter(c => otherChanged.has(c));
      if (callers.length) {
        collisions.push({ id, kind: 'changed-under-caller', side, callers: [...callers] });
        flagged.add(id);
      }
    }
  };
  underCaller(myChanged, theirChanged, 'mine');
  underCaller(theirChanged, myChanged, 'theirs');

  // 3. One side removed a symbol the other side's change depends on.
  const removedUnder = (removed: Set<string>, otherChanged: Set<string>, side: 'mine' | 'theirs') => {
    for (const id of removed) {
      if (flagged.has(id)) continue;
      const callers = callersOf(id).filter(c => otherChanged.has(c));
      if (callers.length) {
        collisions.push({ id, kind: 'removed-under-caller', side, callers: [...callers] });
        flagged.add(id);
      }
    }
  };
  removedUnder(myRemoved, theirChanged, 'mine');
  removedUnder(theirRemoved, myChanged, 'theirs');

  const touched = new Set([...myChanged, ...theirChanged, ...myRemoved, ...theirRemoved]);
  return {
    collisions,
    cleanChanges: [...touched].filter(id => !flagged.has(id)).length,
    incomparable: dMine.incomparable + dTheirs.incomparable,
  };
}

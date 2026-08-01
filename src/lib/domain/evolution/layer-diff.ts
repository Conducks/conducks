/**
 * Conducks — what differs between two layers (ADR 0035, todo20#P4).
 *
 * NOT the same question as `conducks drift`, and the difference is the point. Drift compares two
 * PULSES — "what changed between my last two analyses" — which is a question about time and is
 * answered from `node_history`. This compares two LAYERS: "what does my branch contain that its
 * merge target does not", which is a question about refs and is answerable WITHOUT checking either
 * one out.
 *
 * Pure over plain rows, holding no database and no git, because the classification is the part with
 * the interesting edges — a symbol that moved file is neither added nor removed, and calling it both
 * is the mistake that makes a diff unreadable.
 */

export interface LayerNode {
  id: string;
  /** Structural identity. Null when it was never computed — which is NOT the same as "unchanged". */
  fingerprint?: string | null;
  name?: string | null;
  file?: string | null;
}

export interface LayerDiff {
  added: LayerNode[];
  removed: LayerNode[];
  /** Same id, different structure. */
  changed: Array<{ id: string; from: LayerNode; to: LayerNode }>;
  /** Same structure, different id — a rename or a move. Reported as ONE fact, not as add + remove. */
  moved: Array<{ from: LayerNode; to: LayerNode }>;
  /**
   * Symbols where a fingerprint was missing on one side, so structural comparison could not run.
   *
   * Counted rather than silently folded into "unchanged". A null fingerprint on both sides passes a
   * `!==` test in JS and reads as stable — the exact shape ADR 0044 was written about, where a
   * comparison that never ran reported a clean verdict.
   */
  incomparable: number;
}

/**
 * Diff two layers by id first, then by fingerprint for whatever is left over.
 *
 * ORDER MATTERS. Matching by id first means a symbol that stayed put is never considered for a move,
 * so a rename cannot steal an identity from a symbol that still exists under its own id. Only the
 * genuinely unmatched remainder is offered to the fingerprint pass.
 *
 * A fingerprint match is only trusted when it is UNIQUE on both sides. Two symbols sharing a
 * structure — an overload, a generated pair, two identical one-line wrappers — would otherwise pair
 * up arbitrarily and report a move nobody made. Ambiguity falls back to add + remove, which is the
 * honest answer: something left, something arrived, and this cannot prove they are the same thing.
 */
export function diffLayers(from: readonly LayerNode[], to: readonly LayerNode[]): LayerDiff {
  const byIdFrom = new Map(from.map(n => [n.id, n]));
  const byIdTo = new Map(to.map(n => [n.id, n]));

  const changed: LayerDiff['changed'] = [];
  let incomparable = 0;

  for (const [id, a] of byIdFrom) {
    const b = byIdTo.get(id);
    if (!b) continue;
    if (!a.fingerprint || !b.fingerprint) { incomparable++; continue; }
    if (a.fingerprint !== b.fingerprint) changed.push({ id, from: a, to: b });
  }

  const goneIds = [...byIdFrom.keys()].filter(id => !byIdTo.has(id));
  const newIds = [...byIdTo.keys()].filter(id => !byIdFrom.has(id));

  // Unique fingerprints only — see above. A structure appearing twice on either side is not a
  // usable identity.
  const uniqueByPrint = (nodes: LayerNode[]) => {
    const counts = new Map<string, number>();
    for (const n of nodes) if (n.fingerprint) counts.set(n.fingerprint, (counts.get(n.fingerprint) ?? 0) + 1);
    const out = new Map<string, LayerNode>();
    for (const n of nodes) if (n.fingerprint && counts.get(n.fingerprint) === 1) out.set(n.fingerprint, n);
    return out;
  };
  const goneByPrint = uniqueByPrint(goneIds.map(id => byIdFrom.get(id)!));
  const newByPrint = uniqueByPrint(newIds.map(id => byIdTo.get(id)!));

  const moved: LayerDiff['moved'] = [];
  const movedFrom = new Set<string>();
  const movedTo = new Set<string>();
  for (const [print, a] of goneByPrint) {
    const b = newByPrint.get(print);
    if (!b) continue;
    moved.push({ from: a, to: b });
    movedFrom.add(a.id);
    movedTo.add(b.id);
  }

  return {
    added: newIds.filter(id => !movedTo.has(id)).map(id => byIdTo.get(id)!),
    removed: goneIds.filter(id => !movedFrom.has(id)).map(id => byIdFrom.get(id)!),
    changed,
    moved,
    incomparable,
  };
}

/** True when the two layers are structurally identical — nothing added, removed, changed or moved. */
export const layersAgree = (d: LayerDiff): boolean =>
  d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0 && d.moved.length === 0;

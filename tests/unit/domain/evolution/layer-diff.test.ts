import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { layerIdForCommit } from '@/lib/core/persistence/layer-reachability.js';
import { diffLayers, layersAgree, type LayerNode } from '@/lib/domain/evolution/layer-diff.js';

/**
 * Comparing two LAYERS (ADR 0035, todo20#P4) — not the same question as `conducks drift`.
 *
 * Drift compares two PULSES, which is a question about time answered from `node_history`. This
 * compares two refs — "what does my branch contain that its merge target does not" — and it is
 * answerable without checking either one out.
 */
const n = (id: string, fingerprint: string | null, over: Partial<LayerNode> = {}): LayerNode =>
  ({ id, fingerprint, name: id.split('::').pop(), file: id.split('::')[0], ...over });

describe('diffing two layers', () => {
  it('reports nothing for identical layers', () => {
    const layer = [n('a.ts::x', 'f1'), n('b.ts::y', 'f2')];
    const d = diffLayers(layer, layer);
    expect(layersAgree(d)).toBe(true);
    expect(d).toMatchObject({ added: [], removed: [], changed: [], moved: [], incomparable: 0 });
  });

  it('reports an added and a removed symbol', () => {
    const d = diffLayers([n('a.ts::gone', 'f1')], [n('a.ts::fresh', 'f2')]);
    expect(d.removed.map(x => x.id)).toEqual(['a.ts::gone']);
    expect(d.added.map(x => x.id)).toEqual(['a.ts::fresh']);
    expect(layersAgree(d)).toBe(false);
  });

  it('reports a symbol whose structure changed under the same id', () => {
    const d = diffLayers([n('a.ts::x', 'before')], [n('a.ts::x', 'after')]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({ id: 'a.ts::x' });
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  /**
   * The classification that makes a diff readable. A symbol that moved file is ONE fact, not an
   * addition plus an unrelated removal — reporting it as two is what makes a rename look like
   * churn.
   */
  it('reports a move as one fact, not as an add plus a remove', () => {
    const d = diffLayers([n('old/a.ts::x', 'same')], [n('new/a.ts::x', 'same')]);
    expect(d.moved).toHaveLength(1);
    expect(d.moved[0].from.id).toBe('old/a.ts::x');
    expect(d.moved[0].to.id).toBe('new/a.ts::x');
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  /**
   * Order matters: id-matching runs FIRST, so a symbol that stayed put is never a move candidate
   * and a newcomer cannot steal its identity.
   */
  it('does not call it a move when the symbol still exists under its own id', () => {
    const from = [n('a.ts::x', 'same')];
    const to = [n('a.ts::x', 'same'), n('b.ts::copy', 'same')];
    const d = diffLayers(from, to);
    expect(d.moved).toEqual([]);
    expect(d.added.map(x => x.id)).toEqual(['b.ts::copy']);
  });

  /**
   * An AMBIGUOUS fingerprint is not an identity. Two symbols sharing a structure — an overload, a
   * generated pair, two identical one-line wrappers — would otherwise pair up arbitrarily and
   * report a move nobody made. Add + remove is the honest answer.
   */
  it('refuses to pair symbols on a fingerprint that is not unique', () => {
    const d = diffLayers(
      [n('a.ts::one', 'dup'), n('a.ts::two', 'dup')],
      [n('b.ts::three', 'dup'), n('b.ts::four', 'dup')],
    );
    expect(d.moved).toEqual([]);
    expect(d.removed).toHaveLength(2);
    expect(d.added).toHaveLength(2);
  });

  /**
   * A null fingerprint on both sides passes a `!==` test in JS and reads as stable — the exact
   * shape ADR 0044 was written about, where a comparison that never ran reported a clean verdict.
   */
  it('counts an uncomparable symbol instead of calling it unchanged', () => {
    const d = diffLayers([n('a.ts::x', null)], [n('a.ts::x', null)]);
    expect(d.incomparable).toBe(1);
    expect(d.changed).toEqual([]);
    expect(layersAgree(d)).toBe(true);       // nothing is CLAIMED to have changed...
    expect(d.incomparable).toBeGreaterThan(0); // ...but the caller can see it was not proven either
  });

  it('counts it as uncomparable when only one side has a fingerprint', () => {
    expect(diffLayers([n('a.ts::x', 'f1')], [n('a.ts::x', null)]).incomparable).toBe(1);
    expect(diffLayers([n('a.ts::x', null)], [n('a.ts::x', 'f1')]).incomparable).toBe(1);
  });
});

/**
 * End to end on a REAL vault: two layers written through content-addressed storage, then diffed.
 * This is todo20#P4's acceptance — two layers with a genuinely different symbol produce a non-empty
 * drift, asserted on a count that was zero before layers existed.
 */
describe('diffing two layers stored in a real vault', () => {
  const roots: string[] = [];
  const mkRoot = () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-layerdiff-'));
    roots.push(r);
    return r;
  };
  afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

  const row = (id: string, fingerprint: string) => ({
    id, fingerprint, name: id.split('::').pop(), file: id.split('::')[0],
    canonicalKind: 'BEHAVIOR', dna: '{}', gravity: '0.1', metadata: '{}',
  });

  it('produces a NON-EMPTY diff between two stored layers', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.writeLayerNodes(layerIdForCommit('aaa'), [
      row('a.ts::kept', 'k1'), row('a.ts::edited', 'before'), row('a.ts::deleted', 'd1'),
    ]);
    await p.writeLayerNodes(layerIdForCommit('bbb'), [
      row('a.ts::kept', 'k1'), row('a.ts::edited', 'after'), row('a.ts::brandnew', 'n1'),
    ]);

    const from = await p.readLayerNodes(layerIdForCommit('aaa')) as unknown as LayerNode[];
    const to = await p.readLayerNodes(layerIdForCommit('bbb')) as unknown as LayerNode[];
    const d = diffLayers(from, to);

    expect(layersAgree(d)).toBe(false);
    expect(d.changed.map(c => c.id)).toEqual(['a.ts::edited']);
    expect(d.removed.map(x => x.id)).toEqual(['a.ts::deleted']);
    expect(d.added.map(x => x.id)).toEqual(['a.ts::brandnew']);
    await p.close();
  });

  it('agrees when both layers hold the same code', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const same = [row('a.ts::x', 'f1'), row('b.ts::y', 'f2')];
    await p.writeLayerNodes(layerIdForCommit('aaa'), same);
    await p.writeLayerNodes(layerIdForCommit('bbb'), same);

    const d = diffLayers(
      await p.readLayerNodes(layerIdForCommit('aaa')) as unknown as LayerNode[],
      await p.readLayerNodes(layerIdForCommit('bbb')) as unknown as LayerNode[],
    );
    expect(layersAgree(d)).toBe(true);
    expect(d.incomparable).toBe(0);
    await p.close();
  });
});

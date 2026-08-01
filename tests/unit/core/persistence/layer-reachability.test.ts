import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import {
  collectableLayers, layerIdForCommit, UNCOMMITTED_LAYER, type LayerRow,
} from '@/lib/core/persistence/layer-reachability.js';

/**
 * ADR 0035's collection rule (todo20#P3): a layer keyed by commit is immutable and never goes stale,
 * so the only lifecycle it needs is collection — branches are cheap and frequently abandoned, and a
 * layer nothing points at is unreachable storage.
 *
 * The pure half is tested directly because that is where every dangerous mistake lives: collecting
 * the active layer, collecting `uncommitted`, or reading git's silence as "nothing is reachable".
 */
const L = (layerId: string, commitHash: string | null, kind: LayerRow['kind'] = 'commit'): LayerRow =>
  ({ layerId, kind, commitHash });

describe('which layers may be collected', () => {
  const kept = L(layerIdForCommit('aaa'), 'aaa');
  const abandoned = L(layerIdForCommit('bbb'), 'bbb');
  const uncommitted = L(UNCOMMITTED_LAYER, null, 'uncommitted');

  it('collects a layer whose commit nothing points at', () => {
    expect(collectableLayers([kept, abandoned], new Set(['aaa']), UNCOMMITTED_LAYER))
      .toEqual([abandoned.layerId]);
  });

  it('keeps a layer whose commit a branch still names', () => {
    expect(collectableLayers([kept], new Set(['aaa']), UNCOMMITTED_LAYER)).toEqual([]);
  });

  /**
   * `uncommitted` has no commit, so a naive "is your commit pointed at?" test collects it every
   * single time — and it is the layer holding the user's current work.
   */
  it('never collects the uncommitted layer', () => {
    expect(collectableLayers([uncommitted], new Set(['aaa']), layerIdForCommit('aaa'))).toEqual([]);
  });

  /**
   * The id is what protects it, and this pins that: the row carries a real commit nothing points at,
   * so every other filter would collect it. A `kind` check once sat beside the id check and was
   * removed — no test could be made to fail without it.
   */
  it('protects the uncommitted ID even when it carries a collectable commit', () => {
    expect(collectableLayers([L(UNCOMMITTED_LAYER, 'bbb', 'commit')], new Set(['aaa']), 'other'))
      .toEqual([]);
  });

  /** Collecting what a reader is answering from empties the graph mid-session, and reads as "no symbols". */
  it('never collects the ACTIVE layer, even when nothing points at it', () => {
    expect(collectableLayers([abandoned], new Set(['aaa']), abandoned.layerId)).toEqual([]);
  });

  /**
   * The direction that matters. An empty pointer set means git could not ANSWER — corrupt repo,
   * permissions, not a repository — and treating silence as "no branch points anywhere" would delete
   * every commit layer at exactly the moment git is least trustworthy.
   */
  it('collects NOTHING when git returned no pointers at all', () => {
    expect(collectableLayers([abandoned, kept], new Set(), UNCOMMITTED_LAYER)).toEqual([]);
  });

  it('keeps a layer that cannot prove it is unreachable', () => {
    expect(collectableLayers([L('commit::?', null), L('commit::x', '')], new Set(['aaa']), UNCOMMITTED_LAYER))
      .toEqual([]);
  });

  it('matches commit hashes case-insensitively on both sides', () => {
    expect(collectableLayers([L('commit::abc', 'ABC')], new Set(['abc']), UNCOMMITTED_LAYER)).toEqual([]);
    expect(collectableLayers([L('commit::abc', 'abc')], new Set(['ABC']), UNCOMMITTED_LAYER)).toEqual([]);
  });
});

/**
 * The vault half, on a REAL DuckDB file — the table has to survive an open/close cycle, and an
 * existing vault must gain it without disturbing anything.
 */
describe('the layer registry in a real vault', () => {
  const roots: string[] = [];
  const mkRoot = () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-layers-'));
    roots.push(r);
    return r;
  };
  afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

  it('records, lists and collects layers', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.recordLayer({ layerId: UNCOMMITTED_LAYER, kind: 'uncommitted' });
    await p.recordLayer({ layerId: layerIdForCommit('aaa'), kind: 'commit', commitHash: 'aaa', branch: 'main' });
    await p.recordLayer({ layerId: layerIdForCommit('bbb'), kind: 'commit', commitHash: 'bbb', branch: 'gone' });

    expect((await p.listLayers()).map(l => l.layerId).sort())
      .toEqual([UNCOMMITTED_LAYER, layerIdForCommit('aaa'), layerIdForCommit('bbb')].sort());

    // `bbb`'s branch was deleted; `git for-each-ref` now resolves to `aaa` only.
    expect(await p.collectUnreachableLayers(new Set(['aaa']))).toEqual([layerIdForCommit('bbb')]);
    expect((await p.listLayers()).map(l => l.layerId).sort())
      .toEqual([UNCOMMITTED_LAYER, layerIdForCommit('aaa')].sort());
    await p.close();
  });

  /** An old vault has no `active_layer` row at all, and must read correctly rather than as unset. */
  it('defaults the active layer to `uncommitted` on a vault that predates layers', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    expect(await p.activeLayerId()).toBe(UNCOMMITTED_LAYER);
    await p.setActiveLayer(layerIdForCommit('aaa'));
    expect(await p.activeLayerId()).toBe(layerIdForCommit('aaa'));
    await p.close();
  });

  it('survives a close and reopen', async () => {
    const root = mkRoot();
    const a = new SynapsePersistence(root, false);
    await a.recordLayer({ layerId: layerIdForCommit('aaa'), kind: 'commit', commitHash: 'aaa' });
    await a.setActiveLayer(layerIdForCommit('aaa'));
    await a.close();

    const b = new SynapsePersistence(root, false);
    expect(await b.activeLayerId()).toBe(layerIdForCommit('aaa'));
    expect((await b.listLayers()).map(l => l.commitHash)).toEqual(['aaa']);
    await b.close();
  });
});

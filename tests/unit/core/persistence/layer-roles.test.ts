import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { resolveLayerRole, layerRoleRefusal } from '@/lib/core/persistence/layer-roles.js';
import { UNCOMMITTED_LAYER, layerIdForCommit } from '@/lib/core/persistence/layer-reachability.js';

/**
 * The three layer ROLES (ADR 0035, todo20#P3).
 *
 * ADR 0035 named these deliberately: `main`/`branch`/`uncommitted` was the first draft and privileges
 * `main`, which is the wrong baseline for anyone branching off `develop`. The roles are relative to
 * where you are standing, and `target` is resolved per branch and NEVER assumed.
 */
describe('resolving a layer role', () => {
  const git = (headCommit: string | null, targetCommit: string | null) => ({ headCommit, targetCommit });

  it('resolves the three roles when git can answer', () => {
    const g = git('aaa', 'bbb');
    expect(resolveLayerRole('uncommitted', g)).toBe(UNCOMMITTED_LAYER);
    expect(resolveLayerRole('current', g)).toBe(layerIdForCommit('aaa'));
    expect(resolveLayerRole('target', g)).toBe(layerIdForCommit('bbb'));
  });

  /**
   * ADR 0035: "there is no fallback when the target cannot be resolved — the command says so and
   * refuses". Answering `current` for a failed `target` is a diff against the wrong baseline.
   */
  it('returns null for target rather than falling back to current', () => {
    const g = git('aaa', null);
    expect(resolveLayerRole('target', g)).toBeNull();
    expect(resolveLayerRole('current', g)).toBe(layerIdForCommit('aaa'));
  });

  it('returns null for current when HEAD resolves to nothing', () => {
    expect(resolveLayerRole('current', git(null, null))).toBeNull();
  });

  /**
   * The case ADR 0035 protects hardest. A project with NO git must keep answering every question it
   * answers today — so `uncommitted`, which is the working tree, resolves even when git cannot say
   * anything at all.
   */
  it('always resolves uncommitted, even with no git whatsoever', () => {
    expect(resolveLayerRole('uncommitted', git(null, null))).toBe(UNCOMMITTED_LAYER);
  });

  it('never guesses `main`', () => {
    expect(JSON.stringify(resolveLayerRole('target', git('aaa', null)))).not.toContain('main');
  });

  describe('the refusal message', () => {
    it('is silent when the role resolved', () => {
      expect(layerRoleRefusal('target', git('aaa', 'bbb'))).toBeNull();
    });

    /** A message that only says "could not resolve" sends the reader nowhere. */
    it('tells the user what to do about an unresolvable target', () => {
      const msg = layerRoleRefusal('target', git('aaa', null))!;
      expect(msg).toMatch(/upstream/);
      expect(msg).toMatch(/will not guess/);
    });

    it('distinguishes a repository with no commits from an unresolvable target', () => {
      expect(layerRoleRefusal('current', git(null, null))).toMatch(/no commits yet/);
    });
  });
});

/**
 * The read entry point. `uncommitted` reads `nodes`, every other role reads layer storage — not a
 * special case so much as the model, since ADR 0035 separates the one mutable layer from the many
 * immutable ones and they live in different tables for that reason.
 */
describe('reading through a role', () => {
  const roots: string[] = [];
  const mkRoot = () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-roles-'));
    roots.push(r);
    return r;
  };
  afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

  const node = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: id, canonicalKind: 'BEHAVIOR', canonicalRank: 7, filePath: `/p/${id}.ts`, properties: {}, ...over,
  });

  it('reads uncommitted from `nodes` and a commit role from layer storage', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.saveNodes([node('/p/a.ts::live')], 'pulse_1');
    await p.writeLayerNodes(layerIdForCommit('aaa'), [{ id: '/p/a.ts::archived', name: 'archived' }]);

    const live = await p.readNodesForRole('uncommitted', { headCommit: 'aaa', targetCommit: null });
    const archived = await p.readNodesForRole('current', { headCommit: 'aaa', targetCommit: null });

    expect(live.map(r => r.id)).toEqual(['/p/a.ts::live']);
    expect(archived.map(r => r.id)).toEqual(['/p/a.ts::archived']);
    await p.close();
  });

  it('REFUSES an unresolvable role instead of answering from another one', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.saveNodes([node('/p/a.ts::live')], 'pulse_1');
    await expect(p.readNodesForRole('target', { headCommit: 'aaa', targetCommit: null }))
      .rejects.toThrow(/will not guess/);
    await p.close();
  });

  /**
   * "Not built yet" is a different fact from "could not resolve", and the caller has to be able to
   * tell them apart — one means run a pulse, the other means git cannot answer.
   */
  it('returns empty for a resolvable role this vault has never stored', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    expect(await p.readNodesForRole('current', { headCommit: 'never-pulsed', targetCommit: null })).toEqual([]);
    await p.close();
  });

  it('reads uncommitted with no git at all', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.saveNodes([node('/p/a.ts::live')], 'pulse_1');
    expect(await p.readNodesForRole('uncommitted', { headCommit: null, targetCommit: null })).toHaveLength(1);
    await p.close();
  });
});

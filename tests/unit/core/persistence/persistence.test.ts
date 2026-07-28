/**
 * todo02 Phase 2 — SynapsePersistence is the DuckDB write path every analyze pulse goes through.
 * A silent bug here corrupts the graph rather than crashing (nothing else re-derives it), so the
 * transactional guarantees are the highest-value thing to pin: does an aborted/failed write really
 * leave the vault untouched, not a half-written one.
 *
 * Each test gets its own temp vault (mkdtempSync) — DuckDB's file lock is exclusive, so sharing a
 * vault across tests would serialize on real contention rather than testing logic. Uses real
 * SynapsePersistence + real DuckDB throughout, per CONDUCKS-5 (no persistence mock) and the vault
 * lock note in docs/memory.md.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

function tmpVault(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-persistence-'));
}

describe('SynapsePersistence', () => {
  let vaultPath: string;
  let persistence: SynapsePersistence;

  beforeEach(() => {
    vaultPath = tmpVault();
    persistence = new SynapsePersistence(vaultPath);
  });

  afterEach(async () => {
    await persistence.close();
    fs.rmSync(vaultPath, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------------------------
  // Pulse transaction (beginPulse / abortPulse)
  // ---------------------------------------------------------------------------------------------
  describe('beginPulse / abortPulse', () => {
    it('rolls back every write made during the pulse on abort', async () => {
      await persistence.beginPulse();
      await persistence.saveNodes(
        [{ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );
      await persistence.abortPulse();

      const rows = await persistence.query('SELECT id FROM nodes');
      expect(rows).toHaveLength(0);
    });

    it('leaves prior committed data untouched when a later pulse aborts', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::keep', label: 'function', properties: { name: 'keep', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse0'
      );

      await persistence.beginPulse();
      await persistence.saveNodes(
        [{ id: 'src/a.ts::discard', label: 'function', properties: { name: 'discard', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );
      await persistence.abortPulse();

      const rows = await persistence.query<{ id: string }>('SELECT id FROM nodes');
      expect(rows.map(r => r.id)).toEqual(['src/a.ts::keep']);
    });

    it('is a no-op to abort when no pulse is open', async () => {
      await expect(persistence.abortPulse()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------------------------
  // saveNodes / saveEdges — transactional rollback on failure
  //
  // Uses a circular `dna` object to force `JSON.stringify` to throw mid-batch, deterministically,
  // without touching DuckDB internals. This is the same failure SHAPE as a bad row: the error
  // surfaces after some rows in the batch already succeeded, and the question is whether the
  // OWNED transaction (saveNodes/saveEdges run their own BEGIN/COMMIT when not inside a pulse)
  // rolls the whole batch back rather than committing the partial write.
  // ---------------------------------------------------------------------------------------------
  describe('saveNodes — rollback on mid-batch failure', () => {
    it('leaves the nodes table empty when a later node in the batch fails to serialize', async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const good = { id: 'src/a.ts::good', label: 'function', properties: { name: 'good', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } };
      const bad = { id: 'src/a.ts::bad', label: 'function', properties: { name: 'bad', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR', dna: circular } };

      await expect(persistence.saveNodes([good, bad], 'pulse1')).rejects.toThrow();

      const rows = await persistence.query('SELECT id FROM nodes');
      expect(rows).toHaveLength(0);
    });
  });

  describe('saveEdges — rollback on mid-batch failure', () => {
    it('leaves the edges table empty when a later edge in the batch fails to serialize', async () => {
      await persistence.saveNodes(
        [
          { id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } },
          { id: 'src/b.ts::b', label: 'function', properties: { name: 'b', filePath: 'src/b.ts', canonicalKind: 'BEHAVIOR' } },
        ],
        'pulse1'
      );

      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const good = { id: 'e-good', sourceId: 'src/a.ts::a', targetId: 'src/b.ts::b', type: 'CALLS', confidence: 1, properties: { line: 1 } };
      const bad = { id: 'e-bad', sourceId: 'src/a.ts::a', targetId: 'src/b.ts::b', type: 'CALLS', confidence: 1, properties: circular };

      await expect(persistence.saveEdges([good, bad], 'pulse1')).rejects.toThrow();

      const rows = await persistence.query('SELECT id FROM edges');
      expect(rows).toHaveLength(0);
    });
  });

  describe('updateRanks — rollback on malformed entry', () => {
    it('leaves gravity unchanged for a prior valid entry when a later entry is malformed', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );

      await expect(
        persistence.updateRanks([
          { id: 'src/a.ts::foo', gravity: 0.9 },
          // `.id.toLowerCase()` on this entry throws — no such id exists, this is the failure trigger.
          { id: undefined as unknown as string, gravity: 0.1 },
        ])
      ).rejects.toThrow();

      const rows = await persistence.query<{ gravity: number }>("SELECT gravity FROM nodes WHERE id = 'src/a.ts::foo'");
      expect(rows[0].gravity).toBe(0);
    });
  });

  describe('updateEdgeTargets — rollback on malformed entry', () => {
    it('leaves a prior valid rebind unapplied when a later entry is malformed', async () => {
      await persistence.saveNodes(
        [
          { id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } },
          { id: 'src/b.ts::b', label: 'function', properties: { name: 'b', filePath: 'src/b.ts', canonicalKind: 'BEHAVIOR' } },
          { id: 'src/c.ts::c', label: 'function', properties: { name: 'c', filePath: 'src/c.ts', canonicalKind: 'BEHAVIOR' } },
        ],
        'pulse1'
      );
      await persistence.saveEdges(
        [{ id: 'e1', sourceId: 'src/a.ts::a', targetId: 'src/b.ts::b', type: 'CALLS', confidence: 1, properties: {} }],
        'pulse1'
      );

      await expect(
        persistence.updateEdgeTargets([
          { id: 'e1', newTargetId: 'src/c.ts::c' },
          // `.newTargetId.toLowerCase()` throws — the failure trigger.
          { id: 'e1', newTargetId: undefined as unknown as string },
        ])
      ).rejects.toThrow();

      const rows = await persistence.query<{ targetId: string }>("SELECT targetId FROM edges WHERE id = 'e1'");
      expect(rows[0].targetId).toBe('src/b.ts::b');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // purgeUnits
  // ---------------------------------------------------------------------------------------------
  describe('purgeUnits', () => {
    it('deletes nodes, edges, and file hashes scoped to the given units, and nothing else', async () => {
      await persistence.saveNodes(
        [
          { id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR', unitId: 'src/a.ts::unit' } },
          { id: 'src/b.ts::b', label: 'function', properties: { name: 'b', filePath: 'src/b.ts', canonicalKind: 'BEHAVIOR', unitId: 'src/b.ts::unit' } },
        ],
        'pulse1'
      );
      await persistence.saveEdges(
        [{ id: 'e1', sourceId: 'src/a.ts::a', targetId: 'src/b.ts::b', type: 'CALLS', confidence: 1, properties: {} }],
        'pulse1'
      );
      await persistence.setFileHash('src/a.ts', 'hash-a', 10);
      await persistence.setFileHash('src/b.ts', 'hash-b', 10);

      await persistence.purgeUnits(['src/a.ts::unit']);

      const nodes = await persistence.query<{ id: string }>('SELECT id FROM nodes');
      expect(nodes.map(n => n.id)).toEqual(['src/b.ts::b']);

      const edges = await persistence.query('SELECT id FROM edges');
      expect(edges).toHaveLength(0); // edge sourced from the purged unit is gone too

      expect(await persistence.getFileHash('src/a.ts')).toBeUndefined();
      expect(await persistence.getFileHash('src/b.ts')).toBe('hash-b');

      // NOTE: every node above is a CHILD — it carries a `unitId`. The unit's OWN row does not, and
      // that gap is the whole of the next test.
    });

    it('deletes the UNIT row itself, whose own unitId is NULL', async () => {
      // A unit's row IS the unit, so it belongs to no unit and `unitId` is NULL. Matching only on
      // `unitId` deleted every child and left that row behind — and because the row survived,
      // `analyze`'s reconcile found the same file "no longer discoverable" on EVERY pulse, purged
      // its already-absent children, and found it again next time. Unbounded churn against a store
      // that never reclaims deleted row versions (ADR 0037), while the graph kept answering with
      // 44 files that were not on disk. The fixture that missed it built children only.
      await persistence.saveNodes(
        [
          { id: 'src/gone.ts::unit', label: 'file', properties: { name: 'gone.ts', filePath: 'src/gone.ts', canonicalKind: 'UNIT' } },
          { id: 'src/gone.ts::fn', label: 'function', properties: { name: 'fn', filePath: 'src/gone.ts', canonicalKind: 'BEHAVIOR', unitId: 'src/gone.ts::unit' } },
        ],
        'pulse1'
      );
      const before = await persistence.query<{ id: string }>('SELECT id FROM nodes');
      expect(before).toHaveLength(2);

      await persistence.purgeUnits(['src/gone.ts::unit']);

      // Both rows, not just the child. A survivor here is re-purged forever.
      expect(await persistence.query('SELECT id FROM nodes')).toHaveLength(0);
    });

    it('is a no-op for an empty unit list', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR', unitId: 'src/a.ts::unit' } }],
        'pulse1'
      );
      await persistence.purgeUnits([]);
      const nodes = await persistence.query('SELECT id FROM nodes');
      expect(nodes).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // pruneTaxonomy (ADR 0013 / todo09 C0)
  // ---------------------------------------------------------------------------------------------
  describe('pruneTaxonomy', () => {
    it('drops DATA unconditionally, drops an ATOM with only structural edges, keeps an ATOM with a reference edge, and reroutes a dropped node\'s reference edge onto its parent', async () => {
      await persistence.saveNodes(
        [
          { id: 'src/a.ts::p', label: 'class', properties: { name: 'p', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } },
          { id: 'src/a.ts::target-x', label: 'function', properties: { name: 'target-x', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } },
          { id: 'src/a.ts::target-y', label: 'function', properties: { name: 'target-y', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } },
          // DATA node — always dropped, even though it carries a reference (CALLS) edge that must reroute onto its parent.
          { id: 'src/a.ts::d', label: 'param', properties: { name: 'd', filePath: 'src/a.ts', canonicalKind: 'DATA', parentId: 'src/a.ts::p' } },
          // ATOM kept — carries a non-structural (CALLS) edge.
          { id: 'src/a.ts::a-kept', label: 'var', properties: { name: 'a-kept', filePath: 'src/a.ts', canonicalKind: 'ATOM', parentId: 'src/a.ts::p' } },
          // ATOM dropped — only a structural (MEMBER_OF) edge to its parent.
          { id: 'src/a.ts::a-dropped', label: 'var', properties: { name: 'a-dropped', filePath: 'src/a.ts', canonicalKind: 'ATOM', parentId: 'src/a.ts::p' } },
        ],
        'pulse1'
      );
      await persistence.saveEdges(
        [
          { id: 'e-d-x', sourceId: 'src/a.ts::d', targetId: 'src/a.ts::target-x', type: 'CALLS', confidence: 1, properties: {} },
          { id: 'e-akept-y', sourceId: 'src/a.ts::a-kept', targetId: 'src/a.ts::target-y', type: 'CALLS', confidence: 1, properties: {} },
          { id: 'e-adropped-p', sourceId: 'src/a.ts::a-dropped', targetId: 'src/a.ts::p', type: 'MEMBER_OF', confidence: 1, properties: {} },
        ],
        'pulse1'
      );

      await persistence.pruneTaxonomy();

      const nodeIds = (await persistence.query<{ id: string }>('SELECT id FROM nodes ORDER BY id')).map(n => n.id);
      expect(nodeIds).toEqual(['src/a.ts::a-kept', 'src/a.ts::p', 'src/a.ts::target-x', 'src/a.ts::target-y'].sort());

      const edges = await persistence.query<{ id: string; sourceId: string; targetId: string }>('SELECT id, sourceId, targetId FROM edges ORDER BY id');
      // The dropped DATA node's edge rerouted onto its parent (p -> target-x); the dropped ATOM's
      // structural edge is gone entirely (no reroute for structural types); the kept ATOM's edge survives untouched.
      expect(edges).toEqual([
        { id: 'e-akept-y', sourceId: 'src/a.ts::a-kept', targetId: 'src/a.ts::target-y' },
        { id: 'e-d-x', sourceId: 'src/a.ts::p', targetId: 'src/a.ts::target-x' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // File hash gate storage
  // ---------------------------------------------------------------------------------------------
  describe('file hashes', () => {
    it('round-trips a hash and reports it case-insensitively (CONDUCKS-4)', async () => {
      await persistence.setFileHash('/Repo/Src/A.ts', 'abc123', 42);
      expect(await persistence.getFileHash('/repo/src/a.ts')).toBe('abc123');
    });

    it('returns undefined for a file never recorded', async () => {
      expect(await persistence.getFileHash('/nowhere.ts')).toBeUndefined();
    });

    it('forgetFileHash removes the record so the file re-parses next time', async () => {
      await persistence.setFileHash('/a.ts', 'abc123', 1);
      await persistence.forgetFileHash('/a.ts');
      expect(await persistence.getFileHash('/a.ts')).toBeUndefined();
    });

    it('getAllFileHashes returns every recorded hash keyed by file', async () => {
      await persistence.setFileHash('/a.ts', 'h-a', 1);
      await persistence.setFileHash('/b.ts', 'h-b', 2);
      const all = await persistence.getAllFileHashes();
      expect(all.get('/a.ts')).toBe('h-a');
      expect(all.get('/b.ts')).toBe('h-b');
      expect(all.size).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // updateRisks
  // ---------------------------------------------------------------------------------------------
  describe('updateRisks', () => {
    it('sets risk from complexity for BEHAVIOR/STRUCTURE/ATOM only, capped at 1.0', async () => {
      await persistence.saveNodes(
        [
          { id: 'src/a.ts::low', label: 'function', properties: { name: 'low', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR', complexity: 5 } },
          { id: 'src/a.ts::high', label: 'function', properties: { name: 'high', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR', complexity: 500 } },
          { id: 'src/a.ts::unit', label: 'module', properties: { name: 'unit', filePath: 'src/a.ts', canonicalKind: 'UNIT', complexity: 500 } },
        ],
        'pulse1'
      );

      await persistence.updateRisks();

      const rows = await persistence.query<{ id: string; risk: number }>('SELECT id, risk FROM nodes ORDER BY id');
      const byId = Object.fromEntries(rows.map(r => [r.id, r.risk]));
      expect(byId['src/a.ts::low']).toBeCloseTo(5 / 50, 5);
      expect(byId['src/a.ts::high']).toBe(1.0); // capped
      expect(byId['src/a.ts::unit']).toBe(0); // UNIT is not in the targeted kind set — untouched from its saveNodes default
    });
  });

  // ---------------------------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------------------------
  describe('clear', () => {
    it('empties nodes, edges, and pulses', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );
      await persistence.run("INSERT INTO pulses (id, timestamp, commitHash, nodeCount, edgeCount, metadata) VALUES ('pulse1', 1, 'h', 1, 0, '{}')");

      await persistence.clear();

      expect(await persistence.query('SELECT * FROM nodes')).toHaveLength(0);
      expect(await persistence.query('SELECT * FROM edges')).toHaveLength(0);
      expect(await persistence.query('SELECT * FROM pulses')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // fetchNodeDeep
  // ---------------------------------------------------------------------------------------------
  describe('fetchNodeDeep', () => {
    it('returns the hydrated node for an existing id, case-insensitively', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::Foo', label: 'function', properties: { name: 'Foo', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );

      const node = await persistence.fetchNodeDeep('SRC/A.TS::FOO');
      expect(node).not.toBeNull();
      expect(node.id).toBe('src/a.ts::foo');
      expect(node.properties.canonicalKind).toBe('BEHAVIOR');
    });

    it('returns null for an id that does not exist', async () => {
      expect(await persistence.fetchNodeDeep('nope::nope')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  // readOnly guard
  // ---------------------------------------------------------------------------------------------
  describe('readOnly guard', () => {
    it('turns every write method into a silent no-op once set', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );
      persistence.setReadOnly(true);

      await expect(
        persistence.saveNodes(
          [{ id: 'src/a.ts::b', label: 'function', properties: { name: 'b', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
          'pulse2'
        )
      ).resolves.toBeUndefined();
      await expect(persistence.clear()).resolves.toBeUndefined();
      await expect(persistence.setFileHash('x', 'y', 1)).resolves.toBeUndefined();

      const rows = await persistence.query('SELECT id FROM nodes');
      expect(rows).toHaveLength(1); // original row survives — clear() and the second saveNodes were no-ops
      expect(await persistence.getFileHash('x')).toBeUndefined();
    });

    it('run() throws instead of silently dropping a raw write on a read-only connection', async () => {
      persistence.setReadOnly(true);
      await expect(persistence.run('DELETE FROM nodes')).rejects.toThrow(/WRITE BLOCKED/);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // connection lifecycle
  // ---------------------------------------------------------------------------------------------
  describe('connection lifecycle', () => {
    it('isConnected() reflects open/close state', async () => {
      expect(persistence.isConnected()).toBe(false);
      await persistence.query('SELECT 1');
      expect(persistence.isConnected()).toBe(true);
      await persistence.close();
      expect(persistence.isConnected()).toBe(false);
    });

    it('re-opens transparently on the next call after close', async () => {
      await persistence.saveNodes(
        [{ id: 'src/a.ts::a', label: 'function', properties: { name: 'a', filePath: 'src/a.ts', canonicalKind: 'BEHAVIOR' } }],
        'pulse1'
      );
      await persistence.close();

      const rows = await persistence.query('SELECT id FROM nodes');
      expect(rows).toHaveLength(1);
    });
  });
});

describe('SynapsePersistence.getInstance', () => {
  it('returns the same instance for the same vault path', () => {
    const vaultPath = tmpVault();
    try {
      const a = SynapsePersistence.getInstance(vaultPath);
      const b = SynapsePersistence.getInstance(vaultPath);
      expect(a).toBe(b);
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true });
    }
  });
});

/**
 * `save()` falls back to the graph's own counts when the caller omits them. It called
 * `graph.nodeCount()` — a method ConducksAdjacencyList does not have; the counts live on the `stats`
 * GETTER. So every caller that omitted the options threw "graph.nodeCount is not a function".
 *
 * That caller was the watcher. Both its auto-pulse and its writer branch call
 * `persistence.save(this.graph.getGraph())` with no options, the watcher's catch logged the
 * TypeError as a pulse error, and the structural delta was never written to the vault. The two call
 * sites that pass counts explicitly never reached the line, which is why it survived unnoticed.
 */
describe('save() without explicit counts — the watcher path', () => {
  let vaultPath: string;
  let p2: SynapsePersistence;

  beforeEach(() => { vaultPath = tmpVault(); p2 = new SynapsePersistence(vaultPath); });
  afterEach(async () => { await p2.close(); fs.rmSync(vaultPath, { recursive: true, force: true }); });

  it('reads the counts off the graph instead of calling a method that does not exist', async () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode({ id: '/r/a.ts::a', label: 'UNIT', properties: { name: 'a', filePath: '/r/a.ts' } } as never);
    graph.addNode({ id: '/r/b.ts::b', label: 'UNIT', properties: { name: 'b', filePath: '/r/b.ts' } } as never);
    graph.addEdge({ id: 'e1', sourceId: '/r/a.ts::a', targetId: '/r/b.ts::b', type: 'IMPORTS', confidence: 1, properties: {} } as never);

    // No options — exactly how watcher.ts calls it.
    await expect(p2.save(graph)).resolves.not.toThrow();

    const pulses = await p2.query('SELECT nodeCount, edgeCount FROM pulses ORDER BY timestamp DESC LIMIT 1');
    expect(Number(pulses[0].nodeCount)).toBe(2);
    expect(Number(pulses[0].edgeCount)).toBe(1);
  });
});

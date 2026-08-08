import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * `statusFromVault()` (todo21#P5).
 *
 * Everything `status()` reports is already a column or a row — the counts are `count(*)`, the
 * framework and last-pulsed commit are rows in `metadata`. Materialising 2,381 nodes and 12,590
 * edges to read three numbers cost a read-only MCP session ~165 MB and 146 ms, which is what
 * `conducks_status` was paying to answer "is my index stale". Measured after this landed: 223 MB
 * down to 104 MB for that tool.
 *
 * The risk is not that the SQL path is slow. It is that it QUIETLY DISAGREES with the graph path —
 * two sources for one fact is how a board starts lying — so the first test holds them equal on the
 * same data rather than asserting either one alone.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-status-'));
  roots.push(r);
  return r;
};

afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

/** A vault with n nodes, m edges and the two metadata rows `status` reads. */
const seed = async (root: string, n: number, m: number): Promise<SynapsePersistence> => {
  const p = new SynapsePersistence(root, false);
  await p.query('SELECT 1');   // force schema creation
  await p.run(`INSERT INTO nodes (id, name, file, canonicalKind)
               SELECT 'n' || i, 'sym' || i, '/repo/f.ts', 'UNIT' FROM range(${n}) t(i)`);
  await p.run(`INSERT INTO edges (id, sourceId, targetId, type)
               SELECT 'e' || i, 'n0', 'n1', 'CALLS' FROM range(${m}) t(i)`);
  await p.run(`INSERT INTO metadata (key, value) VALUES ('framework', 'express')`);
  await p.run(`INSERT INTO metadata (key, value) VALUES ('lastAnalyzedCommit', 'abc123')`);
  return p;
};

const svc = (graph: ConducksAdjacencyList, p: SynapsePersistence) =>
  new GovernanceService(graph, new ConducksAdvisor(), new ConducksSentinel(), p);

describe('GovernanceService.statusFromVault — the same answer without the graph', () => {
  it('agrees with the graph-backed status on the counts it can actually see', async () => {
    const root = mkRoot();
    const p = await seed(root, 40, 12);

    // Load the same vault into a graph, so both paths describe identical data. If these ever
    // disagree, one of them is lying to every reader and the board cannot tell which.
    const graph = new ConducksAdjacencyList();
    await p.load(graph);
    const service = svc(graph, p);

    const fromGraph = service.status();
    const fromVault = await service.statusFromVault();

    expect(fromVault.stats.nodeCount).toBe(fromGraph.stats.nodeCount);
    expect(fromVault.stats.edgeCount).toBe(fromGraph.stats.edgeCount);
    expect(fromVault.projectName).toBe(fromGraph.projectName);
    await p.close();
  }, 60000);

  it('reports the framework and last-pulsed commit that the GRAPH path silently loses', async () => {
    const root = mkRoot();
    const p = await seed(root, 10, 2);
    const graph = new ConducksAdjacencyList();
    await p.load(graph);
    const service = svc(graph, p);

    // `load()` restores the metadata COLUMN on each node and never the metadata TABLE, so
    // graph-level facts do not survive a load into a fresh process. Verified against the real vault:
    // `graph.getMetadata('framework')` and `('lastAnalyzedCommit')` both come back undefined while
    // the table holds 'express' and a real hash.
    expect(graph.getMetadata('framework')).toBeUndefined();
    expect(graph.getMetadata('lastAnalyzedCommit')).toBeUndefined();

    // Which makes the graph path report a framework it does not have, and — far worse — a
    // last-pulsed commit of "none". `status()` computes staleness as
    // `head && lastCommit !== "none" && head !== lastCommit`, so with "none" it is ALWAYS false:
    // in any read-only process the tool could never report a stale index, which is the single
    // thing it exists to tell you. The vault path reads the table and is immune.
    const fromGraph = service.status();
    expect(fromGraph.framework).toBe('generic');
    expect(fromGraph.staleness.lastAnalyzedCommit).toBe('none');
    expect(fromGraph.staleness.stale).toBe(false);

    const fromVault = await service.statusFromVault();
    expect(fromVault.framework).toBe('express');
    expect(fromVault.staleness.lastAnalyzedCommit).toBe('abc123');
    await p.close();
  }, 60000);

  it('reads the real counts without the graph ever being materialised', async () => {
    const root = mkRoot();
    const p = await seed(root, 40, 12);

    // An EMPTY graph — the exact state a deferred load leaves behind. The graph-backed path would
    // report zero here and say nothing about it; that silent zero is the failure this whole phase
    // exists to remove, so the vault path must be immune to it.
    const empty = new ConducksAdjacencyList();
    const service = svc(empty, p);

    expect(service.status().stats.nodeCount).toBe(0);          // the trap, stated out loud
    const fromVault = await service.statusFromVault();
    expect(fromVault.stats.nodeCount).toBe(40);
    expect(fromVault.stats.edgeCount).toBe(12);
    expect(fromVault.framework).toBe('express');
    await p.close();
  }, 60000);

  it('falls back to the graph when there is no vault to read', async () => {
    // No persistence at all — the in-memory-only case. Returning a zeroed status here would be
    // worse than the round trip it saves.
    //
    // The graph is POPULATED on purpose. This test used to run against an empty one and assert
    // `nodeCount === 0`, which cannot tell "fell back to the graph" apart from "returned a zeroed
    // status" — both produce zero, so it was vacuous for the exact thing its comment claims to
    // guard. A non-zero count is the only observation that proves the fallback happened.
    const graph = new ConducksAdjacencyList();
    for (let i = 0; i < 3; i++) {
      graph.addNode({ id: `/r/f.ts::s${i}`, label: 'BEHAVIOR', properties: { name: `s${i}`, filePath: '/r/f.ts', canonicalKind: 'BEHAVIOR' } } as never);
    }
    const service = new GovernanceService(graph, new ConducksAdvisor(), new ConducksSentinel());
    const fromVault = await service.statusFromVault();
    expect(fromVault.stats.nodeCount).toBe(3);
    expect(fromVault.status).toBe('ready');
  }, 60000);

  it('an empty graph with no vault reports EMPTY, not the old constant READY', async () => {
    // The case the assertion above used to cover by accident, now stated as its own claim: the
    // verdict was the string literal `'ready'` in both `status()` and `statusFromVault()`, so a
    // vault holding nothing reported the same word as a healthy one (todo49 Phase 2b, ADR 0124).
    const service = new GovernanceService(new ConducksAdjacencyList(), new ConducksAdvisor(), new ConducksSentinel());
    const fromVault = await service.statusFromVault();
    expect(fromVault.stats.nodeCount).toBe(0);
    expect(fromVault.status).toBe('empty');
  }, 60000);

  it('reports density as 0 for a vault too small to have one', async () => {
    const root = mkRoot();
    const p = await seed(root, 1, 0);
    const service = svc(new ConducksAdjacencyList(), p);
    expect((await service.statusFromVault()).stats.density).toBe(0);
    await p.close();
  }, 60000);

  it('reports density as RELATIONSHIPS PER SYMBOL (edges/nodes), not graph-theoretic', async () => {
    // Found via the MCP surface: this returned 0.0006 (edges / n(n-1)) while the CLI returned the
    // average-degree number under the SAME field name — 5,000x apart. Now aligned to edges/nodes,
    // which is what the adjacency list, the resonance signature and the CLI all report.
    const root = mkRoot();
    const p = await seed(root, 4, 8);
    const service = svc(new ConducksAdjacencyList(), p);
    const d = (await service.statusFromVault()).stats.density;
    expect(d).toBeCloseTo(2, 5);          // 8 edges / 4 nodes
    expect(d).toBeGreaterThan(1);         // the rejected n(n-1) formula would give ~0.67 here
    await p.close();
  }, 60000);
});

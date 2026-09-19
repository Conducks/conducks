import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EDGE_DISTANCE } from '@/lib/domain/kinetic/trace.js';
import { KineticService } from '@/lib/domain/kinetic/index.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * `impact` and `trace` ask the same question of the graph — how far apart are two symbols — and each
 * held its OWN weight table. Measured before this suite existed: the two disagreed by up to 5x on the
 * same edge type (`EXTENDS` 0.5 against 0.1, `IMPLEMENTS` 0.7 against 0.2), and `trace`'s table was
 * missing `ALIASES` and `CONSTRUCTS` outright.
 *
 * The missing entry is the one that bit. `dijkstra` weights an unlisted edge type at 1.0
 * (`trace.ts`, `weights[edge.type] || 1.0`), so inside `findPath` a barrel re-export cost exactly as
 * much as a direct call — silently contradicting ADR 0109, which weights a re-export BELOW a call
 * precisely so a consumer reached through a barrel still ranks with the consumers reached directly.
 *
 * Nothing failed. Both commands answered, both answers looked reasonable, and the only symptom was a
 * path ranked wrongly against another path nobody was comparing it to. That is why this is pinned
 * structurally AND behaviourally: one table, and a barrel hop that stays cheaper than a call.
 */

const node = (id: string) => ({
  id,
  name: id.split('::').pop(),
  label: 'BEHAVIOR',
  properties: { name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR' },
} as any);

const edge = (from: string, to: string, type: string) =>
  ({ id: `${from}->${to}:${type}`, sourceId: from, targetId: to, type, confidence: 1, properties: {} } as any);

describe('edge distance is one table, and a re-export is cheaper than a call', () => {
  it('weights a re-export BELOW a direct call (ADR 0109)', () => {
    expect(EDGE_DISTANCE.ALIASES).toBeLessThan(EDGE_DISTANCE.CALLS);
  });

  it('carries every edge type the traversal can meet, so none falls back to the 1.0 default', () => {
    // The fallback is what made a missing entry invisible: an absent type does not throw, it
    // silently becomes a standard-strength hop.
    for (const type of ['EXTENDS', 'IMPLEMENTS', 'CALLS', 'CONSTRUCTS', 'MEMBER_OF', 'IMPORTS', 'DEPENDS_ON', 'ALIASES'])
      expect(EDGE_DISTANCE[type]).toBeGreaterThan(0);
  });

  /**
   * The structural half. A second literal table is how the two drifted apart in the first place, so
   * the source is read for one: `impact` must not declare its own weights.
   */
  it('leaves impact with no weight table of its own', () => {
    const src = readFileSync(
      path.resolve('src/lib/domain/kinetic/impact.ts'), 'utf8');
    expect(src).toContain('EDGE_DISTANCE');
    expect(src).not.toMatch(/'EXTENDS':\s*[\d.]+/);
    expect(src).not.toMatch(/'CALLS':\s*[\d.]+/);
  });

  /**
   * The behavioural half. The costs are chosen so the answer FLIPS on the defect rather than merely
   * surviving it — the first version of this case passed with `ALIASES` deleted, because the barrel
   * route still beat a dearer rival at the 1.0 default and the test never noticed.
   *
   *   barrel route   ALIASES + ALIASES   = 1.0 correct  /  2.0 if ALIASES falls back to 1.0
   *   rival route    EXTENDS + CALLS     = 1.5 either way
   *
   * So the barrel wins only while a re-export is cheaper than a call. Lose that and the rival wins.
   */
  it('prefers two barrel hops over a subclass-and-call route, which only holds while a re-export is cheap', async () => {
    const g = new ConducksAdjacencyList();
    ['a.ts::start', 'b1.ts::x', 'b2.ts::y', 'c.ts::sub', 'z.ts::end']
      .forEach(id => g.addNode(node(id)));

    // start --ALIASES--> b1 --ALIASES--> end          1.0 correct, 2.0 with ALIASES missing
    g.addEdge(edge('a.ts::start', 'b1.ts::x', 'ALIASES'));
    g.addEdge(edge('b1.ts::x', 'z.ts::end', 'ALIASES'));
    // start --EXTENDS--> sub --CALLS--> end           1.5, unaffected by the defect
    g.addEdge(edge('a.ts::start', 'c.ts::sub', 'EXTENDS'));
    g.addEdge(edge('c.ts::sub', 'z.ts::end', 'CALLS'));

    const kinetic = new KineticService(g);
    const route = await kinetic.findPath('a.ts::start', 'z.ts::end');

    expect(route).toContain('b1.ts::x');
    expect(route).not.toContain('c.ts::sub');
  });
});

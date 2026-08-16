import { describe, it, expect } from '@jest/globals';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';

/**
 * `conducks guard` carried `rank_violations=458` as "pre-existing, tracked" for long enough that it
 * had stopped being read (todo25#P6). Triaging them showed all 458 were ONE pair — UNIT → ECOSYSTEM —
 * and not one was real.
 *
 * The cause: canonical ranks are a CONTAINMENT ladder (ecosystem contains repository contains
 * directory contains unit), and this rule read them as a DEPENDENCY ladder. ECOSYSTEM sits at rank 0
 * because it is the outermost container, so every `import path from 'node:path'` looked like an
 * abstract module depending on a concrete one. A file depending on an external package is not an
 * inversion; it is what a dependency is.
 */
const node = (id: string, kind: string, rank: number) =>
  ({ id, name: id, label: kind, properties: { name: id, canonicalKind: kind, canonicalRank: rank, filePath: `${id}.ts` } } as any);
const edge = (from: string, to: string, type = 'DEPENDS_ON') =>
  ({ id: `${from}->${to}`, sourceId: from, targetId: to, type, confidence: 1, properties: {} } as any);

const auditWith = (g: ConducksAdjacencyList) =>
  new GovernanceService(g as any, new ConducksAdvisor(), new ConducksSentinel())
    .auditWithRules(process.cwd());

const rankFindings = (res: any) =>
  (res.violations ?? []).filter((v: any) => /rank/i.test(v.ruleId ?? '') || /Rank inversion/i.test(v.message ?? ''));

describe('rank inversion', () => {
  it('does not flag a unit depending on an external package', async () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('app', 'UNIT', 5));
    g.addNode(node('path', 'ECOSYSTEM', 0));
    g.addEdge(edge('app', 'path'));

    expect(rankFindings(await auditWith(g))).toHaveLength(0);
  });

  it('still flags a real containment inversion', async () => {
    // A DIRECTORY (rank 3) depending on a UNIT (rank 5) inside it is the shape the rule is for.
    const g = new ConducksAdjacencyList();
    g.addNode(node('dir', 'DIRECTORY', 3));
    g.addNode(node('file', 'UNIT', 5));
    g.addEdge(edge('file', 'dir', 'IMPORTS'));

    expect(rankFindings(await auditWith(g)).length).toBeGreaterThan(0);
  });
});

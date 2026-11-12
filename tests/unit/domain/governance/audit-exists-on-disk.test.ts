import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { chronicle } from "@/lib/core/git/index.js";

/**
 * An edge into a file that EXISTS on disk but was never induced is a discovery (DISCOVERY-1), not a
 * broken internal link (REFACTOR-1). The check called `require('fs')` inside an ES module, where
 * `require` does not exist; the ReferenceError was swallowed by an empty catch, so "exists on disk"
 * was false for every edge and every such orphan was reported as a violation — failing the audit
 * (state-machine audit P-07-9).
 */
describe('governance audit: an orphan whose file exists on disk', () => {
  it('is a MISSING_INDUCTION discovery, not a REFACTOR violation', () => {
    const graph = new ConducksAdjacencyList();
    const root = chronicle.getProjectDir() || process.cwd();
    const onDisk = path.join(root, 'package.json');
    graph.addNode({ id: 'src/a.ts::caller', label: 'BEHAVIOR' as any, properties: { name: 'caller', filePath: 'src/a.ts' } as any });
    graph.addEdge({ id: 'e1', sourceId: 'src/a.ts::caller', targetId: `${onDisk}::thing`, type: 'CALLS' as any, confidence: 1, properties: {} });

    const report = new GovernanceService(graph, {} as any, {} as any, {} as any).audit();

    expect(report.violations.filter((v: any) => /REFACTOR-1/.test(v.message))).toEqual([]);
    expect(report.discoveries.map((d: any) => d.type)).toContain('MISSING_INDUCTION');
  });
});

import { describe, it, expect } from '@jest/globals';
import { getDefaultRules, ALLOWED_DEPENDENCIES } from '@/lib/domain/governance/sentinel-rules.js';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * Layer contract (ADR 0005), enforced by the `layer_boundaries` sentinel rule
 * (CONDUCKS-22). This rule existed as prose (ADR 0005) plus a DISABLED sentinel rule for
 * months. Nobody caught it because nothing exercised the rule, only the ADR — the contract
 * was true on paper and false in the graph, and ~71 illegal edges (cli->core 32, cli->domain
 * 29, mcp->core 5, mcp->domain 3, cli->mcp 2) accumulated silently in that window. This file
 * targets that failure mode directly: a rule that quietly stops running, not the table of
 * edges (which changes legitimately as the codebase evolves).
 */

// ---------------------------------------------------------------------------
// 1. The rule must be ON by default. A disabled rule is silent, not loud — this is
//    exactly the state that shipped for months before ADR 0005 was actually enforced.
// ---------------------------------------------------------------------------
describe('layer_boundaries — enabled by default', () => {
  it('exists in the default rule set and is enabled', () => {
    const rule = getDefaultRules().find(r => r.id === 'layer_boundaries');
    expect(rule).toBeDefined();
    expect(rule!.condition).toBe('layer_boundaries');
    expect(rule!.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. ALLOWED_DEPENDENCIES must still encode downward-only. Asserting the SHAPE (which
//    layers CANNOT reach which) rather than deep-equalling the literal map, so this
//    doesn't break on every legitimate edit to the table — only on a real contract breach.
// ---------------------------------------------------------------------------
describe('ALLOWED_DEPENDENCIES — downward-only shape', () => {
  it('contracts is a leaf: it may not reach any other layer', () => {
    expect(ALLOWED_DEPENDENCIES.contracts).toEqual([]);
  });

  it('core may not reach domain, composition, or any interface', () => {
    for (const forbidden of ['domain', 'composition', 'cli', 'mcp', 'web']) {
      expect(ALLOWED_DEPENDENCIES.core).not.toContain(forbidden);
    }
  });

  it('domain may not reach composition or any interface', () => {
    for (const forbidden of ['composition', 'cli', 'mcp', 'web']) {
      expect(ALLOWED_DEPENDENCIES.domain).not.toContain(forbidden);
    }
  });

  it('composition may not reach any interface', () => {
    for (const forbidden of ['cli', 'mcp', 'web']) {
      expect(ALLOWED_DEPENDENCIES.composition).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The two sanctioned launcher exceptions (cli->web for `mirror`, cli->mcp for `mcp`)
//    must stay present AND narrow. If someone widens them into a general interface-to-
//    interface allowance (e.g. gives mcp/web a reciprocal edge, or adds a third), this
//    must fail — that would reopen exactly the cli->mcp coupling CONDUCKS-22 counted.
// ---------------------------------------------------------------------------
describe('the two launcher exceptions stay narrow', () => {
  it('cli -> web (mirror command) and cli -> mcp (mcp command) are present', () => {
    expect(ALLOWED_DEPENDENCIES.cli).toContain('web');
    expect(ALLOWED_DEPENDENCIES.cli).toContain('mcp');
  });

  it('cli carries exactly those two launcher exceptions beyond composition/contracts', () => {
    const extras = [...ALLOWED_DEPENDENCIES.cli]
      .filter(layer => layer !== 'composition' && layer !== 'contracts')
      .sort();
    expect(extras).toEqual(['mcp', 'web']);
  });

  it('mcp and web get no reciprocal interface-to-interface allowance', () => {
    expect(ALLOWED_DEPENDENCIES.mcp).not.toContain('web');
    expect(ALLOWED_DEPENDENCIES.mcp).not.toContain('cli');
    expect(ALLOWED_DEPENDENCIES.web).not.toContain('cli');
    expect(ALLOWED_DEPENDENCIES.web).not.toContain('mcp');
  });
});

// ---------------------------------------------------------------------------
// 4. The rule evaluation itself, on a synthetic in-memory graph — no DuckDB, no vault.
//    GovernanceService.auditWithRules() takes a ConducksAdjacencyList directly, so this
//    exercises the real evaluator (governance/index.ts, case 'layer_boundaries'), not a
//    reimplementation of it. Node ids follow the producer's shape (CONDUCKS-28:
//    `<file>::unit`) rather than a bare file path, so this isn't the daac.test.ts trap
//    (id === filePath) that made a broken lookup look correct by coincidence.
// ---------------------------------------------------------------------------
describe('layer_boundaries — synthetic upward edge is blocked', () => {
  const build = () => {
    const graph = new ConducksAdjacencyList();
    const addNode = (id: string, name: string, filePath: string) =>
      graph.addNode({ id, label: 'UNIT', properties: { name, filePath, canonicalKind: 'UNIT' } } as never);
    const addEdge = (id: string, sourceId: string, targetId: string, type = 'IMPORTS') =>
      graph.addEdge({ id, sourceId, targetId, type, confidence: 1.0, properties: {} } as never);
    return { graph, addNode, addEdge };
  };

  // A non-existent root guarantees loadSentinelRules() falls back to getDefaultRules()
  // (no .conducks/sentinel.yml to find), so this test is isolated from this repo's own
  // vault/config state rather than depending on it.
  const auditOf = (graph: ConducksAdjacencyList) =>
    new GovernanceService(graph, new ConducksAdvisor(), new ConducksSentinel())
      .auditWithRules('/nonexistent-conducks-test-root');

  it('blocks core -> domain — exactly the upward edge shape ADR 0005 forbids', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/src/lib/core/x.ts::unit', 'x.ts', '/repo/src/lib/core/x.ts');
    addNode('/repo/src/lib/domain/y.ts::unit', 'y.ts', '/repo/src/lib/domain/y.ts');
    addEdge('e1', '/repo/src/lib/core/x.ts::unit', '/repo/src/lib/domain/y.ts::unit');

    const report = auditOf(graph);
    const violations = report.violations.filter(v => v.ruleId === 'layer_boundaries');

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/core → domain/);
    expect(report.success).toBe(false);
  });

  it('does not block cli -> web — the sanctioned mirror-launcher exception stays legal', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/src/interfaces/cli/commands/mirror.ts::unit', 'mirror.ts', '/repo/src/interfaces/cli/commands/mirror.ts');
    addNode('/repo/src/interfaces/web/mirror-server.ts::unit', 'mirror-server.ts', '/repo/src/interfaces/web/mirror-server.ts');
    addEdge('e1', '/repo/src/interfaces/cli/commands/mirror.ts::unit', '/repo/src/interfaces/web/mirror-server.ts::unit');

    const report = auditOf(graph);
    expect(report.violations.filter(v => v.ruleId === 'layer_boundaries')).toHaveLength(0);
    expect(report.success).toBe(true);
  });
});

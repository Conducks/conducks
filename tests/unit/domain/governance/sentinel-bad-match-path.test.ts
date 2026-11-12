import { describe, it, expect } from '@jest/globals';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * A `sentinel.yml` rule whose `matchPath` is not a valid regular expression (state-machine audit
 * round 2, Q-07-7). `new RegExp(rule.matchPath)` ran inside the node loop, so the first node threw
 * and `validate` produced no report at all — every other rule in the file went unchecked with it.
 * The bad rule is now reported by name, and the rest are still evaluated.
 */
const build = () => {
  const g = new ConducksAdjacencyList();
  g.addNode({ id: 'src/a.ts::foo', name: 'foo', label: 'BEHAVIOR', properties: { name: 'foo', kind: 'function', filePath: 'src/a.ts' } } as any);
  return g;
};

describe('sentinel matchPath', () => {
  it('an invalid matchPath is reported as that rule\'s problem, and the other rules still run', async () => {
    const report = await new ConducksSentinel().validate(build(), [
      { id: 'broken', type: 'max_fans' as any, matchPath: 'src/(unclosed', threshold: 1 } as any,
      { id: 'zero-subjects', type: 'max_fans' as any, matchPath: '^nowhere/', threshold: 1 } as any,
    ]);
    const broken = report.violations.filter(v => v.ruleId === 'broken');
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toMatch(/not a valid regular expression/);
    // The second rule was evaluated: it matched nothing, which the sentinel reports.
    expect(report.violations.some(v => v.ruleId === 'zero-subjects')).toBe(true);
    expect(report.success).toBe(false);
  });
});

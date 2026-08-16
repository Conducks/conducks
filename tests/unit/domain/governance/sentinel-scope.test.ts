import { describe, it, expect } from '@jest/globals';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * The sentinel reported 97 violations of one rule on this repository and 14 were real.
 *
 * Three independent defects, each of which alone made the gate useless:
 *   1. `matchLabel: STRUCTURE` is the only selector, and STRUCTURE covers 55 interfaces and type
 *      aliases as well as 42 classes — so every data shape was asked to implement a component
 *      contract. That is 83 of the 97.
 *   2. `endsWith('::' + target)` compared case-sensitively against ids that are case-folded on
 *      insert, and an unresolved heritage target has no `::` prefix at all. So even the 28 classes
 *      that DO implement the interface were reported as violations. The message printed
 *      `found [conduckscomponent]` next to `Expected [ConducksComponent]` and nobody read it,
 *      because it was one line in ninety-seven.
 *   3. A rule matching zero nodes reported clean, which is how the first version of the fix — using
 *      the vault's column name `semantic_kind` where the in-memory field is `kind` — silently
 *      turned the whole rule off and looked like a success.
 *
 * A gate that cries wolf 97 times is ignored exactly as thoroughly as one that never fires.
 */
const node = (id: string, kind: string, name: string) =>
  ({ id, name, label: 'STRUCTURE', properties: { name, kind, filePath: 'src/lib/domain/x.ts' } } as any);

const build = () => {
  const g = new ConducksAdjacencyList();
  g.addNode(node('src/lib/domain/x.ts::goodservice', 'struct', 'GoodService'));
  g.addNode(node('src/lib/domain/x.ts::badservice', 'struct', 'BadService'));
  g.addNode(node('src/lib/domain/x.ts::someshape', 'interface', 'SomeShape'));
  // Unresolved heritage: a bare, case-folded target — the shape real code produces.
  g.addEdge({ id: 'h1', sourceId: 'src/lib/domain/x.ts::goodservice', targetId: 'conduckscomponent',
              type: 'IMPLEMENTS', confidence: 1.0, properties: {} } as any);
  return g;
};

const rule = {
  id: 'require-conducks-component',
  type: 'require_heritage' as const,
  matchPath: 'src/lib/domain/',
  matchLabel: 'STRUCTURE',
  matchSemanticKind: 'struct',
  target: 'ConducksComponent',
};

describe('the sentinel reports only real violations', () => {
  it('does not ask an interface to implement a component contract', async () => {
    const report = await new ConducksSentinel().validate(build(), [rule]);
    expect(report.violations.map(v => v.nodeId)).not.toContain('src/lib/domain/x.ts::someshape');
  });

  it('accepts a class whose heritage target is bare and case-folded', async () => {
    const report = await new ConducksSentinel().validate(build(), [rule]);
    expect(report.violations.map(v => v.nodeId)).not.toContain('src/lib/domain/x.ts::goodservice');
  });

  it('still reports the class that genuinely does not implement it', async () => {
    const report = await new ConducksSentinel().validate(build(), [rule]);
    expect(report.violations.map(v => v.nodeId)).toContain('src/lib/domain/x.ts::badservice');
    expect(report.success).toBe(false);
  });

  it('refuses to pass a rule that matched no node at all', async () => {
    const impossible = { ...rule, matchSemanticKind: 'semantic_kind' };
    const report = await new ConducksSentinel().validate(build(), [impossible]);
    // Zero matches used to be indistinguishable from full compliance — the exact way the first
    // attempt at this fix disabled the rule while appearing to succeed.
    expect(report.success).toBe(false);
    expect(report.violations.some(v => /matched 0 nodes/.test(v.message))).toBe(true);
  });
});

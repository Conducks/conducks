/**
 * A node's declared parameter types must be readable the moment it is parsed, not only after a vault
 * load (deep test 2026-11-12, watch-vs-cold parity on orchestrator).
 *
 * `paramTypes` was set by `persistence.load` alone, from the `param_types` column. A freshly parsed
 * node carries its types in `dna.params` and had no `paramTypes`, so IntraLinker could not resolve
 * `userId.split(...)` on `userId: string`. `analyze` got there in its SECOND link pass, over a graph
 * reloaded from the vault; the watcher links the fresh parse and dropped the call as unresolved.
 */
import { describe, it, expect } from '@jest/globals';
import { paramTypesFromDna } from '@/contracts/index.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

describe('declared parameter types', () => {
  it('are derived from dna.params: typed ones only, keys and types lower-cased', () => {
    expect(paramTypesFromDna({ params: [{ name: 'userId', type: 'String' }, { name: 'n' }] })).toEqual({ userid: 'string' });
    expect(paramTypesFromDna({ params: [{ name: 'x' }] })).toBeUndefined();
    expect(paramTypesFromDna(undefined)).toBeUndefined();
  });

  it('are on a node added straight from a parse, before any vault load', () => {
    const g = new ConducksAdjacencyList();
    g.addNode({ id: '/r/a.ts::f', label: 'FUNCTION', properties: { name: 'f', filePath: '/r/a.ts', dna: { params: [{ name: 'userId', type: 'string' }] } } as any });
    expect((g.getNode('/r/a.ts::f')!.properties as any).paramTypes).toEqual({ userid: 'string' });
  });
});

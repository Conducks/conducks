import { Conducks } from '../../src/lib/domain/analysis/conducks-core.js';
import { SynapsePersistence } from '../../src/lib/core/persistence/persistence.js';
import { ConducksNode } from '../../src/lib/core/graph/adjacency-list.js';
import path from 'node:path';
import fs from 'node:fs';

describe('Phase 6: The Great Binding — Integration', () => {
  let conducks: Conducks;
  const testDir = path.resolve(process.cwd(), 'tmp/phase6-test');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    conducks = new Conducks({ baseDir: testDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it('should achieve 100% resolution for cross-module constructor binding', async () => {
    const commandPath = path.join(testDir, 'command.ts');
    const commandSource = `
      export class TestCommand {
        execute() { console.log("Executing..."); }
      }
    `;
    fs.writeFileSync(commandPath, commandSource);

    const entryPath = path.join(testDir, 'entry.ts');
    const entrySource = `
      import { TestCommand } from './command.js';
      const cmd = new TestCommand();
      cmd.execute();
    `;
    fs.writeFileSync(entryPath, entrySource);

    await conducks.pulse([
      { path: commandPath, source: commandSource },
      { path: entryPath, source: entrySource }
    ]);

    const graph = conducks.graph.getGraph();
    const targetId = `${commandPath.toLowerCase()}::TestCommand`;
    const entryId = `${entryPath.toLowerCase()}::entry.ts`;
    
    const nodes = graph.findNodesByName('TestCommand');
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0].id).toBe(targetId);

    const trace = await conducks.getImpact(entryId, 'downstream', 5);
    const hasBinding = trace.affectedNodes.some((n: any) => n.id === targetId);

    expect(hasBinding).toBe(true);
    expect(trace.affectedNodes.find((n: any) => n.id === targetId).filePath).not.toBe('unknown');
  });

  it('should be resilient to path casing (Canonical Normalization)', async () => {
    const filePath = path.join(testDir, 'CaseTest.ts');
    const source = `export const X = 1;`;
    
    await conducks.pulse([{ path: filePath, source }]);
    const nodeId1 = conducks.graph.getGraph().findNodesByName('X')[0].id;

    await conducks.pulse([{ path: filePath.toLowerCase(), source }]);
    const nodeId2 = conducks.graph.getGraph().findNodesByName('X')[0].id;

    expect(nodeId1).toBe(nodeId2);
    expect(nodeId1).toBe(`${filePath.toLowerCase()}::X`);
  });
});

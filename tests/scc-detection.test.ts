import { Conducks } from '../src/conducks-core.js';
import { SynapsePersistence } from '../lib/core/graph/persistence.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Sprint 3.C: SCC Anomaly Detection', () => {
  let conducks: Conducks;
  const projectDir = path.resolve(__dirname, 'project_scc');

  beforeAll(async () => {
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);
    
    // File A: depends on B
    fs.writeFileSync(path.join(projectDir, 'a.py'), 'import b\ndef func_a():\n  b.func_b()');
    // File B: depends on C
    fs.writeFileSync(path.join(projectDir, 'b.py'), 'import c\ndef func_b():\n  c.func_c()');
    // File C: depends on A (The Circular Sin!)
    fs.writeFileSync(path.join(projectDir, 'c.py'), 'import a\ndef func_c():\n  a.func_a()');

    conducks = new Conducks();
    conducks.graph.getGraph().clear();
  });

  afterAll(() => {
    if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true });
  });

  it('SCC Detection: Should identify the structural circular dependency', async () => {
    const files = [
      { path: 'project_scc/a.py', source: fs.readFileSync(path.join(projectDir, 'a.py'), 'utf8') },
      { path: 'project_scc/b.py', source: fs.readFileSync(path.join(projectDir, 'b.py'), 'utf8') },
      { path: 'project_scc/c.py', source: fs.readFileSync(path.join(projectDir, 'c.py'), 'utf8') }
    ];

    await conducks.pulse(files);

    const advice = await conducks.advise();
    const circularAdvice = advice.filter(a => a.type === 'CIRCULAR');

    expect(circularAdvice.length).toBeGreaterThan(0);
    expect(circularAdvice[0].level).toBe('ERROR');
    console.log(`[SCC Test] Circular Dependency Detected: ${circularAdvice[0].nodes.join(' -> ')}`);
  });
});

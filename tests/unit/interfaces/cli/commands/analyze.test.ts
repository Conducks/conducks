import { AnalyzeCommand } from '../../../../../src/interfaces/cli/commands/analyze.js';
import { registry } from '../../../../../src/registry/index.js';
import { SynapsePersistence } from '../../../../../src/lib/core/persistence/persistence.js';
import { Conducks } from '../../../../../src/lib/domain/analysis/conducks-core.js';
import path from 'node:path';
import fs from 'node:fs';

describe('AnalyzeCommand — Unit', () => {
  let command: AnalyzeCommand;
  let persistence: SynapsePersistence;
  const testDir = path.resolve(process.cwd(), 'tmp/analyze-test');

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    
    // Inject mock registry (already exists via registry import)
    command = new AnalyzeCommand();
    persistence = {
      load: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue('/mock/path.db')
    } as any;
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  it('should execute a full pulse on the current directory', async () => {
    // 1. Create a dummy test file
    const filePath = path.join(testDir, 'test.py');
    fs.writeFileSync(filePath, 'def hello(): pass');
    
    // 2. Mock the registry and its analysis domain
    const pulseSpy = jest.spyOn(registry.analysis as any, 'executePulse').mockResolvedValue('pulse_id');
    
    // 3. Execute the command
    await command.execute([testDir], persistence);
    
    // 4. Verify pulse orchestration
    expect(pulseSpy).toHaveBeenCalled();
  });

  it('should handle missing directory errors gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    await command.execute(['/invalid/path'], persistence);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error: Directory not found'));
    errorSpy.mockRestore();
  });
});

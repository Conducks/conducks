import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CohesionCommand } from '@/interfaces/cli/commands/cohesion.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({})) },
      getCohesionVector: jest.fn(() => 0),
    },
  },
}));

describe('CohesionCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('calculates cohesion and prints a score', async () => {
    const persistence = { 
      load: jest.fn(async () => {}),
      close: jest.fn(async () => {}) 
    } as any;
    const cmd = new CohesionCommand();
    
    // Override via live import BEFORE execute so cohesion.ts picks up the mock value
    const { registry } = await import('@/registry/index.js');
    (registry.intelligence as any).getCohesionVector = jest.fn(() => 0.42);
    
    await cmd.execute(['src/x.ts::foo', 'src/y.ts::bar'], persistence);
    
    expect(output).toContain('42.00%');
    expect(registry.intelligence.getCohesionVector).toHaveBeenCalledWith('src/x.ts::foo', 'src/y.ts::bar');
    expect(persistence.close).toHaveBeenCalled();
  });
});

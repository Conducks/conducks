import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BlueprintCommand } from '@/interfaces/cli/commands/blueprint.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
  },
}));
jest.mock('@/lib/core/persistence/persistence.js', () => ({
  SynapsePersistence: class {},
}));
jest.mock('@/lib/core/graph/linker-federated.js', () => ({
  FederatedLinker: jest.fn().mockImplementation(() => ({ hydrate: jest.fn(async () => {}) })),
}));
jest.mock('@/lib/domain/governance/blueprint-generator.js', () => ({
  BlueprintGenerator: jest.fn().mockImplementation(() => ({ generate: jest.fn(async () => '/tmp/blueprint.md') })),
}));

describe('BlueprintCommand Real Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('should generate a structural graph and print the target path', async () => {
    const cmd = new BlueprintCommand();
    const persistence = { 
      load: jest.fn(async () => {}),
      close: jest.fn(async () => {}) 
    } as any;
    
    // Override the mock to return a specific path regardless of logic, or just match any path
    await cmd.execute([], persistence);
    
    expect(output).toContain('Generating Structural Graph');
    expect(output).toContain('Structural Graph generated at:');
    expect(persistence.close).toHaveBeenCalled();
  });
});

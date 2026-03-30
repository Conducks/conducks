import { describe, it, expect } from '@jest/globals';
import { SynapseRegistry } from '@/registry/synapse-registry.js';

describe('Synapse Registry Unit Tests', () => {
  it('exports SynapseRegistry class', () => {
    expect(typeof SynapseRegistry).toBe('function');
  });
});

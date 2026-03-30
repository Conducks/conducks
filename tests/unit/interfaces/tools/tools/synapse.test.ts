import { describe, it, expect } from '@jest/globals';
import * as synapseTool from '@/interfaces/tools/tools/synapse.js';

describe('Synapse Tool Unit Tests', () => {
  it('exports synapse tool module', () => {
    expect(synapseTool).toBeDefined();
  });
});

import { describe, it, expect } from '@jest/globals';
import * as registryIndex from '@/registry/index.js';

describe('Registry Index Unit Tests', () => {
  it('exports registry index module', () => {
    expect(registryIndex).toBeDefined();
  });
});

import { describe, it, expect } from '@jest/globals';
import * as registryBase from '@/registry/base.js';

describe('Registry Base Unit Tests', () => {
  it('exports registry base module', () => {
    expect(registryBase).toBeDefined();
  });
});

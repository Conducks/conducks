import { describe, it, expect } from '@jest/globals';
import * as registryTypes from '@/registry/types.js';

describe('Registry Types Unit Tests', () => {
  it('exports registry types module', () => {
    expect(registryTypes).toBeDefined();
  });
});

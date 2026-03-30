import { describe, it, expect } from '@jest/globals';
import { ToolRegistry } from '@/registry/tool-registry.js';

describe('Tool Registry Unit Tests', () => {
  it('exports ToolRegistry class', () => {
    expect(typeof ToolRegistry).toBe('function');
  });
});

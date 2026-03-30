import { describe, it, expect } from '@jest/globals';
import * as cliIndex from '@/interfaces/cli/index.js';

describe('CLI Index Unit Tests', () => {
  it('exports CLI module', () => {
    expect(cliIndex).toBeDefined();
  });
});

import { describe, it, expect } from '@jest/globals';
import * as command from '@/interfaces/cli/command.js';

describe('ConducksCommand Interface', () => {
  it('should define the correct interface shape', () => {
    // Check that the interface properties exist on a sample object
    const sample: command.ConducksCommand = {
      id: 'test',
      description: 'desc',
      usage: 'usage',
      execute: async () => {},
    };
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('description');
    expect(sample).toHaveProperty('usage');
    expect(typeof sample.execute).toBe('function');
  });
});

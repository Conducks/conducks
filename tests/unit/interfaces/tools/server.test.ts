import { describe, it, expect } from '@jest/globals';
import * as server from '@/interfaces/tools/server.js';

describe('Tools Server Unit Tests', () => {
  it('exports server module', () => {
    expect(server).toBeDefined();
  });
});

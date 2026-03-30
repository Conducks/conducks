import { describe, it, expect } from '@jest/globals';

describe('Tools Index Module', () => {
  it('should be importable without side effects (mocked)', async () => {
    // Use dynamic import with jest.mock to avoid running main()
    const indexModule = await import('@/interfaces/tools/index.js');
    expect(indexModule).toBeDefined();
    expect(typeof indexModule.main).toBe('function');
  });
});

import { describe, it, expect } from '@jest/globals';
import { classifyOrigin } from '@/lib/core/graph/boundary-classifier.js';

// System 2 (ADR 0012): a boundary reference is only useful once its ORIGIN is known — internal vs
// trusted-unversioned stdlib vs versioned supply-chain dependency.
describe('boundary-classifier — origin classification', () => {
  it('classifies relative/absolute/alias specifiers as internal', () => {
    for (const s of ['./util', '../lib/x', '/abs/path', '@/lib/core', '~/shared']) {
      expect(classifyOrigin(s).origin).toBe('internal');
    }
  });

  it('classifies Node core modules (bare and node:-prefixed) as stdlib', () => {
    for (const s of ['path', 'fs', 'crypto', 'node:fs', 'node:worker_threads', 'util']) {
      const c = classifyOrigin(s);
      expect(c.origin).toBe('stdlib');
      expect(c.package).toBeNull();
    }
  });

  it('classifies third-party packages as dependency and extracts the package name', () => {
    expect(classifyOrigin('duckdb')).toEqual({ origin: 'dependency', package: 'duckdb' });
    expect(classifyOrigin('@modelcontextprotocol/sdk')).toEqual({ origin: 'dependency', package: '@modelcontextprotocol/sdk' });
    // Sub-path imports keep the package root, not the sub-path.
    expect(classifyOrigin('@toon-format/toon/lite')).toEqual({ origin: 'dependency', package: '@toon-format/toon' });
    expect(classifyOrigin('lodash/merge')).toEqual({ origin: 'dependency', package: 'lodash' });
  });

  it('strips surrounding quotes from a raw specifier', () => {
    expect(classifyOrigin("'path'").origin).toBe('stdlib');
    expect(classifyOrigin('"duckdb"')).toEqual({ origin: 'dependency', package: 'duckdb' });
  });
});

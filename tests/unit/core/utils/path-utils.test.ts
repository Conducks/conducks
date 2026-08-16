import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { canonicalize, getProjectRelativePath } from '@/lib/core/utils/index.js';

/**
 * `path-utils` had NO test, and it decides what a node id is (todo71#P3).
 *
 * Every node id in the vault is `canonicalize(file) + '::' + name` (CONDUCKS-4). So any input this
 * function maps to two different strings becomes two nodes for one symbol, and every edge between
 * them dangles — the fragmentation the lowercasing exists to prevent, reintroduced by the function
 * that prevents it. Thirteen parsing files depend on it, which is why it is pinned before parsing is
 * cleaned rather than after.
 *
 * The cases below are the ways one path arrives spelled differently: case, separator, redundant
 * segments, a trailing slash. Each asserts they collapse to ONE id.
 */
describe('canonicalize — one path, one id', () => {
  it('lowercases, because APFS is case-insensitive and would otherwise split a node in two', () => {
    expect(canonicalize('/Users/Said/Src/File.ts')).toBe('/users/said/src/file.ts');
  });

  it('collapses a Windows separator onto the one the ids use', () => {
    expect(canonicalize('src\\lib\\file.ts')).toBe('src/lib/file.ts');
  });

  it('resolves `..` and `.` rather than carrying them into an id', () => {
    expect(canonicalize('src/lib/../core/./file.ts')).toBe('src/core/file.ts');
  });

  it('gives the same answer for the same file spelled four ways', () => {
    // The property that matters, stated as a property rather than as four separate expectations.
    const spellings = [
      '/Repo/Src/File.ts',
      '/repo/src/file.ts',
      '/Repo/Src/../Src/File.ts',
      '\\Repo\\Src\\File.ts',
    ];
    expect(new Set(spellings.map(canonicalize)).size).toBe(1);
  });

  it('returns an empty string for an empty input, rather than `.`', () => {
    // `path.normalize('')` is `.`, which would become a node id for the current directory —
    // a real id pointing at nothing. The guard is why this is not a one-liner.
    expect(canonicalize('')).toBe('');
  });

  it('leaves a trailing slash alone rather than pretending a directory is a file', () => {
    // `normalize` keeps it, and that is the honest answer: a directory and a file with the same
    // name are different things, and silently trimming would merge them.
    expect(canonicalize('/Repo/Src/')).toBe('/repo/src/');
  });

  it('handles a non-ASCII path without mangling it', () => {
    expect(canonicalize('/Repo/İstanbul.ts')).toBe('/repo/i̇stanbul.ts');
  });
});

describe('getProjectRelativePath — what a reader sees', () => {
  it('strips the root and normalises the separator', () => {
    expect(getProjectRelativePath('/repo/src/file.ts', '/repo')).toBe('src/file.ts');
  });

  it('does NOT lowercase, because this is for display and the real spelling is what opens the file', () => {
    // The whole difference from `canonicalize`: ids are lowercased for equality, display paths are
    // not, because a lowercased path opens nothing on a case-sensitive filesystem.
    expect(getProjectRelativePath('/repo/Src/File.ts', '/repo')).toBe('Src/File.ts');
  });

  it('walks out with `..` for a path outside the root, rather than inventing containment', () => {
    expect(getProjectRelativePath('/elsewhere/file.ts', '/repo')).toContain('..');
  });

  it('answers the empty string for the root itself', () => {
    expect(getProjectRelativePath('/repo', '/repo')).toBe('');
  });

  it('accepts a relative input by resolving it against the process directory', () => {
    // Both sides go through `path.resolve`, so a relative input is not a special case — asserted
    // rather than assumed, because a caller passing one would otherwise get a silent `../..` chain.
    const abs = path.resolve('src/file.ts');
    expect(getProjectRelativePath('src/file.ts', path.dirname(abs))).toBe('file.ts');
  });
});

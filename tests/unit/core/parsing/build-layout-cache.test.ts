import { describe, it, expect, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMappings } from '@/lib/core/parsing/build-layout.js';

/**
 * The build-layout cache (state-machine audit round 2, Q-03-2):
 *
 *   (a) it was keyed on path + mtime only, so a tsconfig fixed within the same mtime tick (coarse-mtime
 *       filesystems, a formatter, a fast checkout) kept the cached answer from the broken file —
 *       "no mapping" — until the file changed again;
 *   (b) it held ONE slot, so a pulse over a workspace with several roots re-read and re-parsed the
 *       configs on every call, which is the cost the cache exists to avoid.
 */
const roots: string[] = [];
const project = (tsconfig: string) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-layout-cache-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), tsconfig);
  return root;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); jest.restoreAllMocks(); });

const GOOD = JSON.stringify({ compilerOptions: { rootDir: './src', outDir: './dist' } });

describe('build-layout cache', () => {
  it('a config fixed within the same mtime is read again', () => {
    const root = project('{ "compilerOptions": { "rootDir": ');      // broken
    const file = path.join(root, 'tsconfig.json');
    const stamp = new Date(Date.now() - 60_000);
    fs.utimesSync(file, stamp, stamp);
    expect(buildMappings(root)).toEqual([]);
    fs.writeFileSync(file, GOOD);
    fs.utimesSync(file, stamp, stamp);                                 // same mtime as the broken one
    expect(buildMappings(root).map(m => m.outDir)).toEqual([path.join(root, 'dist')]);
  });

  it('alternating between two roots reads each config once', () => {
    const a = project(GOOD), b = project(GOOD);
    const read = jest.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 4; i++) { buildMappings(a); buildMappings(b); }
    const reads = read.mock.calls.filter(c => String(c[0]).endsWith('tsconfig.json')).length;
    expect(reads).toBe(2);
  });
});

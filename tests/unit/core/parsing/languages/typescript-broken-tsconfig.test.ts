import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TypeScriptResolver } from '@/lib/core/parsing/languages/typescript/resolver.js';
import { chronicle, anchorChronicle } from '@/lib/core/git/index.js';

/**
 * A tsconfig that does not parse was read and parsed again on EVERY import — the cache was written
 * only after a successful parse (state-machine audit round 2, Q-04-3). Over a pulse of thousands of
 * imports that is thousands of reads of a file that has not changed. The failure is cached on the
 * same mtime + size as a success, so a fix to the file is still picked up.
 */
let root: string;
let previous: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-ts-broken-')));
  previous = chronicle.getProjectDir();
  anchorChronicle(root);
});
afterAll(() => {
  anchorChronicle(previous);
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('a tsconfig that does not parse', () => {
  it('is read once, not once per import, and a fix is still picked up', () => {
    const tsconfig = path.join(root, 'tsconfig.json');
    const from = path.join(root, 'app.ts');
    const files = [from, path.join(root, 'src', 'x.ts')];
    fs.writeFileSync(tsconfig, '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } ');   // truncated
    const r = new TypeScriptResolver();
    const read = jest.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 10; i++) r.resolve('@/x', from, files);
    expect(read.mock.calls.filter(c => c[0] === tsconfig).length).toBe(1);
    read.mockRestore();

    fs.writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));
    expect(r.resolve('@/x', from, files)).toBe(files[1]);
  });
});

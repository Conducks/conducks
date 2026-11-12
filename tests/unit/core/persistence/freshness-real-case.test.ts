import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyFreshness } from '@/lib/core/persistence/freshness.js';

/**
 * A file that exists is not REMOVED because its stored key is lower-cased (state-machine audit P-01-13).
 *
 * The vault stores file keys lower-cased. A file the walk did not return (an ignore rule, say) is
 * checked with `stillExists(key)` — and on a case-sensitive filesystem `src/util.ts` does not exist
 * when the file is `src/Util.ts`, so a file sitting on disk was reported deleted and the graph read
 * as stale.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('the removed check and the real spelling of a path', () => {
  it('does not report a mixed-case file that still exists as removed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-fresh-Case-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'Src'));
    const real = path.join(root, 'Src', 'Util.ts');
    fs.writeFileSync(real, 'export const x = 1;\n');

    const stored = new Map([[real.toLowerCase(), 'h']]);
    const f = classifyFreshness(stored, [], new Set(['.ts']), () => null, p => fs.existsSync(p), p => path.extname(p));

    expect(f.removed).toEqual([]);
  });

  it('still reports a file that is really gone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-fresh-gone-'));
    roots.push(root);
    const gone = path.join(root, 'src', 'gone.ts').toLowerCase();
    const f = classifyFreshness(new Map([[gone, 'h']]), [], new Set(['.ts']), () => null, p => fs.existsSync(p), p => path.extname(p));
    expect(f.removed).toEqual([gone]);
  });
});

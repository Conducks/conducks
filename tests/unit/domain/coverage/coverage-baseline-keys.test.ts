import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveBaseline, loadBaseline, diffAgainstBaseline } from '@/lib/domain/coverage/coverage-baseline.js';

/**
 * A baseline is keyed by `file::name`, and one file can hold two functions of one name (two classes
 * each with `get`). The snapshot kept only the LAST, so on `--vs-baseline` both were compared with
 * that one value: a function at 90% read IMPROVED or REGRESSED against its namesake's 10%
 * (state-machine audit P-07-12). Repeats now get their own key, in result order; a unique name keeps
 * its old key, so existing baselines still match.
 */
const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('coverage baseline keys', () => {
  it('compares each of two same-named functions in one file with its own baseline', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-cov-'));
    dirs.push(dir);
    const file = path.join(dir, 'baseline.json');
    const results = [
      { name: 'get', file: 'src/a.ts', pct: 90 },
      { name: 'get', file: 'src/a.ts', pct: 10 },
      { name: 'put', file: 'src/a.ts', pct: 50 },
    ];

    saveBaseline(results, file);
    const drift = diffAgainstBaseline(results, loadBaseline(file)!);

    expect(drift.map(d => d.status)).toEqual(['SAME', 'SAME', 'SAME']);
    expect(Object.keys(loadBaseline(file)!)).toContain('src/a.ts::put');
  });
});

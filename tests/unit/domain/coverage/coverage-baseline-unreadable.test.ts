import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBaseline } from '@/lib/domain/coverage/coverage-baseline.js';

/**
 * A baseline file that exists but does not parse (state-machine audit round 2, Q-07-8): a write cut
 * short, or a hand edit. `loadBaseline` passed it straight to `JSON.parse`, so `coverage
 * --vs-baseline` died on "Unexpected end of JSON input" with nothing naming the file or the way out.
 * A file that parses to something other than a snapshot (an array, a number) was returned as one and
 * compared as if every function were NEW.
 */
const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
const file = (body: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-cov-bad-'));
  dirs.push(dir);
  const f = path.join(dir, 'coverage-baseline.json');
  fs.writeFileSync(f, body);
  return f;
};

describe('an unreadable coverage baseline', () => {
  it('a truncated file is refused by name, with the way to repair it', () => {
    const f = file('{ "src/a.ts::foo": 9');
    expect(() => loadBaseline(f)).toThrow(new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*--save-baseline`, 's'));
  });

  it('a file that is not a snapshot object is refused, not compared', () => {
    expect(() => loadBaseline(file('[1, 2, 3]'))).toThrow(/not a coverage baseline/);
    expect(() => loadBaseline(file('{"src/a.ts::foo": "ninety"}'))).toThrow(/not a coverage baseline/);
  });

  it('a missing file is still "no baseline yet"', () => {
    expect(loadBaseline(path.join(os.tmpdir(), 'conducks-no-such-dir', 'coverage-baseline.json'))).toBeNull();
  });
});

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SourceLineReader } from '@/lib/core/utils/source-line.js';

/**
 * ADR 0132 / todo39#P1 — the reader that turns a stored (file, line) into the line of code.
 *
 * Every call-site line number is already in the vault (ADR 0110) and already reaches `impact --json`
 * as `line` and `lines[]` — measured, not assumed. What was missing is reading the source back at
 * answer time, which is the whole difference between `execute (cohesion.ts:38)` and the line a
 * reader can act on.
 *
 * The two honesty cases matter as much as the happy one. A vault older than the working tree points
 * at a line that has moved or gone, and printing whatever now sits at that number would be a
 * confident wrong answer — the failure this project has fixed five times (CONDUCKS-37).
 */
describe('SourceLineReader', () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-srcline-'));
    file = path.join(dir, 'sample.ts');
    fs.writeFileSync(file,
      'import { format } from "./util.js";\n' +   // 1
      '\n' +                                       // 2
      'export function fetchUser(id: string) {\n' +// 3
      '  return format(id);\n' +                   // 4
      '}\n');                                      // 5
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns the trimmed source line', () => {
    const r = new SourceLineReader();
    expect(r.read(file, 4)).toEqual({ line: 4, text: 'return format(id);' });
  });

  it('says the line is past the end rather than inventing one', () => {
    const r = new SourceLineReader();
    const got = r.read(file, 999);
    expect(got.text).toBeNull();
    expect(got.reason).toBe('past-end');
  });

  it('says the file is gone rather than reporting an empty line', () => {
    const r = new SourceLineReader();
    const got = r.read(path.join(dir, 'deleted.ts'), 1);
    expect(got.text).toBeNull();
    expect(got.reason).toBe('unreadable');
  });

  /**
   * One read per distinct FILE, not per call site. A symbol called eleven times from one file must
   * not open that file eleven times — the cost has to scale with the answer's file count.
   */
  it('reads each file once however many lines are asked for', () => {
    const r = new SourceLineReader();
    r.readMany(file, [1, 3, 4]);
    r.read(file, 5);
    expect(r.stats().fileReads).toBe(1);
  });

  it('readMany preserves order and reports each line', () => {
    const r = new SourceLineReader();
    expect(r.readMany(file, [4, 1]).map(l => l.text))
      .toEqual(['return format(id);', 'import { format } from "./util.js";']);
  });

  it('a blank line is text, not an absence', () => {
    // Line 2 is empty. `null` means "could not read"; an empty string means "this line is blank",
    // and collapsing the two would report a real line as unreadable.
    const got = new SourceLineReader().read(file, 2);
    expect(got.text).toBe('');
    expect(got.reason).toBeUndefined();
  });
});

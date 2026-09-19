import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * A raw NUL byte in a source file makes every text tool skip that file SILENTLY.
 *
 * `grep` classifies a file containing a NUL as binary and refuses it — not "0
 * matches", no output at all — so a search for a symbol defined in that file comes
 * back empty and reads exactly like the symbol not existing. `file(1)` calls it
 * `data`. Editors, diffs and review tools degrade the same way.
 *
 * Measured on 2026-09-05: `src/interfaces/cli/shared/display-path.ts` carried two,
 * used as a cache-key separator — `absOrRel + '\0' + (root ?? '')`, which is a
 * sound technique because a NUL cannot occur in a path. The mistake was writing the
 * raw byte into the source instead of the escape. `grep -c pathCache` on that file
 * printed nothing while the file defined `pathCache` three times.
 *
 * The escape `\0` compiles to the same character, so nothing about the fix costs
 * runtime behaviour. This test exists because the defect is invisible by
 * construction: the tool you would use to find it is the tool it disables.
 */
const textFile = (f: string) => /\.(ts|tsx|js|mjs|cjs|json|md|css|html|scm|yml|yaml)$/.test(f);

describe('no tracked text file is binary to grep', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean).filter(textFile);

  it('found files to check — a scan over nothing is not a pass (ADR 0044)', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('contains no raw NUL byte', () => {
    const offenders = files.filter(f => {
      try { return fs.readFileSync(f).includes(0); } catch { return false; }
    });
    expect(offenders).toEqual([]);
  });
});

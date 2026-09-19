import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { VAULT_DIR, VAULT_DB_FILENAME } from '@/contracts/index.js';

/**
 * A filename is a contract between the writer and every reader, and this one had eight readers.
 *
 * `persistence.ts` writes `.conducks/conducks-synapse.db` and nothing else ever has. `doctor` also
 * accepted `synapse.db` and `conducks.db` — names no version of conducks produces and nothing
 * migrates — so `doctor` reported "Vault at .conducks/ (last pulse: …)" for a directory `list`
 * called `not-analyzed`. Two commands disagreeing about whether a project has been analyzed is
 * worse than either answer alone, and neither was wrong about its own rule (todo77#P12).
 *
 * Pinned here rather than in either command, because the defect was the SECOND copy, not either
 * command's logic.
 */

const SRC = path.resolve('src');

/** Every `.ts` under src/, so a new reader cannot quietly add a ninth copy. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { sources(p, out); continue; }
    if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('the vault filename is declared once', () => {
  it('names the file the writer actually produces', () => {
    expect(VAULT_DB_FILENAME).toBe('conducks-synapse.db');
    expect(VAULT_DIR).toBe('.conducks');
  });

  it('is hardcoded nowhere but its own declaration', () => {
    const offenders = sources(SRC)
      .filter(p => !p.endsWith(path.join('contracts', 'vault.ts')))
      .filter(p => readFileSync(p, 'utf8').includes(VAULT_DB_FILENAME))
      .map(p => path.relative(SRC, p));
    expect(offenders).toEqual([]);
  });

  /**
   * The specific disagreement. `doctor` accepting a name `list` rejects is how one command called a
   * project analyzed while the other called it empty — so neither may carry a name of its own.
   */
  it('leaves doctor and list reading the same name as each other', () => {
    for (const cmd of ['doctor', 'list']) {
      const src = readFileSync(path.join(SRC, 'interfaces/cli/commands', `${cmd}.ts`), 'utf8');
      expect(src).toContain('VAULT_DB_FILENAME');
      // the two legacy names doctor used to accept
      expect(src).not.toContain('synapse.db\'');
      expect(src).not.toContain('conducks.db\'');
    }
  });
});

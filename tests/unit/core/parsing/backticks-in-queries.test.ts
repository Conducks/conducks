import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A backtick inside a query file TERMINATES the template literal that holds it.
 *
 * Every language queries.ts exports its tree-sitter patterns as a template literal, so a backtick in a
 * comment — the natural way to write `encapsed_string` or `flow.ts` in prose — silently ends the
 * string and the file stops compiling with an error pointing at the SQL-ish text rather than at the
 * quote. It cost three separate debug cycles in one sitting.
 *
 * The failure is loud (a typecheck error) but the CAUSE is not, so this test names it directly:
 * a compile error in a query file should say "you used a backtick", not "',' expected".
 */
const QUERY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/lib/core/parsing/languages');

describe('query files hold no backticks', () => {
  const files = readdirSync(QUERY_DIR)
    .map(lang => path.join(QUERY_DIR, lang, 'queries.ts'))
    .filter(f => { try { readFileSync(f); return true; } catch { return false; } });

  it('finds the query files at all — a passing check over zero files is not a pass', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${path.basename(path.dirname(file))}: the query literal contains no backtick`, () => {
      const src = readFileSync(file, 'utf8');
      const open = src.indexOf('= `');
      expect(open).toBeGreaterThan(-1);
      // Everything between the opening backtick and the file's LAST one is the literal's body.
      const body = src.slice(open + 3, src.lastIndexOf('`'));
      // UNESCAPED only. `\\`` inside a template literal is legal and several query files use it
      // correctly to name a grammar field in prose — flagging those was this test's own first
      // version, and it failed three files that compile fine.
      const offending = body.split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(x => /(^|[^\\])`/.test(x.line));
      expect(offending.map(x => `line ${x.n}: ${x.line.trim()}`)).toEqual([]);
    });
  }
});

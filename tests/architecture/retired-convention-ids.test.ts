import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/**
 * The `CONDUCKS-N` convention ids are RETIRED, and a retired address must stay retired.
 *
 * `docs/conventions.md` defined 49 rules as `CONDUCKS-1` … `CONDUCKS-49` and ADR 0193 deleted the
 * file. ADR 0194 retired the ids; ADR 0195 carries the translation table saying where each rule
 * actually landed — 16 into gates, 23 into a module note's `**Boundaries:**`, 9 into a skill, one
 * into the global CLAUDE.md, one dropped.
 *
 * MEASURED at the start of that work: 256 citations across 131 files, of which 87 were in `src/`
 * and `tests/` code comments. Seven of them were already pointing at the WRONG rule — `traversal.ts`
 * cited the weighted-Dijkstra rule for A* code, `persistence.ts` cited it for PageRank — and nobody
 * noticed for as long as those comments had existed. That is what an ungated address does: it
 * resolves by luck, and it keeps reading as a citation long after it stopped being one.
 *
 * So this is the gate that stops the scheme coming back. A live file citing `CONDUCKS-<n>` is
 * pointing at a definition no file holds.
 */

/** Files that legitimately still carry an id, and why each one does. */
const ALLOWED = [
  // This gate itself. It has to name the pattern it forbids, and its own prose cites the range the
  // scheme covered. The translation table (ADR 0195) left the repo with docs/ on 2026-11-11 and
  // lives in the owner's private notes, so it is no longer checked here.
  'tests/architecture/retired-convention-ids.test.ts',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', '.conducks', 'dist', 'coverage']);
const ID = /CONDUCKS-\d+/;

/** Every tracked text file, minus the places a citation is allowed to survive. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, out);
    } else if (/\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|scm|sh)$/.test(entry.name)) {
      if (!ALLOWED.some(a => rel.startsWith(a))) out.push(rel);
    }
  }
  return out;
}

describe('the retired convention ids stay retired (ADR 0194, ADR 0195)', () => {
  it('no live file cites a CONDUCKS-<n>', () => {
    const offenders: string[] = [];
    for (const rel of walk(ROOT)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (!ID.test(text)) continue;
      const line = text.split('\n').findIndex(l => ID.test(l)) + 1;
      offenders.push(`${rel}:${line}  cites a retired id — see docs/decisions/0195-the-convention-ids-retire-into-one-map.md`);
    }
    expect(offenders).toEqual([]);
  });
});

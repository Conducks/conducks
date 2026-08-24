import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../src/interfaces/cli/commands');
const TOOLS = path.resolve(HERE, '../../src/interfaces/tools/tools');

/**
 * An arm reads the base; it does not re-decide it.
 *
 * conducks is an octopus: `analyze` builds the graph, `registry` composes, and every other command
 * is a consumer. The registry holds no logic and neither should anything after it — a threshold in
 * `interfaces/` is a second answer to a question the domain already answered, and the two drift
 * apart silently because nothing joins them.
 *
 * MEASURED across all 35 commands when this was written: four numeric thresholds lived after the
 * registry, and two of them were a live defect. `drift` filtered its improving list at `-0.01`
 * while `drift-engine.ts` counted `improvement_count` at `< 0`, so sofie printed "Improving: 393"
 * with no improving section beneath it — a count whose evidence the same command declined to show.
 * The decay side had the identical split until it was fixed one threshold earlier, which is what
 * made the improving half look deliberate rather than broken.
 *
 * Rendering choices are not decisions. A colour picked from a value, a column width, a truncation
 * for display — those belong here and are allowed by name below.
 */
const ALLOWED: ReadonlyArray<{ file: string; match: string; why: string }> = [
  { file: 'drift.ts', match: "d.velocity > 0.1 ? '\\x1b[31m'", why: 'colour selection, not a verdict — the row is already in the list by then' },
];

const files = (dir: string) => fs.readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => ({ name: f, body: fs.readFileSync(path.join(dir, f), 'utf8') }));

/** A float comparison is a judgement; an integer bound is usually a slice or a column. */
const THRESHOLD = /[<>]=?\s*-?0\.\d+|[<>]=?\s*-?\d+\.\d+/;

const offenders = () => {
  const out: string[] = [];
  for (const dir of [CLI, TOOLS]) {
    if (!fs.existsSync(dir)) continue;
    for (const { name, body } of files(dir)) {
      body.split('\n').forEach((line, i) => {
        const code = line.split('//')[0];
        if (!THRESHOLD.test(code)) return;
        if (ALLOWED.some(a => a.file === name && line.includes(a.match))) return;
        out.push(`${name}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  return out;
};

describe('an arm reads the base, it does not re-decide it', () => {
  it('finds code to scan at all — a check over an empty set passes for the wrong reason', () => {
    expect(files(CLI).length).toBeGreaterThan(20);
  });

  it('no command or tool holds a numeric threshold of its own', () => {
    expect(offenders()).toEqual([]);
  });

  it('every granted exception still matches something', () => {
    // A grant that no longer matches is a stale claim, and the next reader takes it for a live rule.
    const stale = ALLOWED.filter(a => {
      const f = files(CLI).find(x => x.name === a.file);
      return !f || !f.body.includes(a.match);
    }).map(a => `${a.file}: "${a.match}" matches nothing — delete the grant`);
    expect(stale).toEqual([]);
  });
});

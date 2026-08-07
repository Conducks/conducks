// Every CLI command verified so far, re-run against every frozen subject, with the SPECIFIC
// defect each one was fixed for asserted as a check.
//
// WHY THIS EXISTS. The commands are being walked one at a time, and each walk has found defects
// that looked like working features — a filter that never fired, a mode nothing implemented, an
// inventory with its own ordering. Fixing #2 can silently undo #1, and eyeballing #1 again after
// every step is exactly the manual re-check nobody keeps doing. So each fix becomes a CHECK here,
// and the whole set runs after every command.
//
// A check asserts the FIX, not just that the command exited 0. "It ran" is what every one of these
// defects already did.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');
const SUBJECTS = ['scraper', 'orchestrator', 'sofie'].map(name => ({
  name, dir: path.resolve(HERE, '../../../test-projects', name),   // sibling of conducks/, per projects.json
}));

/** Run a command in a subject. Never throws: a non-zero exit is a RESULT, since some checks want it. */
function run(dir, args) {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

// EVERY check runs against non-empty output first. The first version of this harness pointed at a
// directory that does not exist, so every command threw, `out` was empty — and the two checks
// phrased as ABSENCES ("no test file in the hotspots", "no absolute path") both PASSED, because
// nothing is absent from nothing. A harness that reports green when it ran nothing is the exact
// failure the gates it guards were written for.
const nonEmpty = (r) => r.code === 0 && r.out.trim().length > 0;

/** An absolute path in output means a reader pays ~90 identical characters per row (ADR 0132). */
const hasAbsolutePath = (out) => /\/users\/[a-z]/i.test(out);
/** A test file where source belongs — the defect behind three of today's fixes. */
const TEST_LINE = /(^|[\s/])(tests?|__tests__|spec)\/|test_[a-z0-9_]+\.py|\.(test|spec)\.[cm]?[jt]sx?/i;

const CHECKS = [
  {
    cmd: 'status',
    run: (d) => run(d, ['status']),
    checks: [
      ['reports counts', r => nonEmpty(r) && /Nodes:\s+\d+/.test(r.out) && /Edges:\s+\d+/.test(r.out)],
      ['hotspots exclude tests', r => {
        const section = r.out.split('Top Structural Hotspots')[1] ?? '';
        const rows = section.split('\n').filter(l => /^\d+\. /.test(l));
        return nonEmpty(r) && rows.length >= 3 && !rows.some(l => TEST_LINE.test(l));
      }],
      ['hotspot paths are relative', r => {
        const section = r.out.split('Top Structural Hotspots')[1] ?? '';
        const rows = section.split('\n').filter(l => /^\d+\. /.test(l));
        return nonEmpty(r) && rows.length >= 3 && !hasAbsolutePath(section);
      }],
    ],
  },
  {
    cmd: 'status --mode map',
    run: (d) => run(d, ['status', '--mode', 'map']),
    checks: [
      ['an unknown mode EXITS non-zero', r => r.code !== 0],
      ['and names the valid modes', r => /valid modes/i.test(r.out)],
    ],
  },
  {
    cmd: 'list --json',
    run: (d) => run(d, ['list', '--json']),
    checks: [
      ['valid JSON with workspace + links', r => {
        if (!nonEmpty(r)) return false;
        try { const j = JSON.parse(r.out); return typeof j.workspace === 'string' && Array.isArray(j.links); }
        catch { return false; }
      }],
    ],
  },
  {
    cmd: 'query "*"',
    run: (d) => run(d, ['query', '*', '--limit', '5']),
    checks: [
      ['returns symbols', r => nonEmpty(r) && /STRUCTURE|BEHAVIOR|UNIT/.test(r.out)],
      ['does not open with a test file', r => {
        const first = r.out.split('\n').find(l => /STRUCTURE|BEHAVIOR|UNIT/.test(l));
        return nonEmpty(r) && first !== undefined && !TEST_LINE.test(first);
      }],
    ],
  },
];

let failed = 0, passed = 0;
for (const subject of SUBJECTS) {
  console.log(`\n=== ${subject.name}`);
  for (const spec of CHECKS) {
    const r = spec.run(subject.dir);
    for (const [label, assert] of spec.checks) {
      let ok = false;
      try { ok = assert(r); } catch { ok = false; }
      ok ? passed++ : failed++;
      console.log(`  ${ok ? '✓' : '✗'} ${spec.cmd} — ${label}`);
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

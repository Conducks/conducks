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
import { readdirSync, existsSync, statSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');
// DISCOVERED, never listed. A hardcoded set is a harness that checks less than it appears to: add a
// fourth subject and it is silently untested while the run still says "all passed". Every directory
// under test-projects/ that holds a vault is a subject.
const SUBJECT_ROOT = path.resolve(HERE, '../../../test-projects');
const SUBJECTS = readdirSync(SUBJECT_ROOT)
  .map(name => ({ name, dir: path.join(SUBJECT_ROOT, name) }))
  .filter(s => {
    try { return statSync(s.dir).isDirectory(); } catch { return false; }
  })
  .filter(s => {
    // A directory with no vault has never been analyzed — reported, not silently skipped.
    const hasVault = existsSync(path.join(s.dir, '.conducks'));
    if (!hasVault) console.log(`  ·  ${s.name}: no .conducks vault — run 'conducks analyze' there first; NOT checked`);
    return hasVault;
  });

if (SUBJECTS.length === 0) {
  console.error(`No analyzed subjects under ${SUBJECT_ROOT} — nothing was checked, which is not a pass.`);
  process.exit(1);
}
console.log(`Subjects (${SUBJECTS.length}): ${SUBJECTS.map(s => s.name).join(', ')}`);

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

// Checks that are about the TOOL rather than about a subject — run once, not per project.
const GLOBAL_CHECKS = [
  {
    cmd: 'analyze <scope that matches nothing>',
    run: () => {
      // The directory MUST hold source. Mutation-testing caught this check passing for the wrong
      // reason: run in an EMPTY dir, the empty-ROOT refusal fires first and exits 1 whatever the
      // scope logic does, so deleting the scope refusal left the check green. A project with files
      // and a scope naming none of them is the only shape where this check can only be satisfied by
      // the thing it claims to test.
      const dir = mkdtempSync(path.join(tmpdir(), 'conducks-scope-'));
      try {
        mkdirSync(path.join(dir, 'src'), { recursive: true });
        writeFileSync(path.join(dir, 'package.json'), '{"name":"s","version":"1.0.0","type":"module"}');
        writeFileSync(path.join(dir, 'src', 'a.ts'), 'export function realOne(): number { return 1; }\n');
        return run(dir, ['analyze', 'does/not/exist', '--yes']);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    },
    checks: [
      ['a scope naming no file EXITS non-zero', r => r.code !== 0],
      ['and never claims "100% resonance"', r => !/100% resonance/i.test(r.out)],
    ],
  },
  {
    cmd: 'analyze <empty dir>',
    run: () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'conducks-empty-'));
      try { return run(dir, ['analyze', '--yes']); } finally { rmSync(dir, { recursive: true, force: true }); }
    },
    checks: [
      ['a root with no source EXITS non-zero', r => r.code !== 0],
      ['and says nothing was analyzed, not "100% resonance"', r =>
        /nothing was analyzed/i.test(r.out) && !/100% resonance/i.test(r.out)],
    ],
  },
];

let failed = 0, passed = 0;
for (const spec of GLOBAL_CHECKS) {
  const r = spec.run();
  for (const [label, assert] of spec.checks) {
    let ok = false;
    try { ok = assert(r); } catch { ok = false; }
    ok ? passed++ : failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${spec.cmd} — ${label}`);
  }
}
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
const perSubject = CHECKS.reduce((n, c) => n + c.checks.length, 0);
const globals = GLOBAL_CHECKS.reduce((n, c) => n + c.checks.length, 0);
// `analyze`'s heavy regressions — idempotence, node/edge drift, non-ASCII recovery — are NOT
// duplicated here: `npm run bench:health --compare` runs a real analyze against every frozen
// subject and diffs its baseline, and the non-ASCII case is pinned by an integration test. This
// file holds the checks that are cheap and would otherwise go unwatched.
console.log(`\n${passed} passed, ${failed} failed  (${SUBJECTS.length} subject(s) × ${perSubject} + ${globals} global)`);
process.exit(failed > 0 ? 1 : 0);

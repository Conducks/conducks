#!/usr/bin/env node
/**
 * Conducks — the doctor benchmark. Planted ENVIRONMENTS, and the line doctor must print in each.
 *
 * `doctor` is not a graph command, so there is no vault-derived oracle of the kind `entry`, `flows`
 * and `audit` use: it asks the MACHINE six questions and prints six answers. The only way to score
 * an answer is to plant the condition it is reading and check what it says. That is this file.
 * (The one exception — the parse-path claim, which CAN be re-derived from behaviour — is scored
 * separately in `oracle-doctor.mjs`, because it needs a real `analyze` and this file needs none.)
 *
 * WHAT `doctor` CLAIMS (doctor.ts), and therefore what is scored:
 *   1 Node.js      `[✓] Node.js <v>` at >= 18, `[!]` below
 *   2 DuckDB       `[✓] DuckDB loadable`, else `[✗] DuckDB not loadable`
 *   3 parse path   `[✓] Parse path: native tree-sitter, all 13 grammars induced`, else `[!]`/`[✗]`
 *                  — "A doctor that reports a working environment as working when it does not is
 *                     worse than no doctor" (doctor.ts:47). Behaviour-checked in oracle-doctor.mjs.
 *   4 git          `[✓] git available`, else `[✗] git not found`
 *   5 vault        `[✗] No vault found` · `[✓] Vault at .conducks/ (no DB yet …)` ·
 *                  `[✓] Vault at .conducks/ (last pulse: <age>)` from the db file's mtime
 *   6 version      `CONDUCKS_NO_UPDATE_CHECK=1` ⇒ `[✓] Version: update check skipped`
 *
 * Every plant carries its counter-half, because a doctor that prints `[✓]` unconditionally passes
 * every "must say ok" test ever written. Scenarios 05/06 are that pair for git; 01/02/03 for the
 * vault; 08/09 for the db-filename candidate list.
 *
 * WHAT THIS FILE DOES **NOT** TEST — say it plainly rather than let the pass count imply coverage:
 *   · The DuckDB `[✗]` branch. Breaking it means removing `@duckdb/node-api` from this package's
 *     node_modules. Only the `[✓]` half is scored, so this bench cannot tell a real DuckDB check
 *     from `console.log('[✓] DuckDB loadable')`.
 *   · The native-binding `[✗]` branch, and the partial-grammar `[!]` branch, for the same reason.
 *     `oracle-doctor.mjs` proves the `[✓]` claim is TRUE; nothing here proves the `[✗]` path works.
 *   · The Node < 18 `[!]` branch. It would need a second node binary on disk.
 *   · The three reachable-network version branches (behind / latest / unreachable). Only the
 *     deterministic `skipped` branch is scored; the others depend on GitHub being reachable.
 *   · The EXIT CODE. `doctor` exits 0 whatever it finds (measured: no vault, no git ⇒ exit 0), so
 *     it cannot gate CI. That is reported as a finding, not asserted here as if it were correct.
 *   · `doctor <path>`. doctor.ts:78 reads `_args[0]` as a project root; unscored here because every
 *     scenario drives it by cwd, which is how the CLI is actually used.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');

/** A PATH holding node and nothing else — so `which git` cannot resolve. Built once. */
const NODE_ONLY_PATH = (() => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-doctor-path-'));
  symlinkSync(process.execPath, path.join(d, 'node'));
  return d;
})();

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const SCENARIOS = [
  // ── the vault probe: three states, three different lines ───────────────────
  {
    name: '01 no .conducks/ at all is reported as no vault',
    why: 'the base claim of check 5 — the state every un-analyzed project is in',
    plant: {},
    mustSay: ['[✗] No vault found'],
  },
  {
    name: '02 a .conducks/ holding no database is a vault WITHOUT a pulse',
    why: 'counter-half of 01: the directory existing is not the same as a graph existing, and the two must not collapse into one line. `setup` creates the directory before `analyze` ever runs',
    plant: { '.conducks/README': 'x' },
    mustSay: ['[✓] Vault at .conducks/ (no DB yet'],
    mustNotSay: ['No vault found', 'last pulse'],
  },
  {
    name: '03 a database makes it a vault WITH a pulse',
    why: 'counter-half of 02 — the age line must only appear when there is something to date',
    plant: { '.conducks/conducks-synapse.db': 'x' },
    ageMs: 12 * 60_000,
    mustSay: ['last pulse:'],
    mustNotSay: ['no DB yet', 'No vault found'],
  },

  // ── the age arithmetic: three units, planted mtimes ────────────────────────
  {
    name: '04 a pulse minutes old is reported in minutes',
    why: 'doctor.ts:92 — under an hour the age is rounded to minutes. The mtime is PLANTED, so the expected string is known independently of the code that prints it',
    plant: { '.conducks/conducks-synapse.db': 'x' },
    ageMs: 12 * 60_000,
    mustSay: ['last pulse: 12 minutes ago'],
  },
  {
    name: '05 a pulse hours old is reported in hours, not minutes',
    why: 'the boundary above an hour. A doctor printing "180 minutes ago" is technically true and unreadable; more to the point, a unit that never switches is a unit that was never computed',
    plant: { '.conducks/conducks-synapse.db': 'x' },
    ageMs: 3 * HOUR,
    mustSay: ['last pulse: 3 hours ago'],
    mustNotSay: ['minutes ago'],
  },
  {
    name: '06 a STALE vault — days old — is reported in days',
    why: 'the whole point of check 6. A graph five days behind the code is the failure mode doctor exists to surface, and it must not read as "5 minutes ago" or "120 hours ago"',
    plant: { '.conducks/conducks-synapse.db': 'x' },
    ageMs: 5 * DAY,
    mustSay: ['last pulse: 5 days ago'],
    mustNotSay: ['minutes ago', 'hours ago'],
  },

  // ── the db-filename candidate list (doctor.ts:82) ──────────────────────────
  {
    name: '07 the legacy database name synapse.db is still recognised',
    why: 'doctor.ts:82 lists three candidate filenames. A candidate nobody checks is a vault reported as empty on an older layout',
    plant: { '.conducks/synapse.db': 'x' },
    ageMs: 2 * HOUR,
    mustSay: ['last pulse: 2 hours ago'],
  },
  {
    name: '08 a file in .conducks/ that is NOT a candidate database is not a pulse',
    why: 'counter-half of 07 — the candidate list has to be a list, not "any file in the directory". mcp.log lives in .conducks/ on every run and must never be dated as the graph',
    plant: { '.conducks/mcp.log': 'x' },
    ageMs: 2 * HOUR,
    mustSay: ['no DB yet'],
    mustNotSay: ['last pulse'],
  },

  // ── the git probe: an absent tool, planted ─────────────────────────────────
  {
    name: '09 git missing from PATH is reported as missing',
    why: 'the ENVIRONMENT break this campaign is about: PATH is narrowed to a directory holding node alone, so `which git` genuinely cannot resolve. Nothing in the repository is touched',
    plant: {},
    env: { PATH: NODE_ONLY_PATH },
    mustSay: ['[✗] git not found'],
    mustNotSay: ['[✓] git available'],
  },
  {
    name: '10 git present is reported as present',
    why: 'counter-half of 09, and the reason 09 proves anything: the same repository, the same command, only PATH differs',
    plant: {},
    mustSay: ['[✓] git available'],
    mustNotSay: ['git not found'],
  },

  // ── the version notice ─────────────────────────────────────────────────────
  {
    name: '11 the update check is skipped when it is switched off',
    why: 'update-check.ts:66 — CONDUCKS_NO_UPDATE_CHECK=1 returns null, and doctor.ts:108 must read null as "no information", never as "up to date". Every other scenario sets this too, so an offline machine is not what makes this bench red',
    plant: {},
    mustSay: ['[✓] Version: update check skipped'],
    mustNotSay: ['could not reach GitHub', 'Upgrade with:', '(latest)'],
  },

  // ── the always-green lines, asserted for what little they are worth ────────
  {
    name: '12 the three environment checks this bench cannot break still report',
    why: 'HONESTY SCENARIO. Node, DuckDB and the parse path are all healthy on any machine that can run this file, so this only proves the lines are PRINTED — it cannot distinguish a real check from a hard-coded string. The parse-path claim is checked for TRUTH in oracle-doctor.mjs; the other two are unscored',
    plant: {},
    mustSay: ['[✓] DuckDB loadable', '[✓] Node.js v', 'Parse path: native tree-sitter'],
  },
];

function runScenario(s) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-doctor-'));
  try {
    for (const [rel, body] of Object.entries(s.plant)) {
      const abs = path.join(repo, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
      if (s.ageMs != null) {
        const when = new Date(Date.now() - s.ageMs);
        utimesSync(abs, when, when);
      }
    }

    const env = { ...process.env, CONDUCKS_NO_UPDATE_CHECK: '1', ...(s.env ?? {}) };
    const out = execFileSync('node', [CLI, 'doctor'], {
      cwd: repo, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const failures = [];
    for (const want of (s.mustSay ?? [])) {
      if (!out.includes(want)) failures.push(`must say "${want}" — said: ${JSON.stringify(out.split('\n').filter(l => l.startsWith('[')).join(' | '))}`);
    }
    for (const nope of (s.mustNotSay ?? [])) {
      if (out.includes(nope)) failures.push(`must NOT say "${nope}" — said: ${JSON.stringify(out.split('\n').filter(l => l.startsWith('[')).join(' | '))}`);
    }
    return failures;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

console.log(`\n--- the doctor benchmark: ${SCENARIOS.length} planted environments ---\n`);
let passed = 0; const failedNames = [];
for (const s of SCENARIOS) {
  let failures;
  try { failures = runScenario(s); }
  catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
  if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
  else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
}
rmSync(NODE_ONLY_PATH, { recursive: true, force: true });
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ doctor fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ doctor reads every planted environment the way its own claims say it should.`);
console.log(`  UNSCORED: the DuckDB, native-binding and Node<18 failure branches; the three network`);
console.log(`  version branches; the exit code (always 0). See this file's header.\n`);

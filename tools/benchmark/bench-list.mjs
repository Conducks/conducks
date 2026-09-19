#!/usr/bin/env node
/**
 * Conducks — the list benchmark. Planted REGISTRIES, and the status list must say what is in them.
 *
 * `list` is not a graph command and there is no oracle for it, deliberately. Its whole job is to read
 * `<root>/.conducks/links.json` and stat two paths per entry (list.ts:41-46). An "independent"
 * re-derivation would be those same two `existsSync` calls written a second time — two copies of one
 * rule agreeing with each other, which is not evidence. So the registry is PLANTED instead, and the
 * planted state is the truth the output is scored against. See `oracle-list.mjs`… there isn't one,
 * and this paragraph is why.
 *
 * WHAT `list` CLAIMS (list.ts), and therefore what is scored:
 *   · the link file is the ONLY federation state — "there is no federation table in the DuckDB
 *     synapse — so it is also the only thing this command can enumerate" (list.ts:11)
 *   · a link is CHECKED, not echoed: `ok` when `<p>/.conducks/conducks-synapse.db` exists,
 *     `missing` when `<p>` does not exist, `not-analyzed` otherwise (ADR 0114)
 *   · ABSENT ≠ UNREADABLE (linker-federated.ts:90-98, ADR 0114): no file is a legitimate empty and
 *     exits 0; a corrupt or wrongly-shaped file is a FAILURE, printed red and exiting 1. "The user
 *     linked them; the tool said they had not."
 *   · `--json` emits `{ workspace, links: [{path, status}] }`
 *   · the root is `CONDUCKS_WORKSPACE_ROOT || cwd` — "the same root expression as `conducks link`"
 *
 * Each half carries its counter-half: 01 (absent ⇒ empty, exit 0) against 06/07/08 (unreadable ⇒
 * exit 1), and 02 (a live link) against 03/04 (the two ways a link dies), because a checker that
 * calls everything `ok` passes every recall test and a checker that calls everything broken passes
 * every failure test.
 *
 * HOW THE FIXTURES ARE BUILT, and what that costs in honesty: only the WORKSPACE is really analyzed
 * (once — the bootstrapper refuses to run `list` in a directory with no synapse, measured). Neighbour
 * projects are planted files, because `ok` is DEFINED as that file existing. Scenario 02 links the
 * workspace to ITSELF so the `ok` verdict is proven at least once against a genuine analyzed vault.
 *
 * WHAT THIS FILE DOES **NOT** TEST:
 *   · Whether an `ok` vault is a VALID one. `list` stats a filename; it never opens the database, so
 *     a zero-byte `conducks-synapse.db` is reported `ok`. That is list's rule, faithfully scored —
 *     not a rule this bench can strengthen.
 *   · `conducks link` itself. The registry here is written directly, so nothing proves `link`
 *     produces the shape `list` reads. Only that `list` reads the shape ADR 0114 documents.
 *   · An unreadable-for-permissions link file (EACCES). getLinks() has a branch for it; running as
 *     root in CI makes a chmod-000 fixture readable, so the branch is left unscored rather than
 *     scored flakily.
 *   · Hydration. `getLinks()` is also what `hydrate()` reads; nothing here loads a neighbour graph.
 *   · The real user registry at `~/.conducks/`. Never read, never written — `list` is per-workspace.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');
const ENV = { ...process.env, CONDUCKS_NO_UPDATE_CHECK: '1' };

/** The workspace `list` runs in: a one-file repo with a REAL vault, built once. */
function buildWorkspace() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-list-ws-'));
  mkdirSync(path.join(repo, 'src'));
  writeFileSync(path.join(repo, 'src/a.ts'), 'export function a(): number { return 1; }\n');
  for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
    execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
  }
  execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, env: ENV, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  return repo;
}

/** A neighbour in one of the three states list.ts:41 distinguishes. */
function plantNeighbour(kind) {
  const p = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-list-n-'));
  if (kind === 'gone') { rmSync(p, { recursive: true, force: true }); return p; }
  if (kind === 'analyzed') {
    mkdirSync(path.join(p, '.conducks'));
    writeFileSync(path.join(p, '.conducks/conducks-synapse.db'), 'planted');
  }
  if (kind === 'wrong-db-name') {
    mkdirSync(path.join(p, '.conducks'));
    writeFileSync(path.join(p, '.conducks/synapse.db'), 'planted');
  }
  return p;
}

const SCENARIOS = [
  {
    name: '01 no link file at all is an EMPTY workspace, not an error',
    why: 'the legitimate empty. linker-federated.ts:101 returns [] only for ENOENT — every other read failure is a throw, which is the whole of ADR 0114',
    links: null,
    mustSay: ['No federated projects linked.'],
    mustNotSay: ['no longer resolve'],
    exit: 0,
    json: r => r.links.length === 0 ? null : `--json must report zero links, got ${r.links.length}`,
  },
  {
    name: '02 a link to a genuinely analyzed project is live',
    why: 'the base claim, and the ONE scenario whose ok verdict rests on a real vault rather than a planted filename — the workspace links to itself',
    linkSelf: true,
    mustSay: ['Linked projects (1):', '✓'],
    mustNotSay: ['no longer resolve', 'path no longer exists', 'never analyzed'],
    exit: 0,
    json: r => r.links[0]?.status === 'ok' ? null : `status must be ok, got ${r.links[0]?.status}`,
  },
  {
    name: '03 a link whose path is GONE is reported, not echoed',
    why: 'the ADR 0114 headline. `link` checks the target once, at write time, and nothing ever looked again — so a deleted project listed exactly like a live one',
    neighbours: ['gone'],
    mustSay: ['path no longer exists', '1 of 1 link(s) no longer resolve'],
    exit: 0,
    json: r => r.links[0]?.status === 'missing' ? null : `status must be missing, got ${r.links[0]?.status}`,
  },
  {
    name: '04 a link to a project that exists but was never analyzed is a THIRD state',
    why: 'counter-half of 03 — present-but-empty and absent are different problems with different fixes, and collapsing them into one "broken" tells the user to do the wrong thing',
    neighbours: ['bare'],
    mustSay: ['never analyzed', '1 of 1 link(s) no longer resolve'],
    mustNotSay: ['path no longer exists'],
    exit: 0,
    json: r => r.links[0]?.status === 'not-analyzed' ? null : `status must be not-analyzed, got ${r.links[0]?.status}`,
  },
  {
    name: '05 three links in three states are counted, not lumped',
    why: 'the arithmetic on list.ts:71 — "2 of 3" is the number a user acts on, and it must count the broken ones only',
    neighbours: ['analyzed', 'gone', 'bare'],
    mustSay: ['Linked projects (3):', '2 of 3 link(s) no longer resolve'],
    exit: 0,
    json: r => JSON.stringify(r.links.map(l => l.status)) === '["ok","missing","not-analyzed"]'
      ? null : `statuses must be ok,missing,not-analyzed — got ${r.links.map(l => l.status).join(',')}`,
  },
  {
    name: '06 a CORRUPT link file fails loudly instead of reading as an empty workspace',
    why: 'the defect ADR 0114 was written for: one catch{return []} made "your links are unparseable" print as "No federated projects linked." and exit 0. This scenario is the reason the whole file exists',
    links: '{ not json at all',
    mustSay: ['is not valid JSON', 'an unreadable link list is not the same as having no links'],
    mustNotSay: ['No federated projects linked.'],
    exit: 1,
  },
  {
    name: '07 a link file that parses but holds the WRONG SHAPE also fails',
    why: 'counter-half of 06 — valid JSON is not a valid link list, and returning an object verbatim pushes the problem into every caller (linker-federated.ts:118)',
    links: '{"links": ["/somewhere"]}',
    mustSay: ['must be a JSON array of project paths'],
    mustNotSay: ['No federated projects linked.', 'Linked projects'],
    exit: 1,
  },
  {
    name: '08 an array of non-strings is the wrong shape too',
    why: 'the half of the shape check that is easy to leave out — Array.isArray alone passes [1,2] straight through to path.join, where it fails much later and much less clearly',
    links: '[1, 2]',
    mustSay: ['must be a JSON array of project paths'],
    exit: 1,
  },
  {
    name: '09 a neighbour vault under a DIFFERENT database filename is not `ok`',
    why: 'counter-half of 02, and a real inconsistency worth pinning: `doctor` accepts three database filenames (doctor.ts:82), `list` accepts exactly one. Scored as list.ts actually claims — the legacy name is NOT ok — so that the day the two are reconciled, this scenario says so',
    neighbours: ['wrong-db-name'],
    mustSay: ['never analyzed'],
    exit: 0,
    json: r => r.links[0]?.status === 'not-analyzed' ? null : `status must be not-analyzed, got ${r.links[0]?.status}`,
  },
  {
    name: '10 CONDUCKS_WORKSPACE_ROOT decides which link file is read',
    why: 'list.ts:25 claims "the same root expression as `conducks link`". Planted so the two candidate files DISAGREE: cwd holds one link, the env root holds three — reading the wrong one is then visible rather than a coincidence',
    neighbours: ['analyzed'],
    envRootNeighbours: ['analyzed', 'gone', 'bare'],
    mustSay: ['Linked projects (3):', '2 of 3 link(s) no longer resolve'],
    mustNotSay: ['Linked projects (1):'],
    exit: 0,
  },
];

function writeLinks(root, body) {
  mkdirSync(path.join(root, '.conducks'), { recursive: true });
  writeFileSync(path.join(root, '.conducks/links.json'), body);
}

function run(cwd, args, env) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function runScenario(s, ws) {
  const made = [];
  try {
    let env = ENV;
    const paths = (s.neighbours ?? []).map(k => { const p = plantNeighbour(k); made.push(p); return p; });

    if (s.linkSelf) writeLinks(ws, JSON.stringify([ws]));
    else if (s.links === null) rmSync(path.join(ws, '.conducks/links.json'), { force: true });
    else if (typeof s.links === 'string') writeLinks(ws, s.links);
    else writeLinks(ws, JSON.stringify(paths));

    if (s.envRootNeighbours) {
      const alt = mkdtempSync(path.join(os.tmpdir(), 'conducks-bench-list-alt-'));
      made.push(alt);
      const altPaths = s.envRootNeighbours.map(k => { const p = plantNeighbour(k); made.push(p); return p; });
      writeLinks(alt, JSON.stringify(altPaths));
      env = { ...ENV, CONDUCKS_WORKSPACE_ROOT: alt };
    }

    const failures = [];
    const text = run(ws, ['list'], env);
    for (const want of (s.mustSay ?? [])) if (!text.out.includes(want)) failures.push(`must say "${want}" — said: ${JSON.stringify(text.out.slice(-400))}`);
    for (const nope of (s.mustNotSay ?? [])) if (text.out.includes(nope)) failures.push(`must NOT say "${nope}"`);
    if (s.exit != null && text.code !== s.exit) failures.push(`must exit ${s.exit}, exited ${text.code}`);

    if (s.json) {
      const j = run(ws, ['list', '--json'], env);
      let parsed = null;
      try { parsed = JSON.parse(j.out.slice(j.out.indexOf('{'))); }
      catch { failures.push(`--json did not emit parseable JSON: ${JSON.stringify(j.out.slice(-200))}`); }
      if (parsed) {
        const problem = s.json(parsed);
        if (problem) failures.push(problem);
        if (typeof parsed.workspace !== 'string') failures.push('--json must carry the workspace root');
      }
    }
    return failures;
  } finally {
    for (const p of made) rmSync(p, { recursive: true, force: true });
  }
}

console.log(`\n--- the list benchmark: ${SCENARIOS.length} planted registries ---\n`);
const ws = buildWorkspace();
let passed = 0; const failedNames = [];
try {
  for (const s of SCENARIOS) {
    let failures;
    try { failures = runScenario(s, ws); }
    catch (err) { failures = [`scenario crashed: ${String(err.message).split('\n')[0]}`]; }
    if (failures.length === 0) { passed++; console.log(`  ✓ ${s.name}`); }
    else { failedNames.push(s.name.slice(0, 2)); console.log(`  ✖ ${s.name}`); for (const f of failures) console.log(`      ${f}`); }
  }
} finally {
  rmSync(ws, { recursive: true, force: true });
}
console.log(`\n  ${passed} of ${SCENARIOS.length} scenarios pass.`);
if (passed !== SCENARIOS.length) { console.error(`\n✖ list fails: ${failedNames.join(', ')}\n`); process.exit(1); }
console.log(`\n✓ list reports every planted registry the way ADR 0114 says it should.`);
console.log(`  UNSCORED: whether an \`ok\` vault is a valid database; \`conducks link\` writing the file;`);
console.log(`  the EACCES branch of getLinks(); federated hydration. See this file's header.\n`);

// Prove every cli-smoke check can FAIL. A check written after its fix has never been seen red, and
// one that cannot go red is a false positive wearing a tick.
//
// For each mutation: apply it to the source, rebuild, run the harness, record which checks flipped,
// then restore from git. A mutation that flips NOTHING is the finding.
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });

const MUTATIONS = [
  {
    name: 'status: restore the dead isTest flag',
    file: 'src/interfaces/cli/commands/status.ts',
    from: '.filter(n => !isTestNode(n))',
    to: '.filter(n => !(n.properties as any).isTest)',
    expect: 'hotspots exclude tests',
  },
  {
    name: 'status: drop --mode validation',
    file: 'src/interfaces/cli/commands/status.ts',
    from: "      if (!mode || !MODES.has(mode)) {",
    to: "      if (false) {",
    expect: 'an unknown mode EXITS non-zero',
  },
  {
    name: 'status: print absolute hotspot paths',
    file: 'src/interfaces/cli/commands/status.ts',
    from: '${chalk.magenta(rel(n.id))}',
    to: '${chalk.magenta(n.id)}',
    expect: 'hotspot paths are relative',
  },
  {
    name: 'search: drop the inventory demotion',
    file: 'src/lib/domain/intelligence/search-engine.ts',
    from: '(n.properties.rank ?? 0) * (isTestNode(n) ? TEST_WEIGHT : 1)',
    to: '(n.properties.rank ?? 0)',
    expect: 'does not open with a test file',
  },
  {
    name: 'analyze: drop the empty-root refusal',
    file: 'src/lib/domain/analysis/index.ts',
    from: '    if (filteredFiles.length === 0) {',
    to: '    if (false) {',
    expect: 'a root with no source EXITS non-zero',
  },
  {
    name: 'analyze: drop the empty-scope refusal',
    file: 'src/lib/domain/analysis/index.ts',
    from: '      if (!filteredFiles.some(f => f.startsWith(targetRoot))) {',
    to: '      if (false) {',
    expect: 'a scope naming no file EXITS non-zero',
  },
];

function smokeFailures() {
  try {
    execFileSync('node', ['tools/benchmark/cli-smoke.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return [];
  } catch (e) {
    return String(e.stdout ?? '').split('\n').filter(l => l.includes('✗')).map(l => l.trim());
  }
}

console.log('baseline (expect zero failures):', smokeFailures().length);

for (const m of MUTATIONS) {
  const path = `${ROOT}/${m.file}`;
  const original = readFileSync(path, 'utf8');
  if (!original.includes(m.from)) {
    console.log(`\n!! ${m.name}: ANCHOR NOT FOUND — mutation never applied, proves nothing`);
    continue;
  }
  writeFileSync(path, original.replace(m.from, m.to));
  try {
    sh('npm run build');
    const failures = smokeFailures();
    const hit = failures.filter(f => f.includes(m.expect));
    console.log(`\n${m.name}`);
    console.log(`  expected "${m.expect}" to fail → ${hit.length > 0 ? `YES (${hit.length} subject/global)` : 'NO — CHECK IS VACUOUS'}`);
    if (failures.length > 0) console.log(`  total checks that flipped: ${failures.length}`);
  } finally {
    writeFileSync(path, original);
  }
}

sh('npm run build');
console.log('\nrestored. final baseline failures:', smokeFailures().length);

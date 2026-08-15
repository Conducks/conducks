#!/usr/bin/env node
/**
 * Conducks — score `prune` against the TypeScript compiler. 🏺
 *
 * WHY THIS EXISTS. Every hand-written grammar rule answers one question: "does this count as USING
 * the name?" Tree-sitter cannot know — it reads the SHAPE of code, not its meaning. The compiler
 * knows by construction, because it cannot compile without knowing.
 *
 * Thirteen defects were fixed on 2026-08-14/15, all of that one class: an array element, a ternary
 * branch, an enum member read, a JSX handler, an object shorthand, a default export, the SECOND
 * argument of a call. Each was found by pointing conducks at a project, noticing a wrong answer by
 * hand, and adding a rule. That loop has no end condition — the next project writes code in a shape
 * nobody has covered yet, and nothing says how many shapes remain.
 *
 * This replaces sampling with comparison. Every disagreement with `tsc` is a defect in one of two
 * directions, and both are reported:
 *
 *   MISSED  — tsc says the import is unused, conducks is silent  → RECALL gap
 *   EXTRA   — conducks says stale, tsc says it is used           → PRECISION bug, the dangerous one
 *
 * EXTRA is what the thirteen defects looked like from the outside. All thirteen would have appeared
 * here in one run, mechanically, instead of over three sessions of hand-checking symbols.
 *
 * SCOPE, kept narrow on purpose. Only unused IMPORTS are comparable:
 *   - Only `TS6133` (declared but never read), not every diagnostic.
 *   - Only imports whose specifier is IN-PROJECT (`./…` or `@/…`). conducks deliberately never
 *     judges a stdlib or package import, because it emits no per-binding edge for one — measured on
 *     this repository, 40 of tsc's 46 non-test findings are exactly those, and counting them would
 *     make the score meaningless.
 *   - Test files are skipped, which is `prune`'s own rule (`isTestPath`).
 *
 * WHAT IT IS NOT. `--noUnusedLocals` sees inside ONE file. It says nothing about an export nothing
 * imports, which is what `UNUSED_EXPORT` and `ORPHAN` answer — those need a different oracle
 * (knip/ts-prune) and are out of scope here rather than silently half-covered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

/** tsc's verdict: every unused IMPORT whose specifier is in-project. */
function oracleUnusedImports() {
  let out = '';
  try {
    execFileSync('npx', ['tsc', '--noUnusedLocals', '--noEmit', '--pretty', 'false'],
      { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // tsc exits non-zero when it reports anything — that is the normal path here, not a failure.
    out = String(err.stdout ?? '');
  }
  const found = new Map();
  const rows = [];
  for (const line of out.split('\n')) {
    // TWO diagnostics, not one. tsc emits TS6133 per unused SYMBOL, but when EVERY name in an import
    // declaration is unused it emits TS6192 for the whole statement instead and names none of them.
    // Parsing only TS6133 therefore misses exactly the imports conducks is best at finding — and it
    // reported conducks' correct `NodeId` finding as a precision bug, because the oracle was blind
    // to it. An oracle has to be checked like anything else.
    const one = line.match(/^(.+?)\((\d+),\d+\): error TS6133: '(.+?)'/);
    if (one) { rows.push({ file: one[1], lineNo: one[2], symbol: one[3] }); continue; }
    const all = line.match(/^(.+?)\((\d+),\d+\): error TS6192:/);
    if (!all) continue;
    // Recover the names from the declaration itself: `import { A, B, type C } from '...'`.
    let decl = '';
    try { decl = readFileSync(path.resolve(projectDir, all[1]), 'utf8').split('\n')[+all[2] - 1] ?? ''; } catch { continue; }
    const inner = decl.match(/\{([^}]*)\}/)?.[1] ?? '';
    for (const raw of inner.split(',')) {
      const nm = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      if (nm) rows.push({ file: all[1], lineNo: all[2], symbol: nm });
    }
  }
  for (const { file, lineNo, symbol } of rows) {
    if (isTestPath(file)) continue;
    let src = '';
    try { src = readFileSync(path.resolve(projectDir, file), 'utf8').split('\n')[+lineNo - 1] ?? ''; } catch { continue; }
    const spec = src.match(/from\s+['"](.+?)['"]/)?.[1];
    if (!spec || !(spec.startsWith('.') || spec.startsWith('@/'))) continue;   // in-project only
    found.set(`${file.toLowerCase()}::${symbol.toLowerCase()}`, { file, symbol, line: +lineNo, spec });
  }
  return found;
}

/** conducks' verdict: every STALE_IMPORT. */
function conducksStaleImports() {
  // RE-ANALYZE FROM AN EMPTY VAULT, ALWAYS. `prune` answers from the vault, and a GRAMMAR change
  // alters no file hash — so `analyze` skips every file as unchanged and the score is taken against
  // the PREVIOUS build. Measured twice while writing this: removing a capture pattern, rebuilding
  // and re-running left the numbers identical and the gate green, first with no analyze at all and
  // then with an analyze that no-opped. A gate that scores stale data is worse than no gate, because
  // it reports success. The vault is derived state and costs seconds to rebuild.
  rmSync(path.join(projectDir, '.conducks'), { recursive: true, force: true });
  execFileSync('node', [CLI, 'analyze'], { cwd: projectDir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
  const raw = execFileSync('node', [CLI, 'prune', '--json'],
    { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const found = new Map();
  for (const f of JSON.parse(raw)) {
    if (f.type !== 'STALE_IMPORT') continue;
    // Node ids are LOWERCASED on write (CONDUCKS-4), so `f.file` is an absolute path in a case the
    // filesystem may not use. Relativising it against the real-cased projectDir produces a path full
    // of `../` — which then matches nothing and reports every finding as an EXTRA. Compare lowercase
    // to lowercase, and only then relativise.
    const lowerRoot = projectDir.toLowerCase();
    const abs = String(f.file).toLowerCase();
    const rel = abs.startsWith(lowerRoot) ? abs.slice(lowerRoot.length).replace(/^[/\\]/, '') : abs;
    if (isTestPath(rel)) continue;
    found.set(`${rel}::${String(f.symbol).toLowerCase()}`, f);
  }
  return found;
}

const oracle = oracleUnusedImports();
const ours = conducksStaleImports();

const missed = [...oracle].filter(([k]) => !ours.has(k)).map(([, v]) => v);
const extra = [...ours].filter(([k]) => !oracle.has(k)).map(([, v]) => v);
const agreed = [...oracle].filter(([k]) => ours.has(k)).length;

console.log(`\n--- prune vs tsc, in-project unused imports (${path.basename(projectDir)}) ---`);
console.log(`  tsc found      : ${oracle.size}`);
console.log(`  conducks found : ${ours.size}`);
console.log(`  agreed         : ${agreed}`);
console.log(`  MISSED (recall gap — tsc says unused, conducks silent): ${missed.length}`);
for (const m of missed) console.log(`      ${m.symbol}  from '${m.spec}'  ${m.file}:${m.line}`);
console.log(`  EXTRA (precision bug — conducks says stale, tsc says used): ${extra.length}`);
for (const e of extra) console.log(`      ${e.symbol}  ${path.relative(projectDir, e.file)}`);

// ── The gate is TWO-SIDED, and that is the whole point ──────────────────────────────────────────
//
// Adding a capture rule can only ever REMOVE findings. Precision alone is therefore gameable to the
// limit: capture every identifier position and `prune` reports nothing, scoring perfectly while
// being useless. That is not hypothetical — thirteen rules were added over two days, each correct on
// its own, and nothing measured what they cost together until this file existed.
//
//   EXTRA   → hard fail. Contradicting the compiler tells a reader to delete live code.
//   MISSED  → RATCHET. It may fall freely; it may never rise. A rule that silences a TRUE finding
//             increases it, and the build stops.
//
// The ratchet is what makes the trade impossible rather than merely visible.
const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {};
try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { /* first run writes it */ }
const key = path.basename(projectDir);
const prev = baseline[key];

// ── The ORACLE ITSELF IS CHECKED FIRST ──────────────────────────────────────────────────────────
//
// An oracle that silently stops finding things turns this gate into a rubber stamp: MISSED drops to
// zero, EXTRA drops to zero, everything looks perfect. The first version of this file parsed only
// TS6133 and was blind to TS6192 — the diagnostic tsc emits when EVERY name in a declaration is
// unused — so it reported a CORRECT conducks finding as a precision bug. It was wrong in the
// direction that looks like success, which is the direction nothing catches by itself.
if (oracle.size === 0) {
  console.error(`\n✖ the oracle found NOTHING. tsc produced no in-project unused imports at all, ` +
    `which almost certainly means it failed to run or its output shape changed — not that the ` +
    `project is clean. Refusing to score against a silent oracle.\n`);
  process.exit(1);
}
if (prev && oracle.size < prev.oracle * 0.5) {
  console.error(`\n✖ the oracle found ${oracle.size}, less than half of the ${prev.oracle} it found ` +
    `before. Treat that as the oracle breaking, not the project improving.\n`);
  process.exit(1);
}

let failed = false;
if (extra.length > 0) {
  console.error(`\n✖ ${extra.length} finding(s) the compiler contradicts — precision bug.`);
  failed = true;
}
if (prev && missed.length > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now. ` +
    `Something stopped reporting a finding the compiler still makes. That is precision bought with ` +
    `silence, and it is the failure this ratchet exists to catch.`);
  failed = true;
}
if (failed) process.exit(1);

if (process.argv.includes('--write-baseline') || !prev) {
  baseline[key] = { oracle: oracle.size, missed: missed.length, agreed, recorded: 'run with --write-baseline to update' };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}: oracle=${oracle.size} missed=${missed.length}`);
}
console.log(`\n✓ no finding contradicts the compiler` +
  (prev ? `, and recall did not regress (${prev.missed} → ${missed.length} missed).` : `.`) + `\n`);

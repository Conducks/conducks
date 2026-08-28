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
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resetVault } from './reset-vault.mjs';

// A FLAG IS NOT A PATH. This read `process.argv[2]` positionally, so
// `npm run oracle:imports -- --write-baseline` resolved `--write-baseline` as the project directory
// and died with `spawnSync node ENOENT` — an error naming neither the flag nor the path.
const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

/**
 * The REAL compiler, resolved rather than looked up on PATH.
 *
 * This ran `npx tsc`, which resolves whatever the project happens to have. Pointed at the sofie
 * subject it found a package that prints "This is not the tsc command you are looking for" and exits
 * 0 — so the oracle saw no diagnostics and would have scored prune against silence. The liveness
 * probe caught it, which is the only reason this is a fixed bug rather than a green tick.
 *
 * Prefers the project's own TypeScript so a subject is judged by the compiler it builds with, and
 * falls back to this repository's, which is a devDependency and always present.
 */
const resolveTsc = (dir) => {
  const local = path.join(dir, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(local)) return local;
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../node_modules/typescript/bin/tsc');
};
const TSC = resolveTsc(projectDir);

/**
 * The files tsc ACTUALLY COMPILED, which is not the same as the files in the repository.
 *
 * `EXTRA` means "conducks says stale and the compiler says used" — but a file the compiler never
 * opened produces no diagnostic either way, and counting that as a contradiction blames prune for
 * the oracle's blind spot. MEASURED the first time this ran on the sofie subject: its tsconfig is
 * `include: ["src/**\/*"]`, both prune findings were in `renderer/` and `scripts/`, and the oracle
 * reported 2 precision bugs against findings later verified true by hand.
 */
function compiledFiles() {
  let out = '';
  try {
    out = execFileSync('node', [TSC, '--noEmit', '--listFiles', '--pretty', 'false'],
      { cwd: projectDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (err) { out = String(err.stdout ?? ''); }
  const set = new Set();
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (t.startsWith('/') && /\.[cm]?[jt]sx?$/.test(t)) set.add(t.toLowerCase());
  }
  return set;
}
const inProgram = compiledFiles();

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

/** tsc's verdict: every unused IMPORT whose specifier is in-project. */
function oracleUnusedImports() {
  let out = '';
  try {
    execFileSync('node', [TSC, '--noUnusedLocals', '--noEmit', '--pretty', 'false'],
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
  // Clears the vault DB and PRESERVES `note-reviews.json`, which is committed (see reset-vault.mjs).
  resetVault(projectDir);
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
// Scored only over files the compiler actually compiled — see `compiledFiles`.
const extra = [...ours]
  .filter(([k, v]) => !oracle.has(k) && (inProgram.size === 0 || inProgram.has(String(v.file).toLowerCase())))
  .map(([, v]) => v);
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
/**
 * Plant an unused import tsc MUST see, and report whether the oracle sees it.
 *
 * "The project is clean" and "the instrument is broken" produce the identical empty result, and both
 * guards below used to call that a failure. Correct while conducks carried 29 stale imports of its
 * own; deleting them made its own oracle refuse to run, then refuse again for having dropped by more
 * than half. A gate that cannot tell success from breakage blocks the success.
 *
 * The specifier must be IN-PROJECT — this oracle counts only unused imports whose target is inside
 * the repo, so a probe importing `node:fs` is filtered out and proves nothing. Written that way
 * first, and it reported a working instrument as broken.
 */
function probeDetectsPlantedImport() {
  // SELF-CONTAINED, and placed where the compiler is already looking.
  //
  // The first version imported `./contracts/index.js` — a path that exists in THIS repository and
  // nowhere else — so it proved nothing the moment the oracle was pointed at another project, and
  // reported the orchestrator subject's instrument broken. The second problem is placement: `src/`
  // is not a compiled directory in every project, and a probe outside the program is a probe tsc
  // never opens. Both are answered by writing a target AND its importer beside a file the compiler
  // demonstrably compiled.
  const anchor = [...inProgram].find(f => f.startsWith(projectDir.toLowerCase()) && !f.includes('node_modules'));
  const dir = anchor ? path.dirname(anchor) : path.join(projectDir, 'src');
  const target = path.join(dir, '__oracle_probe_target__.ts');
  const probe = path.join(dir, '__oracle_probe__.ts');
  try {
    writeFileSync(target, "export const PROBE_VALUE = 1;\n");
    writeFileSync(probe, "import { PROBE_VALUE } from './__oracle_probe_target__.js';\nexport const probe = 1;\n");
    return oracleUnusedImports().size > 0;
  } catch {
    return false;
  } finally {
    try { rmSync(probe, { force: true }); rmSync(target, { force: true }); } catch { /* nothing to clean */ }
  }
}

if (oracle.size === 0) {
  // ZERO IS A LEGITIMATE ANSWER ONCE THE PROJECT HAS BEEN CLEANED — but "the project is clean" and
  // "the oracle is broken" produce the identical empty result, and this gate used to call both a
  // failure. That was right while conducks itself carried 29 stale imports; deleting them made its
  // own oracle refuse to run.
  //
  // Distinguished by a POSITIVE CONTROL rather than by trusting the emptiness: plant one unused
  // import that tsc must see, re-run, and require the oracle to find it. If the probe is detected
  // the instrument works and zero is the truth; if it is not, the instrument is broken and zero
  // means nothing. Only runs in the empty case, so it costs nothing on a project that has findings.
  if (!probeDetectsPlantedImport()) {
    console.error(`\n✖ the oracle found NOTHING, and a planted unused import was not detected either. ` +
      `tsc failed to run or its output shape changed — this is a broken instrument, not a clean ` +
      `project. Refusing to score against a silent oracle.\n`);
    process.exit(1);
  }
  console.log(`\n  the oracle found nothing, and a planted probe WAS detected — so the project is ` +
    `genuinely free of in-project unused imports.`);
}
if (prev && oracle.size < prev.oracle * 0.5 && !probeDetectsPlantedImport()) {
  console.error(`\n✖ the oracle found ${oracle.size}, less than half of the ${prev.oracle} it found ` +
    `before, and a planted unused import was not detected either. That is the oracle breaking, not ` +
    `the project improving.\n`);
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

// A MISSING BASELINE IS NOT A PASS (ADR 0044).
//
// This used to read `--write-baseline || !prev`: with no recorded entry for this key it silently
// wrote one and then printed the tick. The key is derived from the subject's DIRECTORY NAME, so
// running against a copy — which is how the frozen subjects are scored without touching them —
// produced a NEW key every time, self-baselined it, and reported green. Found on 2026-08-17 by
// running this oracle on `scraper2`, a copy of `scraper`: it recorded a fresh entry and passed
// while scoring against nothing. The half-verdict it prints in that case ("no finding contradicts
// the parser", without the recall clause) was the only visible difference, and nobody reads a tick
// for a missing sentence.
//
// Recording a baseline is now a DELIBERATE act. Without one, this exits non-zero and says so.
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { oracle: oracle.size, missed: missed.length, agreed, recorded: 'run with --write-baseline to update' };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ no finding contradicts the compiler, and recall did not regress (${prev.missed} → ${missed.length} missed).\n`);

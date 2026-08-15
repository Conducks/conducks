#!/usr/bin/env node
/**
 * Conducks — score `UNUSED_EXPORT` against the TypeScript language service. 🏺
 *
 * WHY. `UNUSED_EXPORT` is the biggest thing `prune` says — 78 of its 91 findings on this repository
 * — and until this file existed NOTHING independent checked it. `oracle-tsc.mjs` compares unused
 * IMPORTS, but `--noUnusedLocals` only ever looks inside one file; it cannot see an export that no
 * other module consumes. So the largest category was resting entirely on symbols verified by hand.
 *
 * WHAT THE ORACLE IS. Not a second dead-code heuristic — the compiler's own reference resolution,
 * through `LanguageService.findReferences`. That is the same machinery "Find All References" uses in
 * an editor, and it knows what tree-sitter structurally cannot: which `foo` is which.
 *
 * Deliberately NOT knip or ts-prune. `typescript` is already a dependency, so this adds none, and a
 * second heuristic tool would only tell us whether two guessers agree.
 *
 * THE CLAIM BEING TESTED, exactly as `prune` words it: "exported but never consumed by OTHER
 * modules". So a symbol referenced only inside its declaring file still counts as unused — that is
 * the claim, and scoring it against "referenced anywhere" would fail the tool for something it never
 * said.
 *
 * WHAT IT CANNOT SEE, stated rather than hidden:
 *   - A symbol reached only through a dynamic `import()` with a computed specifier.
 *   - Anything consumed from outside the program (a published package's public API). For a library
 *     every export is "unused" by this measure, which is why the gate below ratchets rather than
 *     demanding zero.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

/**
 * A FRAMEWORK CONTRACT IS A CONSUMER, even though no file imports it.
 *
 * Next.js app-router loads `page`/`layout`/`route` files BY CONVENTION: it calls the default export
 * to render, `GET`/`POST` to serve, and reads `metadata` to build the document. Nothing imports any of
 * them, so `findReferences` sees zero consumers and the oracle called them dead — 108 of the 129
 * "recall gaps" on the orchestrator subject were exactly this, and conducks was silent on every one
 * BECAUSE IT WAS RIGHT. Flagging them tells a reader to delete a working route.
 *
 * Gated on the project actually depending on `next`, so a plain `src/app/` directory in some other
 * project keeps being scored normally.
 */
// The contract is FILENAME-BOUND. Next.js does not load "anything under app/" — it loads files with
// reserved NAMES, and each reserved export is only meaningful in specific ones: HTTP verbs in
// route.ts, metadata in a page or layout. The first version of this check keyed on the DIRECTORY, and
// on the orchestrator subject 60 of the 190 files under src/app are ordinary components — so a dead
// `export default` in SharedSessionsPage.tsx was silenced along with the real routes. An exclusion
// that wide stops the gate from being able to fail, which is the failure mode that looks like
// success.
const ROUTE_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const PAGE_CONFIG = ['metadata', 'generateMetadata', 'generateStaticParams', 'dynamic', 'revalidate',
  'runtime', 'fetchCache', 'dynamicParams', 'viewport', 'generateViewport', 'preferredRegion',
  'maxDuration', 'experimental_ppr'];

/** reserved basename -> the export names Next.js reads from it. `default` is the render/handler. */
const NEXT_FILES = new Map([
  ['page',            ['default', ...PAGE_CONFIG]],
  ['layout',          ['default', ...PAGE_CONFIG]],
  ['template',        ['default']],
  ['loading',         ['default']],
  ['error',           ['default']],
  ['global-error',    ['default']],
  ['not-found',       ['default']],
  ['default',         ['default']],
  ['route',           ['default', ...ROUTE_VERBS, ...PAGE_CONFIG]],
  ['middleware',      ['default', 'middleware', 'config']],
  ['sitemap',         ['default']],
  ['robots',          ['default']],
  ['manifest',        ['default']],
  ['opengraph-image', ['default', 'alt', 'size', 'contentType']],
  ['twitter-image',   ['default', 'alt', 'size', 'contentType']],
  ['icon',            ['default', 'size', 'contentType']],
  ['apple-icon',      ['default', 'size', 'contentType']],
]);

const usesNext = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    return Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);
  } catch { return false; }
})();

/** True when this export is loaded by the framework rather than by an import. */
function isFrameworkEntry(rel, name) {
  if (!usesNext) return false;
  const posix = rel.split(path.sep).join('/');
  const base = path.basename(posix).replace(/\.[cm]?[jt]sx?$/, '');
  const allowed = NEXT_FILES.get(base);
  if (!allowed || !allowed.includes(name)) return false;
  // middleware sits at the project/src root; everything else must be inside the app router.
  return base === 'middleware' || /(^|\/)app\//.test(posix);
}

/** Every export the compiler can prove no OTHER file references. */
function oracleUnusedExports() {
  const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    // A legitimate project shape, not a defect: an npm-workspaces monorepo often has no ROOT
    // tsconfig at all — each workspace carries its own. Stack-tracing on that would make the gate
    // look broken on a perfectly normal repository, and a gate that appears broken gets ignored.
    console.log(`\n--- dead exports vs the TypeScript language service (${path.basename(projectDir)}) ---`);
    console.log(`  SKIPPED — no root tsconfig.json. Point this at a workspace instead, e.g.\n` +
                `    node tools/benchmark/oracle-exports.mjs ${path.relative(process.cwd(), projectDir)}/app\n`);
    process.exit(0);
  }
  const cfg = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath));

  const host = {
    getScriptFileNames: () => cfg.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => { try { return ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')); } catch { return undefined; } },
    getCurrentDirectory: () => path.dirname(configPath),
    getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const program = service.getProgram();
  const checker = program.getTypeChecker();

  const unused = new Map();
  const testers = new Map();   // exported, and only a test consumes it
  const examined = new Set();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const rel = path.relative(projectDir, sf.fileName);
    if (rel.startsWith('..') || isTestPath(rel)) continue;
    // Only files this project owns — never node_modules, never generated output.
    if (!rel.startsWith('src' + path.sep)) continue;

    examined.add(rel.toLowerCase());
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) continue;
    for (const exp of checker.getExportsOfModule(moduleSymbol)) {
      const decl = exp.declarations?.[0];
      if (!decl) continue;
      if (isFrameworkEntry(rel, exp.getName())) continue;
      // The NAME node is what findReferences needs a position on.
      const nameNode = decl.name ?? decl;
      let refs;
      try { refs = service.findReferences(sf.fileName, nameNode.getStart()); } catch { continue; }
      if (!refs) continue;

      // A TEST IMPORT IS A CONSUMER. `prune` claims "exported but never consumed by OTHER modules",
      // and a test file is another module — deleting the export breaks it. Excluding tests here
      // measured a DIFFERENT claim ("unused by production code") and charged conducks for the
      // difference: on this repository ChronicleInterface has NINE importers, all tests, and was
      // counted as a recall miss. So were isTestPath, Verdict and CLUSTER_FALLBACK.
      //
      // Test-only consumption is still worth knowing — an export that exists solely for a test is a
      // real smell — so it is counted and reported separately rather than folded into either number.
      let external = 0, testOnly = 0, sameFile = 0;
      for (const group of refs) {
        for (const r of group.references) {
          if (r.fileName === sf.fileName) { sameFile++; continue; }   // same file is not "another module"
          if (isTestPath(path.relative(projectDir, r.fileName))) testOnly++;
          else external++;
        }
      }
      if (external === 0 && testOnly === 0) {
        // sameFile > 1 means the declaration is referenced by its OWN file (the declaration itself is
        // one reference). Worth carrying: conducks stays silent on those, so a MISSED count that does
        // not separate them reads as a recall gap when it is a difference of definition.
        unused.set(`${rel.toLowerCase()}::${exp.getName().toLowerCase()}`,
          { file: rel, symbol: exp.getName(), usedInOwnFile: sameFile > 1 });
      } else if (external === 0) {
        testers.set(`${rel.toLowerCase()}::${exp.getName().toLowerCase()}`, { file: rel, symbol: exp.getName() });
      }
    }
  }
  return { unused, examined, testers };
}

/** conducks' verdict. */
function conducksUnusedExports() {
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
  const lowerRoot = projectDir.toLowerCase();
  const found = new Map();
  // READ EVERY DEAD-CODE VERDICT, NOT ONE LABEL. `prune` decides ORPHAN before UNUSED_EXPORT: a
  // symbol nothing references AT ALL gets the stronger wording, and only a symbol referenced inside
  // its own file falls through to "exported but never consumed". Matching on UNUSED_EXPORT alone
  // therefore scored conducks as SILENT on exactly the symbols it was most confident about — 11 of
  // the 12 remaining "recall gaps" on this repository were sitting in the ORPHAN list the whole time
  // (ConducksPrism, SynapseNode, Pulse, KineticResult, McpPagination, …).
  //
  // The question this oracle asks is "does conducks report this symbol as dead", so any of the three
  // verdicts answers yes. EXTRA still means the compiler found a consumer, which is a precision bug
  // under whichever label it was filed.
  const DEAD_VERDICTS = new Set(['UNUSED_EXPORT', 'ORPHAN', 'UNIMPORTED_MODULE']);
  for (const f of JSON.parse(raw)) {
    if (!DEAD_VERDICTS.has(f.type)) continue;
    const abs = String(f.file).toLowerCase();
    const rel = abs.startsWith(lowerRoot) ? abs.slice(lowerRoot.length).replace(/^[/\\]/, '') : abs;
    if (isTestPath(rel)) continue;
    found.set(`${rel}::${String(f.symbol).toLowerCase()}`, f);
  }
  return found;
}

const { unused: oracle, examined, testers } = oracleUnusedExports();
const ours = conducksUnusedExports();
// COMPARE ONLY WHERE THE ORACLE LOOKED.
//
// The program is built from the project's tsconfig, and a real project's root config often covers
// one tree — sofie's says `include: ["src/**/*"]`, so `renderer/**` is not in it at all. Scoring
// conducks' findings from an unexamined directory against an oracle that never read it reports every
// one of them as a contradiction: 6 false EXTRAs on sofie, including three symbols already verified
// BY HAND as correct findings. A gate that fails on correct behaviour gets switched off.
const inScope = (k) => examined.has(k.slice(0, k.lastIndexOf('::')));
const oursScoped = new Map([...ours].filter(([k]) => inScope(k)));
const outOfScope = ours.size - oursScoped.size;

const missed = [...oracle].filter(([k]) => !oursScoped.has(k)).map(([, v]) => v);
const extra = [...oursScoped].filter(([k]) => !oracle.has(k)).map(([, v]) => v);
const agreed = [...oracle].filter(([k]) => oursScoped.has(k)).length;

console.log(`\n--- UNUSED_EXPORT vs the TypeScript language service (${path.basename(projectDir)}) ---`);
console.log(`  compiler says unused : ${oracle.size}`);
console.log(`  conducks says unused : ${ours.size}` + (outOfScope ? `  (${outOfScope} outside the compiler program — not scored)` : ''));
console.log(`  agreed               : ${agreed}`);
console.log(`  exported for TESTS only (not scored, but worth knowing): ${testers.size}`);
// SPLIT THE MISS. Measured on this repository, 15 of 26 missed exports ARE referenced inside their
// own file and conducks treats that as consumption; only 11 have no reference anywhere. Reporting one
// number charged conducks 26 for a gap of 11 and hid which half a change would move.
const missedOwnFile = missed.filter(m => m.usedInOwnFile).length;
console.log(`  MISSED (compiler sees it, conducks silent): ${missed.length}` +
  `  — ${missed.length - missedOwnFile} referenced NOWHERE (true recall gap), ` +
  `${missedOwnFile} referenced only inside their own file (conducks counts that as consumption)`);
for (const m of missed.slice(0, 15)) console.log(`      ${m.symbol}  ${m.file}`);
if (missed.length > 15) console.log(`      … ${missed.length - 15} more`);
console.log(`  EXTRA (conducks says unused, compiler finds a consumer): ${extra.length}`);
for (const e of extra.slice(0, 15)) console.log(`      ${e.symbol}  ${e.file}`);
if (extra.length > 15) console.log(`      … ${extra.length - 15} more`);

// Same two-sided rule as oracle-tsc.mjs, and for the same reason: precision alone is gameable, so
// EXTRA hard-fails and MISSED may never rise.
const BASELINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::exports`;
const prev = baseline[key];

if (oracle.size === 0) {
  console.error(`\n✖ the oracle found NOTHING — treat that as the language service failing to load ` +
    `the program, not as a project with no unused exports.\n`);
  process.exit(1);
}
let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} export(s) conducks calls unused while the compiler finds a consumer.`); failed = true; }
if (prev && missed.length > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now.`);
  failed = true;
}
if (failed) process.exit(1);

if (process.argv.includes('--write-baseline') || !prev) {
  baseline[key] = { oracle: oracle.size, missed: missed.length, agreed };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}: oracle=${oracle.size} missed=${missed.length}`);
}
console.log(`\n✓ no export finding contradicts the compiler` + (prev ? `, and recall did not regress.` : `.`) + `\n`);

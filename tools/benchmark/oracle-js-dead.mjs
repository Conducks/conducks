#!/usr/bin/env node
/**
 * Conducks — score JavaScript `ORPHAN`, `UNUSED_EXPORT` and `ONLY_IMPORTED` against the TypeScript
 * language service reading the JavaScript. 🏺
 *
 * WHY THIS EXISTS. The README calls JavaScript "Full", and the dead-code oracles that existed were
 * TypeScript's (`oracle-exports.mjs`, built from tsconfigs — which a JS project usually does not
 * have, and which never list `.mjs`/`.cjs` scripts) and Python's. The JS verdicts on the subjects —
 * `.mjs` renderers, `.cjs` maintenance scripts, browser snippets — were scored by nothing.
 *
 * WHAT THE ORACLE IS. The same machinery as oracle-exports.mjs — `LanguageService.findReferences`,
 * "Find All References" in an editor — on a program built with `allowJs` + `checkJs`. TypeScript
 * understands both ES modules and CommonJS in JavaScript (`require`, `module.exports = { a }`,
 * `exports.a = …`), so a consumer through either is resolved, not guessed.
 *
 * ONE FILE, ONE SCOPE. A JavaScript file with no import/export is, to TypeScript, a GLOBAL SCRIPT:
 * every top-level `const` in it shares one scope with every other such file. The scraper's browser
 * snippets are exactly that shape, and two of them declaring the same helper would hand each other
 * "references". They are never loaded together — each is read by Python and evaluated on its own —
 * so `moduleDetection: force` gives every file its own scope. Measured on the fixture (two scripts
 * both declaring `dup`, one using it): under the default module settings the unused `dup` gets the
 * other file's use as a reference; under NodeNext, or with the flag, it does not. NodeNext already
 * avoids it, so the flag is belt-and-braces — it keeps the answer right if the module setting moves.
 *
 * WHICH FILES. Only JavaScript files `analyze` actually indexed are scored — read from the vault
 * after the run, not re-derived from ignore rules (vendored and minified files are ignored by
 * analyze; see ts-program.mjs on what scoring files the graph never reads did to the TS recall
 * oracle). The PROGRAM still contains every tsconfig file and every JS file, so a reference from a
 * file analyze skipped still counts as a reference.
 *
 * THE CLAIM BEING TESTED, exactly as prune words it:
 *   ORPHAN         — "defined but never referenced". Any reference outside the declaration's own
 *                    span contradicts it (a recursive call is not a caller).
 *   UNUSED_EXPORT  — "exported but never consumed by OTHER modules". Only a reference from another
 *                    file contradicts it. A test file is another module (same rule as oracle-exports).
 *   ONLY_IMPORTED  — "every reference is an import the importing file never uses". A reference that
 *                    is not itself an import/export binding contradicts it.
 *   UNIMPORTED_MODULE is a question about a FILE and is not scored as EXTRA (oracle-python-dead.mjs
 *   rule); it counts as prune having spoken, for MISSED.
 *
 * WHAT IT CANNOT SEE, stated rather than found out later:
 *   - a name reached through a string: `obj[name]`, `window[fn]`, an HTML `onclick="f()"`, or a file
 *     read as TEXT and evaluated elsewhere — the scraper's `src/heads/agent/js/*.js` are loaded by
 *     Python and run with `page.evaluate`, so their top-level helpers are called by code no JS
 *     compiler reads. Those land in MISSED, which is why MISSED is ratcheted, not demanded to be 0.
 *   - a default export consumed by a TOOL by convention (eslint/postcss/vite `*.config.*`): exempt
 *     from MISSED, like oracle-exports.mjs's Next.js contract.
 *   - a dynamic `import()` with a computed specifier.
 *
 * EXTRA is the exact half, and the one that matters: if prune says nothing references a symbol and
 * the language service resolves a reference to it, prune is wrong, with no judgement required.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { DuckDBInstance } from '@duckdb/node-api';
import { resetVault } from './reset-vault.mjs';
import { buildProgram } from './ts-program.mjs';

// A FLAG IS NOT A PATH — same rule as every oracle here.
const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');

const JS_FILE = /\.(js|jsx|mjs|cjs)$/;
const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
const isToolConfig = (rel) => /(^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(rel);
const relOf = (abs) => path.relative(projectDir, abs).split(path.sep).join('/');

// ---- conducks' side ----------------------------------------------------------------------------

async function conducksSide() {
  // `--prune-json=<file>` scores a SAVED prune output and skips analyze, so the scorer can be shown
  // catching verdicts known to be wrong. The indexed-file list then comes from the existing vault.
  const saved = process.argv.find(a => a.startsWith('--prune-json='));
  let raw;
  if (saved) {
    raw = readFileSync(saved.slice('--prune-json='.length), 'utf8');
  } else {
    // A grammar change alters no file hash, so a stale vault would score the PREVIOUS build.
    resetVault(projectDir);
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: projectDir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    raw = execFileSync('node', [CLI, 'prune', '--json'],
      { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  }
  // The vault stores file paths LOWER-CASED (measured: `/…/CONDUCKS/test-projects/…` is stored as
  // `/…/conducks/test-projects/…`), so the indexed set is compared case-insensitively.
  const db = await DuckDBInstance.create(path.join(projectDir, '.conducks', 'conducks-synapse.db'));
  const conn = await db.connect();
  const rows = await (await conn.run(
    `SELECT DISTINCT file FROM nodes WHERE regexp_matches(file, '\\.(m|c)?jsx?$')`)).getRowObjects();
  try { conn.closeSync?.(); db.closeSync?.(); } catch { /* the read is done */ }
  const lowerRoot = projectDir.toLowerCase();
  const indexed = new Set(rows
    .map(r => String(r.file).toLowerCase())
    .filter(f => f.startsWith(lowerRoot))
    .map(f => f.slice(lowerRoot.length).replace(/^[/\\]/, '')));

  const findings = [];
  for (const f of JSON.parse(raw)) {
    const abs = String(f.file);
    const rel = (abs.startsWith(projectDir) ? abs.slice(projectDir.length) : abs).replace(/^[/\\]/, '').split(path.sep).join('/');
    if (!JS_FILE.test(rel)) continue;
    findings.push({ ...f, rel });
  }
  return { findings, indexed };
}

// ---- the compiler's side -----------------------------------------------------------------------

const built = buildProgram(projectDir);
if (!built) {
  console.error(`\n✖ no tsconfig and no JavaScript under ${projectDir}. Nothing to score.\n`);
  process.exit(1);
}
const options = {
  allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  maxNodeModuleJsDepth: 0,
};
const rootFiles = built.program.getRootFileNames();
const service = ts.createLanguageService({
  getScriptFileNames: () => rootFiles,
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => { try { return ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')); } catch { return undefined; } },
  getCurrentDirectory: () => projectDir,
  getCompilationSettings: () => options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
}, ts.createDocumentRegistry());
const program = service.getProgram();
const checker = program.getTypeChecker();

// `findReferences` does not cross the module boundary for a DEFAULT export (measured in
// oracle-exports.mjs); the static default imports are read from the import statements instead.
const defaultImportedBy = new Map();   // resolved file -> Set of importers
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.name) continue;
    const resolved = ts.resolveModuleName(st.moduleSpecifier.text, sf.fileName, options, ts.sys).resolvedModule;
    if (!resolved) continue;
    const set = defaultImportedBy.get(resolved.resolvedFileName) ?? new Set();
    set.add(sf.fileName);
    defaultImportedBy.set(resolved.resolvedFileName, set);
  }
}

// CONSUMERS READ FROM THE CONSUMER'S SIDE, because `findReferences` does not walk CommonJS outward.
//
// Measured on the fixture: `function cjsHelper` exported as `module.exports = { cjsHelper }` and
// consumed by `const { cjsHelper } = require('./d.cjs'); cjsHelper()` in another file. Asked from the
// declaration — or from the shorthand in `module.exports` — findReferences returns only the two
// occurrences in d.cjs. Asked from the consumer, it resolves straight back to the declaration. So the
// cross-file half is built here, from every identifier the checker resolves through an alias, a
// CommonJS export property, or `exports.x = x`, to a declaration in ANOTHER file.
//
// The CommonJS hops (shorthand / `key: ident` property → the local it names) are taken ONLY inside
// the object assigned to `module.exports`. Taken anywhere, they invented consumers: on the
// orchestrator subject `export const FIXTURE_PASSWORD` is returned as `{ password: FIXTURE_PASSWORD }`
// from four helpers, and every `user.password` in another file was resolved through that property to
// the constant — 8 "cross-file references" to a symbol no other file names, and a false EXTRA
// against a correct UNUSED_EXPORT. Reading a returned object's field is not consuming the export.
const crossRefs = new Map();   // declaration node -> [{ fileName, pos, node }]
const isModuleExportsObject = (obj) => {
  const b = obj?.parent;
  if (!b || !ts.isBinaryExpression(b) || b.right !== obj || b.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  const l = b.left;
  return (ts.isPropertyAccessExpression(l) && ts.isIdentifier(l.expression) && l.expression.text === 'module' && l.name.text === 'exports') ||
    (ts.isIdentifier(l) && l.text === 'exports');
};
function resolveToDecls(sym) {
  let s = sym;
  for (let hop = 0; s && hop < 6; hop++) {
    if (s.flags & ts.SymbolFlags.Alias) { try { s = checker.getAliasedSymbol(s); continue; } catch { return []; } }
    const d = s.valueDeclaration ?? s.declarations?.[0];
    if (d && ts.isShorthandPropertyAssignment(d) && isModuleExportsObject(d.parent)) { s = checker.getShorthandAssignmentValueSymbol(d); continue; }
    if (d && ts.isPropertyAssignment(d) && ts.isIdentifier(d.initializer) && isModuleExportsObject(d.parent)) { s = checker.getSymbolAtLocation(d.initializer); continue; }
    if (d && (ts.isPropertyAccessExpression(d) || ts.isElementAccessExpression(d)) && ts.isBinaryExpression(d.parent) &&
        d.parent.left === d && ts.isIdentifier(d.parent.right)) { s = checker.getSymbolAtLocation(d.parent.right); continue; }
    break;
  }
  return s?.declarations ?? [];
}
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || /(^|[/\\])node_modules[/\\]/.test(sf.fileName)) continue;
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      let sym; try { sym = checker.getSymbolAtLocation(n); } catch { sym = undefined; }
      if (sym) {
        for (const d of resolveToDecls(sym)) {
          if (d.getSourceFile() === sf || d.name === n) continue;
          const list = crossRefs.get(d) ?? [];
          list.push({ fileName: sf.fileName, pos: n.getStart(sf), node: n });
          crossRefs.set(d, list);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const isImportBinding = (node) => {
  for (let n = node; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isImportEqualsDeclaration(n) || ts.isExportDeclaration(n) || ts.isExportAssignment(n)) return true;
    // `const { a } = require('./x')` binds, it does not use
    if (ts.isVariableDeclaration(n)) {
      const init = n.initializer;
      return !!init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'require' &&
        node.pos >= n.name.pos && node.end <= n.name.end;
    }
    if (ts.isStatement(n)) return false;
  }
  return false;
};

/**
 * Every reference to the declaration named by `nameNode`, outside its own span.
 * `{ refs, otherFile, nonImport, first }`, or null when the service cannot answer.
 */
function evidence(sf, nameNode, declNode) {
  let groups;
  try { groups = service.findReferences(sf.fileName, nameNode.getStart(sf)); } catch { return null; }
  if (!groups) return null;
  let refs = 0, otherFile = 0, nonImport = 0, first = null;
  const seen = new Set();
  const note = (fileName, pos) => {
    const s = program.getSourceFile(fileName);
    const line = s ? s.getLineAndCharacterOfPosition(pos).line + 1 : 0;
    const at = `${relOf(fileName)}:${line}`;
    if (!first) first = at;
  };
  for (const g of groups) {
    for (const r of g.references) {
      if (r.isDefinition) continue;
      const k = `${r.fileName}:${r.textSpan.start}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const pos = r.textSpan.start;
      if (r.fileName === sf.fileName && pos >= declNode.getStart(sf) && pos < declNode.end) continue; // its own body
      refs++;
      if (r.fileName !== sf.fileName) otherFile++;
      const rsf = program.getSourceFile(r.fileName);
      const tok = rsf && ts.getTokenAtPosition ? ts.getTokenAtPosition(rsf, pos) : null;
      if (!tok || !isImportBinding(tok)) nonImport++;
      note(r.fileName, pos);
    }
  }
  for (const c of crossRefs.get(declNode) ?? []) {
    const k = `${c.fileName}:${c.pos}`;
    if (seen.has(k)) continue;
    seen.add(k);
    refs++; otherFile++;
    if (!isImportBinding(c.node)) nonImport++;
    note(c.fileName, c.pos);
  }
  // a static default import IS a consumer, and findReferences cannot show it
  const def = checker.getSymbolAtLocation(sf) && checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).find(e => e.getName() === 'default');
  if (def?.declarations?.some(d => d === declNode || d.name === nameNode)) {
    for (const imp of defaultImportedBy.get(sf.fileName) ?? []) {
      refs++; otherFile++; nonImport++;
      first ??= `${relOf(imp)} (default import)`;
    }
  }
  return { refs, otherFile, nonImport, first };
}

/** Top-level declarations of one file: functions, classes, variables, with their exported-ness. */
function topLevelDecls(sf) {
  const out = [];
  const modSym = checker.getSymbolAtLocation(sf);
  const exportsOf = modSym ? checker.getExportsOfModule(modSym) : [];
  const exportedDecls = new Set();
  for (const e of exportsOf) {
    let s = e;
    if (s.flags & ts.SymbolFlags.Alias) { try { s = checker.getAliasedSymbol(s); } catch { /* keep */ } }
    for (const d of s.declarations ?? []) exportedDecls.add(d);
    // CommonJS `module.exports = { a }`: the shorthand property's value symbol is the local `a`
    for (const d of e.declarations ?? []) {
      if (ts.isShorthandPropertyAssignment(d)) {
        const v = checker.getShorthandAssignmentValueSymbol(d);
        for (const vd of v?.declarations ?? []) exportedDecls.add(vd);
      }
    }
  }
  const push = (nameNode, declNode, kind) => {
    const { line } = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf));
    out.push({ sf, name: nameNode.text, nameNode, declNode, kind, line: line + 1, exported: exportedDecls.has(declNode) });
  };
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) push(st.name, st, ts.isClassDeclaration(st) ? 'class' : 'function');
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) push(d.name, d, 'variable');
    }
  }
  return out;
}

/** Every declaration in a file with this name — what a prune finding (file + symbol, no line) can mean. */
function declsNamed(sf, name) {
  const out = [];
  const visit = (n) => {
    const nm = n.name;
    if (nm && ts.isIdentifier(nm) && nm.text === name &&
        (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isVariableDeclaration(n) ||
         ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n))) {
      const { line } = sf.getLineAndCharacterOfPosition(nm.getStart(sf));
      out.push({ sf, name, nameNode: nm, declNode: n, line: line + 1 });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// ---- scoring -----------------------------------------------------------------------------------

const { findings, indexed } = await conducksSide();
const sourceByRel = new Map();
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = relOf(sf.fileName);
  if (rel.startsWith('..') || /(^|\/)node_modules\//.test(rel)) continue;
  sourceByRel.set(rel, sf);
}
const scoredFiles = [...sourceByRel.keys()].filter(r => JS_FILE.test(r) && indexed.has(r.toLowerCase()) && !isTestPath(r));
const notInProgram = [...indexed].filter(r => ![...sourceByRel.keys()].some(k => k.toLowerCase() === r));

function contradiction(ev, verdict) {
  if (!ev) return null;
  if (verdict === 'UNUSED_EXPORT') return ev.otherFile > 0 ? `consumed from another file (first: ${ev.first}; ${ev.otherFile} ref(s))` : null;
  if (verdict === 'ONLY_IMPORTED') return ev.nonImport > 0 ? `used, not only imported (first: ${ev.first}; ${ev.nonImport} non-import ref(s))` : null;
  return ev.refs > 0 ? `referenced at ${ev.first} (${ev.refs} ref(s))` : null;
}

const VERDICTS = new Set(['ORPHAN', 'UNUSED_EXPORT', 'ONLY_IMPORTED']);
const spoke = new Set();
const extra = [], ambiguous = [], unlocated = [], agreed = [];
let unimported = 0, unimportedLive = 0, outOfScope = 0, other = 0;
for (const f of findings) {
  spoke.add(`${f.rel.toLowerCase()}::${f.symbol}`);
  if (isTestPath(f.rel)) { outOfScope++; continue; }
  const sf = sourceByRel.get(f.rel);
  if (!sf) { outOfScope++; continue; }
  const cands = declsNamed(sf, String(f.symbol));
  if (f.type === 'UNIMPORTED_MODULE') {
    unimported++;
    if (cands.some(c => (evidence(sf, c.nameNode, c.declNode)?.refs ?? 0) > 0)) unimportedLive++;
    continue;
  }
  if (!VERDICTS.has(f.type)) { other++; continue; }
  if (cands.length === 0) { unlocated.push(f); continue; }
  const why = cands.map(c => contradiction(evidence(sf, c.nameNode, c.declNode), f.type));
  const where = cands.map(c => `${f.rel}:${c.line}`).join(', ');
  if (why.every(Boolean)) extra.push({ f, where, why: why.join(' | ') });
  else if (why.some(Boolean)) ambiguous.push({ f, where, why: why.filter(Boolean).join(' | ') });
  else agreed.push(f);
}

// What the compiler calls dead in the scored files: unreferenced anywhere, or exported and consumed
// by no other file.
const decls = [];
const compilerDead = [];
for (const rel of scoredFiles) {
  const sf = sourceByRel.get(rel);
  for (const d of topLevelDecls(sf)) {
    decls.push(d);
    const ev = evidence(sf, d.nameNode, d.declNode);
    if (!ev) continue;
    const dead = ev.refs === 0 || (d.exported && ev.otherFile === 0);
    if (!dead) continue;
    if (d.exported && isToolConfig(rel)) continue;   // read by a tool, by convention
    compilerDead.push({ ...d, rel, usedInOwnFile: ev.refs > 0 });
  }
}
const missed = compilerDead.filter(d => !spoke.has(`${d.rel.toLowerCase()}::${d.name}`));

console.log(`\n--- JavaScript dead code vs the TypeScript language service, allowJs (${path.basename(projectDir)}) ---`);
console.log(`  program: ${rootFiles.length} files (${built.jsAdded} JS walked in, ${built.configPaths.length} tsconfig(s))`);
console.log(`  JS files analyze indexed        : ${indexed.size}  — scored (non-test, in the program): ${scoredFiles.length}` +
  (notInProgram.length ? `  (${notInProgram.length} indexed but not in the program: ${notInProgram.slice(0, 3).join(', ')})` : ''));
console.log(`  top-level declarations walked   : ${decls.length}`);
console.log(`  compiler says dead              : ${compilerDead.length}`);
console.log(`  conducks verdicts on JS         : ${findings.length - unimported}  (+${unimported} UNIMPORTED_MODULE questions, not scored; ${unimportedLive} of them on referenced symbols)`);
console.log(`  agreed                          : ${agreed.length}`);
const missedOwn = missed.filter(m => m.usedInOwnFile).length;
console.log(`  MISSED (compiler says dead, conducks silent): ${missed.length}  — ${missed.length - missedOwn} referenced NOWHERE, ${missedOwn} exported but used only in their own file`);
for (const m of missed.slice(0, 15)) console.log(`      ${m.name}  ${m.rel}:${m.line}`);
if (missed.length > 15) console.log(`      … ${missed.length - 15} more`);
console.log(`  EXTRA (conducks says dead, compiler finds a reference): ${extra.length}`);
for (const e of extra) console.log(`      ${e.f.type} ${e.f.symbol}  ${e.where}\n          ← ${e.why}`);
if (ambiguous.length) {
  console.log(`  AMBIGUOUS (several declarations share the name in that file; some live): ${ambiguous.length}`);
  for (const a of ambiguous) console.log(`      ${a.f.type} ${a.f.symbol}  ${a.where}\n          ← ${a.why}`);
}
if (unlocated.length) {
  console.log(`  not located as a declaration (not scored): ${unlocated.length}`);
  for (const u of unlocated.slice(0, 10)) console.log(`      ${u.type} ${u.symbol}  ${u.rel}`);
}
if (outOfScope) console.log(`  findings outside the scored files (tests / not in program): ${outOfScope}`);

if (decls.length === 0) {
  console.error(`\n✖ the walk found NO top-level JS declarations. That is a broken oracle, not a clean project.\n`);
  process.exit(1);
}

const BASELINE = path.join(HERE, 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::js-dead`;
const prev = baseline[key];

let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} finding(s) the language service contradicts.`); failed = true; }
if (prev && missed.length > prev.missed) {
  console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now.`); failed = true;
}
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.`);
  console.error(`    Do this only when the SUBJECT or the ORACLE changed. If the TOOL changed, fix the tool.\n`);
} else if (failed) {
  process.exit(1);
}

// A MISSING BASELINE IS NOT A PASS (ADR 0044) — same rule as every other oracle here.
if (process.argv.includes('--write-baseline')) {
  baseline[key] = { decls: decls.length, oracle: compilerDead.length, missed: missed.length, agreed: agreed.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ no JavaScript dead-code verdict contradicts the language service, and recall did not regress.\n`);

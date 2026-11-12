#!/usr/bin/env node
/**
 * Conducks — score Java dead-code verdicts against javac. 🏺
 *
 * WHY THIS EXISTS. Java is listed "Partial" and had no compiler-scored oracle: every Java verdict rested
 * on hand-reading, and on spring-petclinic `prune` said nothing at all — which is right only if the
 * project has no dead code, and nothing could tell that apart from a tool that does not look.
 *
 * WHAT THE ORACLE IS. `oracle-java/JavaRefs.java`, run as a single-file program with the JDK (no build
 * tool, no download): javac parses and attributes every `.java` under the project — main and test
 * sources together — and every tree it resolves to a project declaration counts as a reference to it,
 * outside the declaration's own span. A constructor reference counts for its class, and a type whose
 * members are referenced is in use (deleting it breaks the build).
 *
 * NO DEPENDENCY CLASSPATH, deliberately: the run is offline. Library types are unresolved, so javac
 * reports errors; references between the project's own declarations still resolve, and those are all
 * EXTRA needs. The error count is printed. It is NOT a refusal (unlike the Go oracle), because a Java
 * project's dependencies are not in any local cache to point at — but it bounds MISSED, see below.
 *
 * THE CLAIM BEING TESTED, as prune words it:
 *   ORPHAN / ONLY_IMPORTED — any reference outside the declaration contradicts it.
 *   UNUSED_EXPORT          — a reference from another file contradicts it.
 *   UNIMPORTED_MODULE      — a question about a file, not scored as EXTRA; counts as prune having spoken.
 *
 * JAVA'S IMPLICIT REACHABILITY, modelled:
 *   - `static main(String[])` is an entry point: never MISSED.
 *   - A method that OVERRIDES an abstract or interface method is compile-required (delete it and the
 *     class no longer compiles): counts as a reference — an EXTRA if prune calls it dead.
 *   - A method overriding a CONCRETE method, or carrying @Override against a supertype javac could not
 *     resolve (a library type), is reachable through dispatch only: PROBABLE, never failed, exempt from
 *     MISSED.
 *   - An ANNOTATED declaration (@GetMapping, @Bean, @Test, @Entity, …) is managed by a framework that
 *     reaches it reflectively: exempt from MISSED, reported on its own line. Not exempt from EXTRA.
 *   - A bean ACCESSOR (getX/isX with no parameter, setX with one) is reachable by reflection (templates,
 *     JPA, JSON binding): exempt from MISSED. Not exempt from EXTRA.
 *   - An ENUM CONSTANT is reachable through values()/valueOf(): exempt from MISSED.
 *   - A class holding `main` is an entry point, as `main` is.
 *   - SCOPE: prune judges module-scoped declarations, so MISSED counts top-level types only (as the
 *     Python and JS oracles count module-level definitions). Unreferenced members are listed, not charged.
 *   - Test sources: references FROM them count; declarations IN them are not scored (prune exempts tests).
 *
 * WHAT IT CANNOT SEE: reflection by string (Class.forName, Spring by-name wiring), serialization hooks
 * (readObject, writeReplace), and consumers in other modules — which is why MISSED is ratcheted.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetVault } from './reset-vault.mjs';

const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');
const HELPER = path.join(HERE, 'oracle-java', 'JavaRefs.java');

function oracle() {
  try {
    return JSON.parse(execFileSync('java', [HELPER, projectDir],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    console.error(`\n✖ the Java helper failed (is a JDK on PATH? \`java -version\`):\n${e.stderr || e.message}`);
    process.exit(2);
  }
}

function conducksFindings() {
  // A stale vault would score the PREVIOUS build. `--prune-json=<file>` scores a saved prune output
  // instead, so the scorer itself can be shown wrong verdicts and seen to catch them.
  const saved = process.argv.find(a => a.startsWith('--prune-json='));
  let raw;
  if (saved) raw = readFileSync(saved.slice('--prune-json='.length), 'utf8');
  else {
    // A project that is not its own git repository — the fixture, kept inside this one — is analyzed
    // as a COPY that is: discovery asks git for the file list, and inside conducks' own repository it
    // answered for the wrong tree (measured: 0 verdicts in place, 3 on a copy). Writes no vault into
    // the source tree either.
    let dir = projectDir, scratch = null;
    if (!existsSync(path.join(projectDir, '.git'))) {
      scratch = mkdtempSync(path.join(os.tmpdir(), 'conducks-java-oracle-'));
      // Not named after the source folder: a path through `fixture/` reads as test code to prune, which
      // then judges nothing in it.
      dir = path.join(scratch, 'subject');
      cpSync(projectDir, dir, { recursive: true, filter: src => !src.includes(`${path.sep}.conducks`) });
      for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=oracle', '-c', 'user.email=oracle@local', 'commit', '-qm', 'fixture']])
        execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    }
    try {
      resetVault(dir);
      execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: dir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
      raw = execFileSync('node', [CLI, 'prune', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      raw = raw.split(dir).join(projectDir);
    } finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
  }
  const out = [];
  for (const f of JSON.parse(raw)) {
    const abs = String(f.file);
    const rel = (abs.toLowerCase().startsWith(projectDir.toLowerCase()) ? abs.slice(projectDir.length) : abs).replace(/^[/\\]/, '').split(path.sep).join('/');
    if (!rel.toLowerCase().endsWith('.java')) continue;
    out.push({ ...f, rel: rel.toLowerCase() });
  }
  return out;
}

const o = oracle();
if (!o.defs || o.defs.length === 0) {
  console.error(`\n✖ the walk found NO declarations. That is a broken oracle, not a clean project.\n`);
  process.exit(1);
}
const findings = conducksFindings();
const scored = o.defs.filter(d => !d.test);
const byFileName = new Map();   // "rel::name" (lower-cased, prune ids are) -> defs
for (const d of scored) {
  const k = `${d.file.toLowerCase()}::${d.name.toLowerCase()}`;
  if (!byFileName.has(k)) byFileName.set(k, []);
  byFileName.get(k).push(d);
}
const isTestPath = (p) => /(^|\/)src\/test\//.test(p) || /(^|\/)test\//.test(p);
const compileRequired = (d) => typeof d.override === 'string' && d.override.startsWith('abstract:');
const dispatchOnly = (d) => typeof d.override === 'string' && !compileRequired(d);

const VERDICTS = new Set(['ORPHAN', 'ONLY_IMPORTED', 'UNUSED_EXPORT']);
function contradiction(d, verdict) {
  if (compileRequired(d)) return `implements ${d.override.slice('abstract:'.length)} — deleting it breaks the build`;
  if (verdict === 'UNUSED_EXPORT') return d.refsOtherFile > 0 ? `referenced from another file (first: ${d.firstRef}, ${d.refsOtherFile} ref(s))` : null;
  // ONLY_IMPORTED expects an import; only a use beyond the import statements contradicts it.
  if (verdict === 'ONLY_IMPORTED') return d.refs - d.importRefs > 0 ? `used beyond its imports (${d.refs - d.importRefs} ref(s))` : null;
  if (d.refs > 0) return `referenced at ${d.firstRef} (${d.refs} ref(s), ${d.importRefs} in imports)`;
  return d.memberRefs > 0 ? `its members are used (first: ${d.firstMemberRef})` : null;
}

const spoke = new Set();
const extra = [], ambiguous = [], probable = [], unlocated = [], agreed = [];
let unimported = 0, unimportedLive = 0, skippedTest = 0;
for (const f of findings) {
  const sym = String(f.symbol).split('.').pop().toLowerCase();
  spoke.add(`${f.rel}::${sym}`);
  if (isTestPath(f.rel)) { skippedTest++; continue; }
  if (f.type === 'UNIMPORTED_MODULE') {
    unimported++;
    if ((byFileName.get(`${f.rel}::${sym}`) ?? []).some(d => d.refs > 0)) unimportedLive++;
    continue;
  }
  if (!VERDICTS.has(f.type)) continue;
  const cands = byFileName.get(`${f.rel}::${sym}`) ?? [];
  if (cands.length === 0) { unlocated.push(f); continue; }
  const why = cands.map(d => contradiction(d, f.type));
  const where = cands.map(d => `${d.file}:${d.line}`).join(', ');
  if (why.every(Boolean)) extra.push({ f, why: why.join(' | '), where });
  else if (why.some(Boolean)) ambiguous.push({ f, why: why.filter(Boolean).join(' | '), where });
  else if (cands.some(dispatchOnly)) probable.push({ f, why: cands.map(d => d.override).filter(Boolean).join(' | '), where });
  else agreed.push(f);
}

// prune judges MODULE-SCOPED declarations — a symbol whose parent is a class is not judged, in any
// language (DeadCodeAnalyzer.isModuleScoped). The Python and JS oracles score the same scope
// (module-level / top-level). In Java that is the top-level TYPE: methods, fields and nested types
// are reported on their own line and never charged as MISSED.
const topLevel = (d) => d.kind === 'class' && !d.owner;
const unreferencedMembers = scored.filter(d => !topLevel(d) && d.refs === 0 && !compileRequired(d) && !d.main && !d.annotated && !d.accessor && !d.enumConstant && !dispatchOnly(d));
const unreferenced = scored.filter(d => topLevel(d) && d.refs === 0 && d.memberRefs === 0 && !compileRequired(d));
const framework = unreferenced.filter(d => d.annotated);
const exempt = (d) => d.main || d.annotated || d.accessor || d.enumConstant || dispatchOnly(d);
const missed = unreferenced.filter(d => !exempt(d) && !spoke.has(`${d.file.toLowerCase()}::${d.name.toLowerCase()}`));

const label = (d) => (d.owner ? `${d.owner}.` : '') + d.name;
console.log(`\n--- Java dead code vs javac (${path.basename(projectDir)}) ---`);
console.log(`  files attributed                 : ${o.files}  (javac errors without a dependency classpath: ${o.errors}${o.errors ? ` — first: ${o.firstError.slice(0, 90)}` : ''})`);
console.log(`  declarations walked              : ${scored.length}  (+${o.defs.length - scored.length} in test sources, not scored); top-level types scored: ${scored.filter(topLevel).length}`);
console.log(`  members nothing references       : ${unreferencedMembers.length}  (outside prune's scope — a class member is not judged in any language; not charged)`);
console.log(`  compiler: no reference at all    : ${unreferenced.length}  — of which framework-annotated: ${framework.length} (not charged as MISSED)`);
console.log(`  conducks verdicts on .java files : ${findings.length - unimported}  (+${unimported} UNIMPORTED_MODULE questions, not scored; ${unimportedLive} of them on compiler-referenced symbols)`);
console.log(`  agreed (verdict, compiler sees no reference): ${agreed.length}`);
console.log(`  MISSED (compiler sees no reference, conducks silent): ${missed.length}`);
for (const m of missed.slice(0, 20)) console.log(`      ${label(m)}  ${m.file}:${m.line}  (${m.kind})`);
if (missed.length > 20) console.log(`      … ${missed.length - 20} more`);
console.log(`  EXTRA (conducks says dead, compiler finds a reference): ${extra.length}`);
for (const e of extra) console.log(`      ${e.f.type} ${e.f.symbol}  ${e.where}\n          ← ${e.why}`);
if (ambiguous.length) {
  console.log(`  AMBIGUOUS (several declarations share the name in that file; some live): ${ambiguous.length}`);
  for (const a of ambiguous) console.log(`      ${a.f.type} ${a.f.symbol}  ${a.where}\n          ← ${a.why}`);
}
if (probable.length) {
  console.log(`  PROBABLE (live only through dispatch — reported, not failed): ${probable.length}`);
  for (const p of probable) console.log(`      ${p.f.type} ${p.f.symbol}  ${p.where}\n          ← ${p.why}`);
}
if (unlocated.length) {
  console.log(`  not located in the compiler's declarations (not scored): ${unlocated.length}`);
  for (const u of unlocated.slice(0, 10)) console.log(`      ${u.type} ${u.symbol}  ${u.rel}`);
}
if (skippedTest) console.log(`  findings inside test sources (not scored): ${skippedTest}`);

const BASELINE = path.join(HERE, 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::java-dead`;
const prev = baseline[key];

let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} finding(s) javac contradicts.`); failed = true; }
if (prev && missed.length > prev.missed) { console.error(`\n✖ RECALL WENT BACKWARDS: ${prev.missed} missed before, ${missed.length} now.`); failed = true; }
if (failed && process.argv.includes('--write-baseline')) {
  console.error(`\n  ⚠ recording a baseline over a FAILING ratchet, because --write-baseline was passed.`);
} else if (failed) process.exit(1);

if (process.argv.includes('--write-baseline')) {
  baseline[key] = { defs: scored.length, dead: findings.length - unimported, missed: missed.length, extra: extra.length };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  baseline recorded for ${key}.\n`);
  process.exit(0);
}
if (!prev) {
  console.log(`\n  ✖ NO BASELINE for '${key}' — nothing to compare against, so this is not a pass.`);
  console.log(`    Re-run with --write-baseline to record one deliberately.\n`);
  process.exit(1);
}
console.log(`\n✓ no Java dead-code verdict contradicts javac, and recall did not regress.\n`);
void existsSync;

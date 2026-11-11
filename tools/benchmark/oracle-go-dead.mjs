#!/usr/bin/env node
/**
 * Conducks — score Go dead-code verdicts against Go's own type checker. 🏺
 *
 * WHY THIS EXISTS. The README calls Go "Full" alongside TypeScript, JavaScript and Python, and the
 * other three each had a compiler-scored oracle for what `prune` says. Go had none: every Go ORPHAN
 * was resting on hand-reading. The first fixture this file was run on showed why that is not good
 * enough — `prune` called `Box[T].Get` an ORPHAN while `main.go` calls `util.Box[int]{}.Get()`, and
 * called `Square.Area` an ORPHAN while `TotalArea` dispatches to it through the `Shape` interface.
 * Neither is visible to a reader skimming for the name.
 *
 * WHAT THE ORACLE IS. `oracle-go/main.go`, run with `go run`: go/build to enumerate the module's
 * packages exactly as the go tool does (build constraints included), go/parser + go/types to
 * type-check every one of them WITH its test files, and the "source" importer for the standard
 * library and the module's dependencies. Standard library only — nothing from golang.org/x, and the
 * run is forced offline (GOPROXY=off, GOTOOLCHAIN=local), so a dependency missing from the module
 * cache is REPORTED, never fetched.
 *
 * BUILD CONSTRAINTS ARE A SECOND PROGRAM. A file named `*_windows.go` is not part of the linux
 * program, and a helper called only from it reads as unreferenced on linux. So the module is
 * type-checked once per GOOS (default linux, darwin, windows) and the evidence is UNIONED: a
 * declaration is live if any of those programs references it.
 *
 * THE CLAIM BEING TESTED, exactly as prune words it:
 *   ORPHAN         — "defined but never referenced (no callers, constructors, or type references)".
 *                    ANY reference outside the declaration's own span contradicts it. (A recursive call
 *                    is not a caller, and a method's RECEIVER does not count as a use of its own type.)
 *   ONLY_IMPORTED  — Go cannot import a single symbol, so ANY reference contradicts it.
 *   UNUSED_EXPORT  — "never consumed by OTHER modules": a reference from another file contradicts it.
 *   STALE_IMPORT   — Go refuses to compile an unused import, so in a file that type-checks this
 *                    verdict is wrong by construction.
 *   UNIMPORTED_MODULE is a question about a FILE, not a claim about a symbol, and is not scored as
 *   EXTRA (same rule as oracle-python-dead.mjs); it does count as prune having spoken, for MISSED.
 *
 * GO'S IMPLICIT REACHABILITY, modelled — the Go analogue of the Python oracle's entry-point and
 * decorator exemptions:
 *   - `main` in package main, and every `init`, are called by the runtime: never MISSED.
 *   - A METHOD can be live with no identifier naming it, through an interface. Two tiers:
 *       static   the type is converted to an interface that names the method (assignment, argument,
 *                return, composite literal, send, explicit conversion, type assertion/switch, or a
 *                generic constraint). Compiler-proven: delete the method and that line stops
 *                compiling. Counts as a reference — an EXTRA.
 *       dynamic  the value flows into some interface (often `any`, as in fmt.Println(x)) and the
 *                method satisfies a named interface somewhere in the program (fmt.Stringer, error…).
 *                Runtime-reachable, not compiler-proven. Listed as PROBABLE, never fails the gate,
 *                and exempt from MISSED.
 *   - EXPORTED identifiers of a non-main package outside any `internal/` tree are public API: another
 *     module may import them, so "unreferenced inside this module" is not proof they are dead. They
 *     are exempt from MISSED and counted on their own line. (Exported names under internal/ or in
 *     package main can only be reached from inside the module, so they ARE scored.) This changes
 *     nothing about EXTRA: if prune calls a public identifier dead and the module references it,
 *     that is still a wrong verdict.
 *   - Test files: references FROM `_test.go` files count (a symbol only a test calls is not
 *     unreferenced); declarations IN them are not scored, because prune exempts test files.
 *
 * WHAT IT CANNOT SEE, stated rather than found out later:
 *   - reflection (`reflect.Value.MethodByName`, text/template calling a method by name), `//go:linkname`,
 *     cgo `//export`, and plugin symbols — no identifier names them
 *   - files excluded on all three GOOS values, by custom build tags (e.g. `//go:build tcell` on linux
 *     only when the tag is set), and cgo files (type-checked with CGO_ENABLED=0, so the pure-Go
 *     fallbacks are read instead)
 *   - consumers in OTHER modules — which is why exported API is exempt from MISSED, and why MISSED is
 *     ratcheted rather than demanded to be zero
 *
 * Validated on two hand-written fixture modules by DELETION: each declaration was removed one at a
 * time and `go vet ./...` (which compiles tests) asked whether the build broke. 71 of 71 agreed with
 * this oracle's live/dead answer — including the static-interface tier (return, append, send, generic
 * constraint, embedded promotion, sort.Interface, io.Writer, error).
 *
 * EXTRA is the exact half, and the one that matters: if prune says nothing references a declaration
 * and the type checker resolved an identifier to it, prune is wrong, with no judgement required.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetVault } from './reset-vault.mjs';

// A FLAG IS NOT A PATH — same rule as every oracle here.
const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectDir = positionalArg ? path.resolve(positionalArg) : process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.resolve(HERE, '../../build/src/interfaces/cli/index.js');
const HELPER = path.join(HERE, 'oracle-go');
const goosArg = process.argv.find(a => a.startsWith('--goos='));
const GOOS_LIST = (goosArg ? goosArg.slice('--goos='.length) : 'linux,darwin,windows').split(',').filter(Boolean);

const isTestPath = (p) => /_test\.go$/.test(p) || /(^|\/)testdata\//.test(p);

/** The go binary: $GO, else the SDK the owner keeps off PATH, else whatever PATH has. */
function goEnv() {
  const sdk = path.join(os.homedir(), 'go-sdk', 'go', 'bin');
  const PATH = existsSync(sdk) ? `${sdk}${path.delimiter}${process.env.PATH}` : process.env.PATH;
  // OFFLINE, ENFORCED: no proxy, no toolchain switch, no workspace file pulling in other modules.
  return { ...process.env, PATH, GOPROXY: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOFLAGS: '-mod=readonly' };
}

function oracle() {
  if (!existsSync(path.join(projectDir, 'go.mod'))) {
    console.error(`\n✖ no go.mod at ${projectDir} — this oracle scores one Go module.\n`);
    process.exit(2);
  }
  const env = goEnv();
  const merged = new Map();      // def key -> def, evidence unioned across GOOS
  const errors = [];
  const skipped = new Set();
  let packages = 0;
  for (const goos of GOOS_LIST) {
    let raw;
    try {
      raw = execFileSync('go', ['run', '.', '-root', projectDir, '-goos', goos],
        { cwd: HELPER, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      console.error(`\n✖ the Go helper failed for GOOS=${goos}:\n${e.stderr || e.message}`);
      process.exit(2);
    }
    const o = JSON.parse(raw);
    packages = Math.max(packages, o.packages);
    for (const e of o.typeErrors ?? []) errors.push(`[${goos}] ${e}`);
    for (const s of o.skipped ?? []) skipped.add(s);
    for (const d of o.defs ?? []) {
      const prev = merged.get(d.key);
      if (!prev) { merged.set(d.key, { ...d, goos: [goos] }); continue; }
      prev.goos.push(goos);
      prev.refs = Math.max(prev.refs, d.refs);
      prev.refsOtherFile = Math.max(prev.refsOtherFile, d.refsOtherFile);
      prev.refsNonTest = Math.max(prev.refsNonTest, d.refsNonTest);
      prev.firstRef ||= d.firstRef;
      prev.static ||= d.static;
      prev.dynamic ||= d.dynamic;
    }
  }
  return { defs: [...merged.values()], errors, skipped: [...skipped], packages };
}

function conducksFindings() {
  // Same discipline as every oracle here: a grammar change alters no file hash, so a stale vault
  // would score the PREVIOUS build and report success.
  //
  // `--prune-json=<file>` scores a SAVED prune output instead, without touching the vault. It exists so
  // the scorer itself can be tested against verdicts known to be wrong: the fixture's two false ORPHANs
  // (`Box.Get`, `Square.Area`) were fixed in conducks while this file was being written, and a scorer
  // only ever shown correct input has not been shown to catch anything.
  const saved = process.argv.find(a => a.startsWith('--prune-json='));
  let raw;
  if (saved) {
    raw = readFileSync(saved.slice('--prune-json='.length), 'utf8');
  } else {
    resetVault(projectDir);
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: projectDir, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    raw = execFileSync('node', [CLI, 'prune', '--json'],
      { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  }
  const out = [];
  for (const f of JSON.parse(raw)) {
    const abs = String(f.file);
    const rel = (abs.startsWith(projectDir) ? abs.slice(projectDir.length) : abs).replace(/^[/\\]/, '').split(path.sep).join('/');
    if (!rel.endsWith('.go')) continue;
    out.push({ ...f, rel });
  }
  return out;
}

const { defs, errors, skipped, packages } = oracle();

// A PROGRAM THAT DID NOT TYPE-CHECK IS NOT EVIDENCE. Missing dependencies surface here as
// "could not import …" — and an unresolved import makes every use through it invisible, which would
// turn into false MISSED and hide real EXTRA. Say so and stop rather than score half a program.
if (errors.length > 0) {
  console.error(`\n✖ the type checker reported ${errors.length} error(s); the oracle will not score a program that does not type-check.`);
  for (const e of errors.slice(0, 15)) console.error(`    ${e}`);
  if (errors.some(e => /could not import|cannot find module|no required module|missing go.sum/.test(e))) {
    console.error(`\n  Dependencies are missing from the module cache. This oracle runs offline (GOPROXY=off)` +
      `\n  and will not download them; populate the cache (e.g. \`go mod download\` in the subject) first.\n`);
  }
  process.exit(2);
}

const findings = conducksFindings();
const scored = defs.filter(d => !d.test);
const byFileName = new Map();   // "rel::name" -> defs
for (const d of scored) {
  const k = `${d.file}::${d.name}`;
  if (!byFileName.has(k)) byFileName.set(k, []);
  byFileName.get(k).push(d);
}

const VERDICTS = new Set(['ORPHAN', 'ONLY_IMPORTED', 'UNUSED_EXPORT']);
/** Exact evidence against a verdict, or null. */
function contradiction(d, verdict) {
  if (d.static) return `required by an interface: ${d.static}`;
  if (verdict === 'UNUSED_EXPORT') {
    return d.refsOtherFile > 0 ? `referenced from another file (first: ${d.firstRef}, ${d.refsOtherFile} ref(s))` : null;
  }
  return d.refs > 0 ? `referenced at ${d.firstRef} (${d.refs} ref(s))` : null;
}

const spoke = new Set();
const extra = [], ambiguous = [], probable = [], unlocated = [], agreed = [];
let unimported = 0, unimportedLive = 0, skippedTest = 0;
for (const f of findings) {
  spoke.add(`${f.rel}::${f.symbol}`);
  if (isTestPath(f.rel)) { skippedTest++; continue; }
  if (f.type === 'UNIMPORTED_MODULE') {
    unimported++;
    if ((byFileName.get(`${f.rel}::${f.symbol}`) ?? []).some(d => d.refs > 0 || d.static)) unimportedLive++;
    continue;
  }
  if (f.type === 'STALE_IMPORT') {
    // the file type-checked (errors.length === 0 above), so Go itself proved every import is used
    extra.push({ f, why: 'Go rejects an unused import, and this file type-checks', where: f.rel });
    continue;
  }
  if (!VERDICTS.has(f.type)) continue;
  const cands = byFileName.get(`${f.rel}::${f.symbol}`) ?? [];
  if (cands.length === 0) { unlocated.push(f); continue; }
  const why = cands.map(d => contradiction(d, f.type));
  const where = cands.map(d => `${d.file}:${d.line}`).join(', ');
  if (why.every(Boolean)) extra.push({ f, why: why.join(' | '), where, cands });
  else if (why.some(Boolean)) ambiguous.push({ f, why: why.filter(Boolean).join(' | '), where, cands });
  else if (cands.some(d => d.dynamic)) probable.push({ f, why: cands.map(d => d.dynamic).filter(Boolean).join(' | '), where });
  else agreed.push(f);
}

// MISSED — the compiler sees nothing reach it, and prune said nothing at all about it.
const isPublicApi = (d) => d.exported && d.pkgName !== 'main' && !/(^|\/)internal(\/|$)/.test(d.pkg);
const isRuntimeEntry = (d) => d.kind === 'func' && (d.name === 'init' || (d.name === 'main' && d.pkgName === 'main'));
const unreferenced = scored.filter(d => d.refs === 0 && !d.static);
const publicApi = unreferenced.filter(isPublicApi);
const missed = unreferenced.filter(d =>
  !isRuntimeEntry(d) && !isPublicApi(d) && !d.dynamic &&
  !spoke.has(`${d.file}::${d.name}`));

const label = (d) => (d.recv ? `${d.recv}.` : '') + d.name;
console.log(`\n--- Go dead code vs go/types (${path.basename(projectDir)}; GOOS ${GOOS_LIST.join(', ')}) ---`);
console.log(`  packages type-checked            : ${packages}` + (skipped.length ? `  (${skipped.length} dir(s) not read — first: ${skipped[0]})` : ''));
console.log(`  package-level declarations walked: ${scored.length}  (+${defs.length - scored.length} in _test.go, not scored)`);
console.log(`  compiler: no reference at all    : ${unreferenced.length}  — of which exported public API: ${publicApi.length} (not charged as MISSED)`);
console.log(`  conducks verdicts on .go files   : ${findings.length - unimported}  (+${unimported} UNIMPORTED_MODULE questions, not scored; ${unimportedLive} of them on compiler-referenced symbols)`);
console.log(`  agreed (verdict, compiler sees no reference): ${agreed.length}`);
console.log(`  MISSED (compiler sees no reference, conducks silent): ${missed.length}`);
for (const m of missed.slice(0, 15)) console.log(`      ${label(m)}  ${m.file}:${m.line}  (${m.kind})`);
if (missed.length > 15) console.log(`      … ${missed.length - 15} more`);
console.log(`  EXTRA (conducks says dead, compiler finds a reference): ${extra.length}`);
for (const e of extra) console.log(`      ${e.f.type} ${e.f.symbol}  ${e.where}\n          ← ${e.why}`);
if (ambiguous.length) {
  console.log(`  AMBIGUOUS (several declarations share the name in that file; some live) : ${ambiguous.length}`);
  for (const a of ambiguous) console.log(`      ${a.f.type} ${a.f.symbol}  ${a.where}\n          ← ${a.why}`);
}
if (probable.length) {
  console.log(`  PROBABLE (live only through a runtime interface check — reported, not failed): ${probable.length}`);
  for (const p of probable) console.log(`      ${p.f.type} ${p.f.symbol}  ${p.where}\n          ← ${p.why}`);
}
if (unlocated.length) {
  console.log(`  not located in the compiler's declarations (not scored): ${unlocated.length}`);
  for (const u of unlocated.slice(0, 10)) console.log(`      ${u.type} ${u.symbol}  ${u.rel}`);
}
if (skippedTest) console.log(`  findings inside _test.go / testdata (not scored): ${skippedTest}`);

if (scored.length === 0) {
  console.error(`\n✖ the walk found NO package-level declarations. That is a broken oracle, not a clean project.\n`);
  process.exit(1);
}

const BASELINE = path.join(HERE, 'oracle-baseline.json');
let baseline = {}; try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch {}
const key = `${path.basename(projectDir)}::go-dead`;
const prev = baseline[key];

let failed = false;
if (extra.length > 0) { console.error(`\n✖ ${extra.length} finding(s) Go's own type checker contradicts.`); failed = true; }
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
console.log(`\n✓ no Go dead-code verdict contradicts the type checker, and recall did not regress.\n`);

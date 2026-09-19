#!/usr/bin/env node
/**
 * Conducks — is the environment `doctor` reports as working actually working? 🩺
 *
 * `doctor` is an ENVIRONMENT command, so most of it has no oracle: "is git on PATH", "is there a
 * vault", "how old is it" are single facts with one right answer, and re-deriving a fact from the
 * same `stat` is not a second opinion. Those are scored by planting the condition instead
 * (`bench-doctor.mjs`). ONE of doctor's six checks is different, and it is the one its own source
 * says was wrong in production:
 *
 *   "MEASURED on alpine/musl, where the binding cannot build: doctor promised 'Analysis still works,
 *    at lower fidelity' and the very next `conducks analyze` refused. A doctor that reports a working
 *    environment as working when it does not is worse than no doctor."   — doctor.ts:45-47
 *
 * THE CLAIM SCORED HERE, verbatim from doctor.ts:56:
 *     `[✓] Parse path: native tree-sitter, all 13 grammars induced`
 * or, when some are absent (doctor.ts:58-59):
 *     `[!] Parse path: native tree-sitter, N/13 grammars induced`
 *     `[!]   Not induced: <ids> — files in those languages are REPORTED UNREAD`
 *
 * THE ORACLE re-derives that claim by a DIFFERENT MECHANISM, which is what makes it an oracle rather
 * than a restatement. `doctor` asks the grammar registry a boolean — `isGrammarUnavailable(id)`.
 * This asks the PRODUCT: it plants one source file per language doctor claims, runs a real
 * `conducks analyze`, and asks the vault (via `conducks query`) whether a symbol from INSIDE each
 * file reached the graph. A grammar that loads but reads nothing is exactly the alpine failure in a
 * different costume, and only the behavioural side can see it.
 *
 * It ignores UNIT nodes on purpose. A UNIT is created for a file that was merely discovered; a
 * BEHAVIOR/STRUCTURE/PACKAGE node can only exist if the file was genuinely parsed. Counting UNITs
 * would make this pass on a machine with no grammars at all — the vacuous version of this check.
 *
 * IT SCORES TWO DIRECTIONS:
 *   OVERPROMISED   doctor said the grammar is induced; no interior node came out of that file.
 *                  This is the alpine defect, and the reason the file exists.
 *   UNDERPROMISED  doctor listed the grammar as NOT induced, yet analyze parsed the file anyway.
 *                  Less costly, still a lie: it sends the user to install a toolchain they have.
 *
 * WHAT IT DOES NOT TEST, stated rather than discovered later:
 *   - the `[✗] Parse path: NONE` branch. Producing it means removing the native binding from this
 *     package's node_modules, which no benchmark may do. So this proves doctor's ✓ is TRUE; nothing
 *     proves its ✗ works.
 *   - DEPTH of parsing. One top-level function per language is the smallest thing that proves a
 *     grammar ran. A grammar that finds functions and misses classes passes here — recall per
 *     language is `oracle-nodes-*.mjs`'s job, not this one's.
 *   - the other five doctor checks (Node, DuckDB, git, vault, version). Planted in bench-doctor.mjs.
 *   - anything about THIS repository. It runs entirely on a temporary planted repo, because the
 *     question is about the machine, not about a subject.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../build/src/interfaces/cli/index.js');
const ENV = { ...process.env, CONDUCKS_NO_UPDATE_CHECK: '1' };

/**
 * One file per grammar id doctor names (doctor.ts:49-52), each defining a symbol whose name is
 * unique to that language, so a hit cannot be borrowed from a neighbouring file.
 */
const PROBES = {
  typescript: ['src/probe.ts', 'export function probeTypescript(): number { return 1; }\n', 'probeTypescript'],
  tsx: ['src/probe.tsx', 'export function probeTsx(): number { return 1; }\n', 'probeTsx'],
  javascript: ['src/probe.js', 'export function probeJavascript() { return 1; }\n', 'probeJavascript'],
  python: ['src/probe.py', 'def probePython():\n    return 1\n', 'probePython'],
  go: ['src/probe.go', 'package main\n\nfunc probeGo() int { return 1 }\n', 'probeGo'],
  rust: ['src/probe.rs', 'pub fn probeRust() -> i32 { 1 }\n', 'probeRust'],
  java: ['src/Probe.java', 'public class Probe { public int probeJava() { return 1; } }\n', 'probeJava'],
  csharp: ['src/probe.cs', 'public class Probe { public int probeCsharp() { return 1; } }\n', 'probeCsharp'],
  cpp: ['src/probe.cpp', 'int probeCpp() { return 1; }\n', 'probeCpp'],
  php: ['src/probe.php', '<?php\nfunction probePhp() { return 1; }\n', 'probePhp'],
  ruby: ['src/probe.rb', 'def probeRuby\n  1\nend\n', 'probeRuby'],
  swift: ['src/probe.swift', 'func probeSwift() -> Int { return 1 }\n', 'probeSwift'],
  c: ['src/probe.c', 'int probeC(void) { return 1; }\n', 'probeC'],
};

/** What doctor SAYS about the parse path, read out of its own printed line. */
function doctorClaim() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'conducks-oracle-doctor-ask-'));
  try {
    const out = execFileSync('node', [CLI, 'doctor'], { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = out.split('\n').find(l => l.includes('Parse path:'));
    if (!line) return { native: false, raw: '(doctor printed no parse-path line at all)', induced: new Set() };
    if (line.includes('Parse path: NONE')) return { native: false, raw: line.trim(), induced: new Set() };
    const notInduced = out.split('\n').find(l => l.includes('Not induced:'));
    const missing = notInduced
      ? notInduced.split('Not induced:')[1].split('—')[0].split(',').map(s => s.trim()).filter(Boolean)
      : [];
    return {
      native: true,
      raw: line.trim(),
      induced: new Set(Object.keys(PROBES).filter(id => !missing.includes(id))),
      missing: new Set(missing),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What the PRODUCT does: which languages actually put an interior node in the vault. */
function grammarsThatActuallyParse() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'conducks-oracle-doctor-'));
  try {
    for (const [rel, body] of Object.values(PROBES).map(([rel, body]) => [rel, body])) {
      const abs = path.join(repo, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    for (const cmd of [['init'], ['config', 'user.email', 'b@b'], ['config', 'user.name', 'b'], ['add', '-A'], ['commit', '-m', 'i']]) {
      execFileSync('git', cmd, { cwd: repo, stdio: 'ignore' });
    }
    execFileSync('node', [CLI, 'analyze', '--yes'], { cwd: repo, env: ENV, stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });

    const raw = execFileSync('node', [CLI, 'query', 'probe', '--limit', '400', '--json'], {
      cwd: repo, env: ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const rows = JSON.parse(raw.slice(raw.indexOf('[')));

    // Interior nodes only. A UNIT proves the file was FOUND, never that it was READ.
    const interior = new Set(rows.filter(r => r.kind !== 'UNIT').map(r => r.name));
    return new Set(Object.entries(PROBES).filter(([, [, , symbol]]) => interior.has(symbol)).map(([id]) => id));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const claim = doctorClaim();
const real = grammarsThatActuallyParse();

const overpromised = [...claim.induced].filter(id => !real.has(id));
const underpromised = [...(claim.missing ?? [])].filter(id => real.has(id));

console.log(`\n--- doctor parse-path oracle ---`);
console.log(`  doctor says       : ${claim.raw}`);
console.log(`  doctor claims OK  : ${claim.induced.size} grammar(s)`);
console.log(`  analyze proves OK : ${real.size} grammar(s) — ${[...real].sort().join(', ') || 'none'}`);
console.log(`  OVERPROMISED      : ${overpromised.length}${overpromised.length ? ` — ${overpromised.join(', ')}` : ''}`);
console.log(`  UNDERPROMISED     : ${underpromised.length}${underpromised.length ? ` — ${underpromised.join(', ')}` : ''}`);

if (!claim.native) {
  console.log(`\n  doctor reports NO parse path on this machine. That is a legitimate environment, and`);
  console.log(`  nothing here can score it: analyze refuses outright (ADR 0089), so there is no`);
  console.log(`  behaviour to compare the claim against. Not a pass — an abstention.\n`);
  process.exit(real.size === 0 ? 0 : 1);
}

const clean = overpromised.length === 0 && underpromised.length === 0;
console.log(`\n  ${clean ? 'AGREES' : 'DISAGREEMENT'}: what doctor promises about the parse path is what analyze delivers.`);
console.log(`  UNSCORED: the [✗] no-binding branch, and parse DEPTH beyond one function per language.\n`);
process.exit(clean ? 0 : 1);

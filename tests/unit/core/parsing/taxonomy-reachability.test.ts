import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CanonicalKind, mapToCanonical } from '@/lib/core/parsing/taxonomy.js';

/**
 * todo25#Phase8 / ADR 0074 — 13 kinds are declared, 9 persist.
 *
 * Re-measured on 2026-07-31 against this repo's own vault (9 kinds) and mentorseed's
 * (974 units, TS/TSX-heavy — 8 kinds; PACKAGE additionally absent there because nothing in
 * that language mix reaches a `package`-tagged grammar node). The four kinds absent from
 * BOTH vaults are NAMESPACE, STATEMENT, BRANCH and DATA, annotated in taxonomy.ts as either
 * unreachable BY DESIGN (STATEMENT, BRANCH — ADR 0004; DATA — ADR 0013) or unreachable by
 * GAP (NAMESPACE — no grammar ever tags a node for it).
 *
 * This test pins the structural claim the annotation rests on: no language grammar's
 * `queries.ts` currently emits a capture tag that would feed NAMESPACE/STATEMENT/BRANCH/DATA.
 * If a future grammar change adds one, this test goes red — which is correct: the taxonomy.ts
 * comments must be re-checked (and the "unreachable" claim narrowed or removed) before the new
 * capture tag ships, not discovered later by a stale comment.
 */

const LANGUAGES_DIR = join(process.cwd(), 'src/lib/core/parsing/languages');

function allQueryFiles(): { lang: string; path: string; source: string }[] {
  return readdirSync(LANGUAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(LANGUAGES_DIR, e.name, 'queries.ts'))
    .map((path) => ({ lang: path, path, source: readFileSync(path, 'utf8') }));
}

describe('taxonomy.ts kinds declared-but-unreachable stay unreachable', () => {
  const files = allQueryFiles();

  it('found at least 13 language query files to check (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  it('no grammar tags a node @isNamespace or @isModule (NAMESPACE stays unreachable)', () => {
    const offenders = files.filter((f) => /@isNamespace\b|@isModule\b/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('no grammar tags a node @isStatement (STATEMENT stays unreachable)', () => {
    const offenders = files.filter((f) => /@isStatement\b/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('no grammar tags a node @isBranch (BRANCH stays unreachable)', () => {
    const offenders = files.filter((f) => /@isBranch\b/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('no grammar tags a node @isParameter, @isArgument or @isLiteral (DATA stays unreachable)', () => {
    const offenders = files.filter((f) => /@isParameter\b|@isArgument\b|@isLiteral\b/.test(f.source));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('confirms the namespace-shaped C++/C#/PHP/Rust declarations land on PACKAGE instead, via @isPackage', () => {
    const packageTaggers = files.filter((f) => /@isPackage\b/.test(f.source));
    // At minimum the four namespace-shaped grammars named in taxonomy.ts's NAMESPACE comment.
    const langs = packageTaggers.map((f) => f.path);
    expect(langs.some((p) => p.includes('/cpp/'))).toBe(true);
    expect(langs.some((p) => p.includes('/csharp/'))).toBe(true);
    expect(langs.some((p) => p.includes('/php/'))).toBe(true);
    expect(langs.some((p) => p.includes('/rust/'))).toBe(true);
  });
});

describe('mapToCanonical still maps the four unreachable kinds\' raw strings as documented', () => {
  it('module / namespace -> NAMESPACE', () => {
    expect(mapToCanonical('module').kind).toBe(CanonicalKind.NAMESPACE);
    expect(mapToCanonical('namespace').kind).toBe(CanonicalKind.NAMESPACE);
  });

  it('statement / expression_statement / return_statement -> STATEMENT', () => {
    expect(mapToCanonical('statement').kind).toBe(CanonicalKind.STATEMENT);
    expect(mapToCanonical('expression_statement').kind).toBe(CanonicalKind.STATEMENT);
    expect(mapToCanonical('return_statement').kind).toBe(CanonicalKind.STATEMENT);
  });

  it('branch / if_statement / case / ternary / switch_case -> BRANCH', () => {
    expect(mapToCanonical('branch').kind).toBe(CanonicalKind.BRANCH);
    expect(mapToCanonical('if_statement').kind).toBe(CanonicalKind.BRANCH);
    expect(mapToCanonical('switch_case').kind).toBe(CanonicalKind.BRANCH);
  });

  it('parameter / argument / literal -> DATA', () => {
    expect(mapToCanonical('parameter').kind).toBe(CanonicalKind.DATA);
    expect(mapToCanonical('argument').kind).toBe(CanonicalKind.DATA);
    expect(mapToCanonical('literal').kind).toBe(CanonicalKind.DATA);
  });

  it('package / workspace_package -> PACKAGE, the one declared-and-language-gated kind that DOES persist', () => {
    expect(mapToCanonical('package').kind).toBe(CanonicalKind.PACKAGE);
    expect(mapToCanonical('workspace_package').kind).toBe(CanonicalKind.PACKAGE);
  });
});

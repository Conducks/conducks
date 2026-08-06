import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * A language's scoping construct lands on NAMESPACE, and a deployable unit on PACKAGE (ADR 0074).
 *
 * ADR 0074 recorded NAMESPACE's sources as "all tagged `@isPackage`" and left the query fix as an
 * open question, carried into todo48#P2. Reading the queries today says otherwise — C++, C#, PHP
 * and Rust all carry `@isNamespace` — but a reading is a hypothesis until it is run, and the whole
 * reason that open question survived is that nobody ran it. This is the run.
 *
 * The distinction is load-bearing rather than cosmetic: PACKAGE is rank 2 and NAMESPACE rank 3 in
 * the containment taxonomy, so a C# namespace wearing PACKAGE claims to be a deployable unit and
 * sits one level too high in every containment answer built on rank.
 */
describe('namespace vs package across languages', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('namespaces');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'ns', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'go.mod', 'module ns\n\ngo 1.21\n');

    // Scoping constructs — each must be NAMESPACE.
    writeFile(repo, 'src/a.cpp', 'namespace geometry { int area() { return 1; } }\n');
    writeFile(repo, 'src/b.cs', 'namespace Acme.Billing { public class Invoice { } }\n');
    writeFile(repo, 'src/c.php', "<?php\nnamespace Acme\\Shop;\nfunction total() { return 1; }\n");
    writeFile(repo, 'src/d.rs', 'mod parser { pub fn parse() -> i32 { 1 } }\n');
    // Deployable units — each must stay PACKAGE.
    writeFile(repo, 'src/e.go', 'package worker\n\nfunc Run() int { return 1 }\n');
    writeFile(repo, 'src/F.java', 'package com.acme.tool;\n\npublic class F { public int run() { return 1; } }\n');

    commit(repo, 'namespace and package declarations in six languages');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  const kindsIn = async (ext: string) => (await vault.query<{ kind: string; semantic_kind: string; name: string }>(
    `SELECT canonicalKind AS kind, semantic_kind, name FROM nodes WHERE file LIKE '%.${ext}'`
  ));

  it.each([
    ['cpp', 'geometry'],
    ['cs', 'Acme.Billing'],
    ['php', 'Acme\\Shop'],
    ['rs', 'parser'],
  ])('a %s scoping construct is NAMESPACE, never PACKAGE', async (ext, name) => {
    const rows = await kindsIn(ext);
    const hit = rows.find(r => r.name === name);
    expect(hit?.kind).toBe('NAMESPACE');
    expect(rows.some(r => r.kind === 'PACKAGE')).toBe(false);
  });

  it.each([
    ['go', 'worker'],
    ['java', 'com.acme.tool'],
  ])('a %s deployable unit stays PACKAGE', async (ext, name) => {
    const rows = await kindsIn(ext);
    expect(rows.find(r => r.name === name)?.kind).toBe('PACKAGE');
  });
});

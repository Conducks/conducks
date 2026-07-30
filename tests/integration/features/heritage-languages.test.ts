import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Inheritance is recorded for TypeScript, TSX and Go (todo25#P8).
 *
 * `docs/memory.md` asserted for weeks that these three emitted ZERO heritage edges. It was true when
 * written and stopped being true once the queries were ported — and nothing noticed, because nothing
 * checked. An architecture audit then reported "TS, TSX and Go record zero inheritance edges" as a
 * MAJOR finding, citing that memory entry as its evidence rather than counting rows.
 *
 * So this test exists less to prove the feature works than to stop the CLAIM going stale again. A
 * capability that is only asserted in prose decays silently; one with a test decays loudly.
 *
 * Go is included because its inheritance is struct EMBEDDING rather than an `extends` keyword, which
 * is the case a query ported from TypeScript is most likely to miss.
 */
describe('heritage edges across languages', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('heritage');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'h', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'go.mod', 'module h\n\ngo 1.21\n');
    writeFile(repo, 'src/a.tsx', `
interface Greeter { greet(): string; }
class Base { hello(): string { return 'hi'; } }
export class Widget extends Base implements Greeter {
  greet(): string { return this.hello(); }
}
`);
    writeFile(repo, 'src/b.ts', `
export interface Shape { area(): number; }
export class Circle implements Shape { area(): number { return 1; } }
export class Ring extends Circle {}
`);
    writeFile(repo, 'src/c.go', `package main

type Speaker interface { Speak() string }

type Animal struct { Name string }

type Dog struct {
	Animal
}

func (d Dog) Speak() string { return "woof" }
`);
    commit(repo, 'three languages with inheritance');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  const heritage = async (ext: string) => vault.query<{ type: string; name: string; targetId: string }>(
    `SELECT e.type, n.name, e.targetId FROM edges e JOIN nodes n ON e.sourceId = n.id
     WHERE e.type IN ('EXTENDS','IMPLEMENTS') AND n.file LIKE '%.${ext}'`);

  it('records both extends and implements for TypeScript', async () => {
    const rows = await heritage('ts');
    expect(rows.some(r => r.type === 'EXTENDS' && r.name === 'Ring')).toBe(true);
    expect(rows.some(r => r.type === 'IMPLEMENTS' && r.name === 'Circle')).toBe(true);
  });

  it('records both for TSX', async () => {
    const rows = await heritage('tsx');
    expect(rows.some(r => r.type === 'EXTENDS' && r.name === 'Widget')).toBe(true);
    expect(rows.some(r => r.type === 'IMPLEMENTS' && r.name === 'Widget')).toBe(true);
  });

  it('records Go struct embedding as inheritance', async () => {
    const rows = await heritage('go');
    expect(rows.some(r => r.name === 'Dog')).toBe(true);
  });

  it('resolves the target to a real symbol, not a bare name', async () => {
    // A bare target would still count as "an edge exists" while pointing at nothing — the failure
    // mode that made half this vault's edges dangle before todo24.
    const rows = await heritage('ts');
    const ring = rows.find(r => r.name === 'Ring');
    expect(ring?.targetId).toContain('::');
  });
});

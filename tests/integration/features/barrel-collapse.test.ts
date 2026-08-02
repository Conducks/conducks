import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0112 — a reference collapses onto the DECLARATION, and only a real re-export collapses.
 *
 * This exists because the metric that was used to justify the change could not see it. `verify-edges`
 * asks whether the source text contains the target's last name segment, and a barrel and the
 * declaration it republishes share that name — so rebinding `barrel::x` to `origin::x` left the
 * precision figure byte-identical (71,033 edges, 43 wrong, before and after). A number that cannot
 * move is not evidence.
 *
 * These assert exact target IDs on a hand-built chain, so a wrong rebind fails loudly. The negative
 * cases matter more than the positive ones: over-collapsing would silently retarget real edges.
 */
describe('barrel re-exports collapse onto the declaration', () => {
  let repo: string;

  const impactOn = (symbolId: string) => {
    const { stdout } = runCli(['impact', symbolId, 'upstream', '--json'], { cwd: repo });
    return JSON.parse(stdout);
  };
  const namesReaching = (symbolId: string): string[] =>
    impactOn(symbolId).affectedNodes.map((n: { name: string }) => n.name);

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('barrel-collapse');

    // A WORKSPACE, because that is what actually triggers the collapse.
    //
    // A relative barrel import (`from './barrel.js'`) already resolves straight to the declaration —
    // the binding names a file the resolver can walk, so the CALL never lands on the barrel and
    // there is nothing to collapse. The first version of this fixture used relative imports,
    // reported zero collapses, and passed identically with and without the fix: it proved nothing.
    //
    // A CROSS-PACKAGE import (`from '@repo/lib'`) resolves to the package ENTRY — the barrel — so
    // the call binds to `index.ts::realWork` and the declaration shows no callers. That is the case
    // measured on openship, where 588 references sat on barrels.
    writeFile(repo, 'package.json',
      JSON.stringify({ name: 'root', version: '1.0.0', workspaces: ['packages/*'] }, null, 2));

    writeFile(repo, 'packages/lib/package.json',
      JSON.stringify({ name: '@repo/lib', version: '1.0.0', main: 'src/index.ts' }, null, 2));
    writeFile(repo, 'packages/lib/src/origin.ts',
      'export function realWork(n: number): number { return n + 1; }\n' +
      'export function renamedOrigin(n: number): number { return n + 2; }\n');
    // The package barrel: one plain re-export, one RENAMED re-export.
    writeFile(repo, 'packages/lib/src/index.ts',
      "export { realWork } from './origin.js';\n" +
      "export { renamedOrigin as publicName } from './origin.js';\n");

    writeFile(repo, 'packages/app/package.json',
      JSON.stringify({ name: '@repo/app', version: '1.0.0', dependencies: { '@repo/lib': '*' } }, null, 2));
    writeFile(repo, 'packages/app/src/consumer.ts',
      "import { realWork } from '@repo/lib';\n" +
      'export function callsThroughBarrel(): number { return realWork(1); }\n');
    writeFile(repo, 'packages/app/src/renamed-consumer.ts',
      "import { publicName } from '@repo/lib';\n" +
      'export function callsRenamed(): number { return publicName(3); }\n');

    // A plain local alias — NOT a re-export. Nothing here may be collapsed.
    writeFile(repo, 'packages/app/src/local-alias.ts',
      'function helper(): number { return 7; }\n' +
      'const shorthand = helper;\n' +
      'export function useShorthand(): number { return shorthand(); }\n');

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('a call through one barrel reaches the declaration', () => {
    expect(namesReaching(`${repo}/packages/lib/src/origin.ts::realWork`)).toContain('callsThroughBarrel');
  }, 120000);

  /** `export { renamedOrigin as publicName }` — the caller writes `publicName`, the edge means `renamedOrigin`. */
  it('a RENAMED re-export resolves to the original declaration', () => {
    expect(namesReaching(`${repo}/packages/lib/src/origin.ts::renamedOrigin`)).toContain('callsRenamed');
  }, 120000);

  /**
   * The negative case, and the one that would catch over-reach: a local `const shorthand = helper`
   * is an alias but NOT a re-export. Collapsing it would retarget a real edge on evidence that does
   * not exist.
   */
  it('does not collapse a plain local alias', () => {
    const { stdout } = runCli(['query', 'shorthand', '--json'], { cwd: repo });
    const rows = JSON.parse(stdout);
    // The local alias survives as its own symbol rather than being folded into `helper`.
    expect(rows.some((r: { name: string }) => r.name === 'shorthand')).toBe(true);
  }, 120000);

  /**
   * IMPORTS deliberately stays on the barrel: the importing FILE's dependency really is on the
   * barrel, and rewriting it would misreport the module graph to fix a symbol-level question. The
   * barrel node must therefore still exist after the collapse.
   */
  it('keeps the barrel node, so the module graph still reports the real dependency', () => {
    const { stdout } = runCli(['query', 'realWork', '--json'], { cwd: repo });
    const files = JSON.parse(stdout).map((r: { filePath: string }) => r.filePath);
    expect(files.some((f: string) => f.includes('origin.ts'))).toBe(true);
    expect(files.some((f: string) => f.includes('index.ts'))).toBe(true);
  }, 120000);

  /** The declaration is what a bare name resolves to — not the export statement republishing it. */
  it('a bare name resolves to the declaration, not the re-export', () => {
    const { stdout } = runCli(['explain', 'realWork', '--json'], { cwd: repo });
    const e = JSON.parse(stdout);
    expect(e.filePath).toContain('origin.ts');
    expect(e.kind).toBe('BEHAVIOR');
  }, 120000);
});

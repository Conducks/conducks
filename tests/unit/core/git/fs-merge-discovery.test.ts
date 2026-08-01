import { describe, it, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * The FS-merge discovery path (todo29#P1) — recorded for weeks as untestable under jest.
 *
 * THE STATED BLOCKER WAS WRONG, and the correction is the useful part. It said "`getDiscoverySurface()`
 * uses a dynamic `import()` the ESM VM cannot resolve". Dynamic import works fine under
 * `--experimental-vm-modules`; what fails is one module in the chain — `typescript/resolver.ts`
 * statically imports `node:fs`, and the VM refuses to link a builtin for a module first reached
 * through a dynamic import, with `request for 'node:fs' can not be resolved on module ... that is
 * not linked`.
 *
 * Knowing that, the fix is one line: import the language modules STATICALLY here, before anything
 * triggers the dynamic path. They are then already linked and `getDiscoverySurface()` resolves from
 * cache. A blocker described as "dynamic import does not work" is unactionable; described as "this
 * module is not linked yet", it takes a minute.
 */
import '@/lib/core/parsing/languages/typescript/index.js';
import '@/lib/core/parsing/languages/python/index.js';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

const dirs: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-fsmerge-'));
  dirs.push(d);
  return d;
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const chronicleAt = (dir: string) => {
  const c = new ChronicleInterface();
  c.setProjectDir(dir);
  return c;
};

afterAll(() => { for (const d of dirs.reverse()) fs.rmSync(d, { recursive: true, force: true }); });

describe('discovery falls back to the filesystem when the anchor is not a repository', () => {
  it('finds files in a plain directory with no git at all', async () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'conducks.json'), '{"services":["."]}');

    const found = (await chronicleAt(root).discoverFiles()).map(f => path.relative(root, f)).sort();
    expect(found).toContain('src/a.ts');
    // The declaration itself must be discovered. A naive merge once dropped it, and the missing file
    // was the one that DECLARES the workspace — 5 units became 4 (todo29#P1).
    expect(found).toContain('conducks.json');
  });

  /**
   * The topology ADR 0069 called impossible and which actually works: no repository at the anchor,
   * a repository inside each service. `git ls-files` from the anchor answers nothing, so the FS walk
   * is what finds anything at all.
   */
  it('finds every service when the workspace root has no repository but the services do', async () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'conducks.json'), '{"services":["app","admin"]}');
    for (const svc of ['app', 'admin']) {
      const dir = path.join(root, svc);
      fs.mkdirSync(dir);
      git(dir, 'init', '-q', '-b', 'main');
      git(dir, 'config', 'user.email', 't@e.com');
      git(dir, 'config', 'user.name', 't');
      fs.writeFileSync(path.join(dir, `${svc}.ts`), `export const ${svc} = 1;\n`);
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'init');
    }

    const found = (await chronicleAt(root).discoverFiles()).map(f => path.relative(root, f)).sort();
    expect(found).toContain('app/app.ts');
    expect(found).toContain('admin/admin.ts');
    expect(found).toContain('conducks.json');
  });

  /**
   * The MERGE case, and the one the task was written for. A repository at the anchor with another
   * repository nested inside it: the outer `git ls-files` cannot see the inner service, so the
   * nested repository is asked separately and the results merged. Before that fix the inner service
   * was COMPLETELY invisible — 3 units analyzed where 5 exist.
   */
  it('merges a nested repository the outer one does not track', async () => {
    const root = mk();
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@e.com');
    git(root, 'config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'conducks.json'), '{"services":["app"]}');
    fs.writeFileSync(path.join(root, 'outer.ts'), 'export const outer = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'outer');

    const inner = path.join(root, 'app');
    fs.mkdirSync(inner);
    git(inner, 'init', '-q', '-b', 'main');
    git(inner, 'config', 'user.email', 't@e.com');
    git(inner, 'config', 'user.name', 't');
    fs.writeFileSync(path.join(inner, 'inner.ts'), 'export const inner = 1;\n');
    git(inner, 'add', '-A');
    git(inner, 'commit', '-q', '-m', 'inner');

    // The outer repository genuinely cannot see it — that is the whole problem.
    expect(git(root, 'ls-files')).not.toContain('inner.ts');

    const found = (await chronicleAt(root).discoverFiles()).map(f => path.relative(root, f)).sort();
    expect(found).toContain('outer.ts');
    expect(found).toContain('app/inner.ts');
  });
});

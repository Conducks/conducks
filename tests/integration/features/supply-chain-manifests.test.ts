import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `supply-chain` answers "what third-party code does this project stand on". It was answering that
 * question wrongly in three different ways, each of which inflates the number it reports.
 *
 *  1. THE STANDARD LIBRARY. `classifyOrigin` knew Node's core modules and nothing else, so every
 *     Python stdlib import counted as a third-party dependency. MEASURED on the scraper subject:
 *     `logging` (80 importing files), `typing` (79), `asyncio` (50), `pathlib` (48), `json` (45)…
 *     while the `stdlib` bucket held 2 entries.
 *
 *  2. FIRST-PARTY CODE. Python's absolute-import style (`from foundation.base_interfaces import X`)
 *     is a bare specifier naming the project's own module, and in a `src/` layout the resolver never
 *     looked there — so `foundation` (20 importers), `core` (33) and `specialists` (4) were reported
 *     as third-party dependencies of the project that contains them.
 *
 *  3. THE MANIFEST. Versions were read from the ROOT `package.json` only. A Python project has none
 *     (all 91 reported packages read "(not in package.json)"), and an npm workspaces monorepo
 *     declares per workspace — on the orchestrator subject `next` (224 importers), `next-auth` and
 *     `vitest` were all reported undeclared, two of them with a `[critical]` advisory badge, while
 *     `app/package.json` declared 33 dependencies and `admin/package.json` 30.
 *
 * Together: 91 reported dependencies on a project that declares 5.
 */
describe('supply-chain counts third-party code only, and finds every manifest', () => {
  describe('python, src layout', () => {
    let repo: string;

    beforeAll(() => {
      ensureBuild();
      repo = mkGitRepo('supply-chain-python');

      writeFile(repo, 'pyproject.toml', `
[project]
name = "subject"
version = "0.1.0"
dependencies = [
    "pyyaml>=6.0",
    "playwright>=1.40.0",
]

[tool.setuptools.packages.find]
where = ["src"]
`);
      writeFile(repo, 'src/foundation/__init__.py', '');
      writeFile(repo, 'src/foundation/paths.py', `
def get_project_root():
    return "/tmp"
`);
      writeFile(repo, 'main.py', `
import logging
import asyncio
from typing import Any
from pathlib import Path

import yaml
import bs4
from foundation.paths import get_project_root
# A first-party import that does NOT resolve: paths is a module, paths.paths is not. Taken from the
# scraper subject, where the same shape appears as reviews.reviews against a file named reviews.py.
# The import is broken; that does not make it a third-party package.
from foundation.paths.paths import missing_symbol

logger = logging.getLogger(__name__)

async def run(cfg: Any) -> Path:
    await asyncio.sleep(0)
    yaml.safe_load(cfg)
    bs4.BeautifulSoup("", "html.parser")
    return Path(get_project_root())
`);
      commit(repo, 'init');
      runCli(['analyze', '--yes'], { cwd: repo });
    }, 180000);

    afterAll(() => rmRepo(repo));

    it('counts the Python standard library as stdlib, not as dependencies', () => {
      const out = JSON.parse(runCli(['supply-chain', '--json'], { cwd: repo }).stdout);
      const names = out.packages.map((p: any) => p.package);
      for (const stdlib of ['logging', 'asyncio', 'typing', 'pathlib']) {
        expect(names).not.toContain(stdlib);
      }
      const stdlibRow = out.origins.find((o: any) => o.origin === 'stdlib');
      expect(stdlibRow?.distinctSurfaces ?? 0).toBeGreaterThan(0);
    }, 180000);

    it('does not report the project\'s own src-layout packages as dependencies', () => {
      const out = JSON.parse(runCli(['supply-chain', '--json'], { cwd: repo }).stdout);
      expect(out.packages.map((p: any) => p.package)).not.toContain('foundation');
    }, 180000);

    /**
     * A first-party import that does not RESOLVE is still first-party.
     *
     * MEASURED on the scraper subject: `specialists` — that repository's own plug-in package, under
     * `src/` — appeared in the dependency table as undeclared with 1 importer, while 11 files import
     * it. Ten resolve; the eleventh is
     * `from specialists.google_maps.extractors.reviews.reviews import ReviewsExtractor`, and the file
     * is `reviews.py`, so `reviews.reviews` names nothing. conducks was right that it does not
     * resolve and wrong about what that means: `resolvesInRepo` was the only first-party signal for
     * Python, so an unresolvable path fell through to `dependency`.
     *
     * The first segment is the evidence being thrown away. `foundation` is a directory in this
     * project, which a package name cannot be.
     */
    it('a broken first-party import is not a third-party package', () => {
      const out = JSON.parse(runCli(['supply-chain', '--json'], { cwd: repo }).stdout);
      const names = out.packages.map((p: any) => p.package);
      // Guard: the fixture must actually import something unresolvable, or this passes vacuously.
      expect(fs.readFileSync(path.join(repo, 'main.py'), 'utf-8')).toContain('foundation.paths.paths');
      expect(names).not.toContain('foundation');
      expect(names.some((n: string) => String(n).startsWith('foundation'))).toBe(false);
    }, 180000);

    /**
     * The per-package label was fixed to say `(undeclared)` — on a Python project there is no
     * package.json, and in a monorepo the declaration lives one directory down. The SUMMARY line was
     * missed in that same pass and still named the JavaScript manifest.
     *
     * MEASURED on the scraper subject: conducks read pyproject.toml correctly (every version it
     * printed came from it) and then told the reader to check a file the project does not have.
     */
    it('does not tell a Python project to check package.json', () => {
      const out = runCli(['supply-chain'], { cwd: repo }).combined;
      expect(fs.existsSync(path.join(repo, 'package.json'))).toBe(false);
      // `bs4` is imported and declared nowhere, so the phantom-dependency line MUST print — without
      // this the assertion below passes on a run that never reached the sentence under test.
      expect(out).toMatch(/phantom dependency/);
      expect(out).not.toMatch(/package\.json/);
    }, 180000);

    it('reads declared versions from pyproject.toml, through the import-name alias', () => {
      const out = JSON.parse(runCli(['supply-chain', '--json'], { cwd: repo }).stdout);
      const yamlRow = out.packages.find((p: any) => p.package === 'yaml');
      // `import yaml` is declared as `pyyaml` — the distribution name differs from the import name.
      expect(yamlRow).toBeDefined();
      expect(yamlRow.version).toBeTruthy();
    }, 180000);
  });

  describe('npm workspaces monorepo', () => {
    let repo: string;

    beforeAll(() => {
      ensureBuild();
      repo = mkGitRepo('supply-chain-monorepo');

      writeFile(repo, 'package.json', JSON.stringify({
        name: 'root', private: true, workspaces: ['app'],
        dependencies: { react: '^19.0.0' },
      }, null, 2));
      writeFile(repo, 'app/package.json', JSON.stringify({
        name: 'app',
        dependencies: { 'left-pad': '^1.3.0' },
      }, null, 2));
      writeFile(repo, 'app/src/main.ts', `
import leftPad from 'left-pad';
export function pad(s: string): string { return leftPad(s, 4); }
`);
      commit(repo, 'init');
      runCli(['analyze', '--yes'], { cwd: repo });
    }, 180000);

    afterAll(() => rmRepo(repo));

    it('resolves a version declared in a WORKSPACE manifest, not only the root one', () => {
      const out = JSON.parse(runCli(['supply-chain', '--json'], { cwd: repo }).stdout);
      const row = out.packages.find((p: any) => p.package === 'left-pad');
      expect(row).toBeDefined();
      expect(row.version).toBe('^1.3.0');
    }, 180000);
  });
});

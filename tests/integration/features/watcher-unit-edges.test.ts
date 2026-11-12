import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A watched save must leave a file's UNIT edges exactly as `analyze` writes them (deep test of
 * 2026-11-12, watch-vs-cold parity on a real Python repo).
 *
 * MEASURED before the fix: after `watch --pulse` re-stated a file, its unit had lost every IMPORTS,
 * DEPENDS_ON and its MEMBER_OF to the directory. `replaceFile` drops the file's outgoing edges, and
 * the live path rebuilt only what `ingestSpectrum` makes — which skips IMPORTS by design ("handled by
 * Pass 3 in Orchestrator") and never makes the unit → directory link (the skeleton builder does).
 * The watcher then recorded the hash, so no later `analyze` re-read the file: the edges stayed lost.
 * On scraper: a new module had none of its 3 IMPORTS, an edited one lost 5 DEPENDS_ON.
 */
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function until(out: () => string, test: (s: string) => boolean, ms = 40000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test(clean(out()))) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

/** The unit edges of `rel`, with the repo root cut out so two runs compare. */
async function unitEdges(repo: string, rel: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    const rows = await vault.query(
      `SELECT e.sourceId, e.type, e.targetId, e.confidence FROM edges e JOIN nodes s ON s.id = e.sourceId
       WHERE s.file LIKE ? ORDER BY 1, 2, 3`,
      [`%/${rel}`]);
    const root = repo.toLowerCase();
    const cut = (x: unknown) => String(x).split(root).join('<root>');
    return rows.map((r: any) => `${cut(r.sourceId)} ${r.type} ${cut(r.targetId)} ${Number(r.confidence).toFixed(2)}`);
  } finally { await vault.close(); }
}

/** The file's own nodes, with the repo root cut out. */
async function fileNodes(repo: string, rel: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    const rows = await vault.query(`SELECT id, canonicalKind FROM nodes WHERE file LIKE ? ORDER BY 1`, [`%/${rel}`]);
    const root = repo.toLowerCase();
    return rows.map((r: any) => `${String(r.id).split(root).join('<root>')} ${r.canonicalKind}`);
  } finally { await vault.close(); }
}

describe('watch --pulse keeps a file\'s unit edges', () => {
  let repo: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('watch-unit-edges');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    // Makes `global::string` a node, so a call on a `string` parameter has something to resolve to.
    writeFile(repo, 'src/s.ts', 'export function clean(x: number) { return String(x); }\n');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'w', dependencies: { chalk: '^5.0.0' } }, null, 2) + '\n');
    writeFile(repo, 'src/lib/b.ts', "import fs from 'node:fs';\nimport { foo } from '../a';\nexport function bar() { return foo() + (fs ? 1 : 0); }\n");
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => rmRepo(repo));

  it('an edited file and a new file have the edges a full analyze gives them', async () => {
    const proc = spawn('node', [CLI, 'watch', '--pulse'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
    });
    let out = '';
    proc.stdout.on('data', d => { out += String(d); });
    proc.stderr.on('data', d => { out += String(d); });
    const exited = new Promise<void>(r => proc.on('exit', () => r()));
    try {
      expect(await until(() => out, s => /Watcher — .* active/.test(s))).toBe(true);
      writeFile(repo, 'src/lib/b.ts', "import fs from 'node:fs';\nimport { foo } from '../a';\nexport function bar() { return foo() + (fs ? 2 : 0); }\n");
      expect(await until(() => out, s => (s.match(/Persisting structural delta/g) ?? []).length >= 1)).toBe(true);
      writeFile(repo, 'src/lib/c.ts', "import path from 'node:path';\nimport { bar } from './b';\nexport function baz(unused: number, userId: string) { return bar() + path.sep.length + userId.split(',').length; }\n");
      expect(await until(() => out, s => (s.match(/Persisting structural delta/g) ?? []).length >= 2)).toBe(true);
      writeFile(repo, 'py/d.py', 'import json\n\n\ndef dump(job_id: str, unused: int) -> str:\n    return json.dumps(job_id)\n');
      expect(await until(() => out, s => (s.match(/Persisting structural delta/g) ?? []).length >= 3)).toBe(true);
      // Files no language parser reads: a new README gets its unit and directory link, as `analyze`
      // gives it; a changed manifest is written as `analyze` writes it.
      writeFile(repo, 'docs/README.md', '# docs\n');
      expect(await until(() => out, s => (s.match(/Persisting structural delta/g) ?? []).length >= 4)).toBe(true);
      writeFile(repo, 'package.json', JSON.stringify({ name: 'w', dependencies: { chalk: '^5.0.0', minimatch: '^9.0.0' } }, null, 2) + '\n');
      expect(await until(() => out, s => (s.match(/Persisting structural delta/g) ?? []).length >= 5)).toBe(true);
    } finally {
      proc.kill('SIGINT');
      await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
      proc.kill('SIGKILL');
    }
    const watchedB = await unitEdges(repo, 'src/lib/b.ts');
    const watchedC = await unitEdges(repo, 'src/lib/c.ts');
    // And its nodes: `analyze` prunes a value node nothing references (an unused parameter); the
    // watcher wrote it and kept it.
    const watchedNodesC = await fileNodes(repo, 'src/lib/c.ts');
    const watchedNodesD = await fileNodes(repo, 'py/d.py');
    const watchedReadme = [...await fileNodes(repo, 'docs/readme.md'), ...await unitEdges(repo, 'docs/readme.md')];
    const watchedManifest = [...await fileNodes(repo, 'package.json'), ...await unitEdges(repo, 'package.json')];

    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const coldB = await unitEdges(repo, 'src/lib/b.ts');
    const coldC = await unitEdges(repo, 'src/lib/c.ts');
    const coldNodesC = await fileNodes(repo, 'src/lib/c.ts');
    const coldNodesD = await fileNodes(repo, 'py/d.py');
    const coldReadme = [...await fileNodes(repo, 'docs/readme.md'), ...await unitEdges(repo, 'docs/readme.md')];
    const coldManifest = [...await fileNodes(repo, 'package.json'), ...await unitEdges(repo, 'package.json')];

    // The reference must itself carry every kind, or the comparison proves nothing.
    expect(coldC.some(e => / IMPORTS /.test(e))).toBe(true);
    expect(coldC.some(e => / DEPENDS_ON /.test(e))).toBe(true);
    expect(coldC.some(e => /::unit MEMBER_OF directory::/.test(e))).toBe(true);
    // `userId.split(...)` on `userId: string` resolves to the String global — after a parse, not only
    // after a vault reload (the watcher never reloads).
    expect(coldC.some(e => /CALLS global::string/.test(e))).toBe(true);
    expect(watchedB).toEqual(coldB);
    expect(watchedC).toEqual(coldC);
    expect(watchedNodesC).toEqual(coldNodesC);
    expect(watchedNodesD).toEqual(coldNodesD);
    expect(coldReadme.length).toBeGreaterThan(0);
    expect(watchedReadme).toEqual(coldReadme);
    // `analyze` writes a manifest's unit and directory link only (its dependency read never reaches
    // the vault — a separate finding); the watcher must write the same, no more.
    expect(coldManifest.length).toBeGreaterThan(0);
    expect(watchedManifest).toEqual(coldManifest);
  }, 180000);
});

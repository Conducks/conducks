import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `watch --pulse` must leave the vault exactly as `analyze` would. It did not (state-machine audit,
 * 2026-11-12, P-02-3 / P-07-1 / P-08-1):
 *
 * MEASURED before the fix, `foo()` calling `bar()` in one file:
 *   - after ONE watched save every row of the file had `unitId = NULL` (the live path ingested
 *     without a unit id). `purgeUnits` finds a file's rows by `unitId`, so after renaming `bar` to
 *     `baz` and running `analyze`, the vault held BOTH — `bar` a ghost no later run could remove;
 *   - deleting a file under the watcher only forgot its hash: its symbols stayed in the vault;
 *   - after a branch switch the watcher printed "Auto-pulse stopped" and kept writing — the flag
 *     gated a log line, not the write.
 */

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function until(out: () => string, test: (s: string) => boolean, ms = 30000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test(clean(out()))) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

/** Run `watch --pulse`, hand it to `probe`, then stop it CLEANLY so its writes are on disk. */
async function withWatcher(cwd: string, probe: (out: () => string) => Promise<void>): Promise<string> {
  const proc = spawn('node', [CLI, 'watch', '--pulse'], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
  });
  let buffer = '';
  proc.stdout.on('data', d => { buffer += String(d); });
  proc.stderr.on('data', d => { buffer += String(d); });
  const exited = new Promise<void>(r => proc.on('exit', () => r()));
  try {
    if (!(await until(() => buffer, s => /Auto-Pulse Mode/.test(s), 40000))) throw new Error(`watcher never ready:\n${buffer.slice(-600)}`);
    await probe(() => buffer);
  } finally {
    proc.kill('SIGINT');
    await Promise.race([exited, new Promise(r => setTimeout(r, 10000))]);
    proc.kill('SIGKILL');
  }
  return clean(buffer);
}

async function rows(repo: string, sql: string): Promise<any[]> {
  const vault = new SynapsePersistence(repo, true);
  try { return await vault.query(sql); } finally { await vault.close(); }
}

const persisted = (n: number) => (s: string) => (s.match(/Persisting structural delta/g) ?? []).length >= n;

describe('watch --pulse writes the vault the way analyze does', () => {
  let repo: string;

  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('watch-parity');
    writeFile(repo, 'src/a.ts', 'export function foo() { return bar(); }\nfunction bar() { return 1; }\n');
    writeFile(repo, 'src/gone.ts', 'export function doomed() { return 2; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => rmRepo(repo));

  it('a watched save keeps unitId, so the next analyze removes a renamed symbol', async () => {
    await withWatcher(repo, async out => {
      writeFile(repo, 'src/a.ts', 'export function foo() { return bar() + 1; }\nfunction bar() { return 1; }\n');
      expect(await until(out, persisted(1))).toBe(true);
    });
    const units = await rows(repo, "SELECT name, unitId FROM nodes WHERE file LIKE '%/src/a.ts' AND canonicalKind <> 'UNIT' ORDER BY name");
    expect(units.map(r => [r.name, r.unitId === null ? 'NULL' : 'set'])).toEqual([['bar', 'set'], ['foo', 'set']]);

    writeFile(repo, 'src/a.ts', 'export function foo() { return baz(); }\nfunction baz() { return 1; }\n');
    runCli(['analyze', '--yes'], { cwd: repo });
    const names = (await rows(repo, "SELECT name FROM nodes WHERE file LIKE '%/src/a.ts' AND canonicalKind <> 'UNIT' ORDER BY name")).map(r => r.name);
    expect(names).toEqual(['baz', 'foo']);
  }, 180000);

  it('a file deleted under the watcher leaves no rows behind', async () => {
    await withWatcher(repo, async out => {
      fs.rmSync(path.join(repo, 'src/gone.ts'));
      expect(await until(out, s => /Removed:.*gone\.ts/.test(s))).toBe(true);
    });
    expect(await rows(repo, "SELECT id FROM nodes WHERE file LIKE '%/src/gone.ts'")).toEqual([]);
  }, 180000);

  it('after a branch switch nothing more is written', async () => {
    const before = await rows(repo, "SELECT name FROM nodes WHERE file LIKE '%/src/a.ts' ORDER BY name");
    const log = await withWatcher(repo, async out => {
      execFileSync('git', ['checkout', '-q', '-b', 'other'], { cwd: repo });
      expect(await until(out, s => /Auto-pulse stopped/.test(s))).toBe(true);
      writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\nexport function added() { return 3; }\n');
      expect(await until(out, s => /Change detected:.*a\.ts/.test(s))).toBe(true);
    });
    expect(log).not.toMatch(/Persisting structural delta/);
    expect(await rows(repo, "SELECT name FROM nodes WHERE file LIKE '%/src/a.ts' ORDER BY name")).toEqual(before);
  }, 180000);
});

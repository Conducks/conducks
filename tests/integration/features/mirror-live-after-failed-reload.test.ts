import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `mirror --live` after a live reload that FAILED (state-machine audit round 2, follow-up to Q-10-1).
 *
 * Q-10-1's fix leaves the graph DEFERRED when a reload cannot load the vault — the honest state, so
 * the dashboard routes load it on their next turn instead of answering from an empty graph. But the
 * watcher pulses into that graph directly, outside any route, and nothing loaded it first: the next
 * save failed as "[Watcher] Pulse error" until a dashboard request happened to load it.
 *
 * The reload is made to fail deterministically: another process holds the vault open for WRITING
 * (DuckDB refuses every other process while it does) and touches the file, which is what triggers
 * the mirror's reload.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = path.join(ROOT, 'build/src/interfaces/cli/index.js');
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function until(out: () => string, test: (s: string) => boolean, ms = 40000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test(clean(out()))) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('mirror --live after a failed reload', () => {
  let repo: string;
  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('mirror-failed-reload');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterAll(() => rmRepo(repo));

  it('the next save still pulses', async () => {
    const proc = spawn('node', [CLI, 'mirror', '--live'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
    });
    let buffer = '';
    proc.stdout.on('data', d => { buffer += String(d); });
    proc.stderr.on('data', d => { buffer += String(d); });
    const exited = new Promise<void>(r => proc.on('exit', () => r()));
    try {
      expect(await until(() => buffer, s => /Mirror is LIVE/.test(s))).toBe(true);

      // Hold the vault as a writer, write to it (so the mirror's stat poll sees a change), and keep
      // holding it past the mirror's 1250 ms debounce — its reload then cannot open the file.
      const vault = path.join(repo, '.conducks', 'conducks-synapse.db');
      const holder = spawnSync('node', ['--input-type=module', '-e', `
        import { DuckDBInstance } from ${JSON.stringify(path.join(ROOT, 'node_modules/@duckdb/node-api/lib/index.js'))};
        const i = await DuckDBInstance.create(${JSON.stringify(vault)});
        const c = await i.connect();
        await c.run("CREATE TABLE IF NOT EXISTS touch_probe (x INTEGER)");
        await c.run("INSERT INTO touch_probe VALUES (1)");
        await c.run("CHECKPOINT");
        await new Promise(r => setTimeout(r, 4500));
      `], { encoding: 'utf8' });
      expect(holder.status).toBe(0);
      expect(await until(() => buffer, s => /Failed to reload graph on vault pulse/.test(s), 10000)).toBe(true);

      writeFile(repo, 'src/a.ts', 'export function foo() { return 2; }\nexport function bar() { return 3; }\n');
      expect(await until(() => buffer, s => /Change detected:.*a\.ts/.test(s) || /Pulse error/.test(s))).toBe(true);
      expect(clean(buffer)).not.toMatch(/Pulse error/);
    } finally {
      proc.kill('SIGINT');
      await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
      proc.kill('SIGKILL');
    }
    expect(fs.existsSync(path.join(repo, '.conducks', 'watcher.json'))).toBe(false);
  }, 180000);
});

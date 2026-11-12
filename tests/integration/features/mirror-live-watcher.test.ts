import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `mirror --live` runs a file watcher next to the dashboard. Two faults (state-machine audit,
 * 2026-11-12):
 *
 *   - P-07-3: `mirror` is a read command, so its graph is DEFERRED; the watcher was started on it
 *     with nothing materialising it, and the first save threw "`getAllNodes` read a graph that is not
 *     materialised" — printed as "[Watcher] Pulse error", every save, until a dashboard request
 *     happened to load the graph.
 *   - P-07-2: Ctrl-C called `process.exit(0)` without stopping the watcher, so its liveness marker
 *     stayed behind and the next `monitor` reported a clean shutdown as a DEAD watcher.
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

describe('mirror --live', () => {
  let repo: string;
  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('mirror-live');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterAll(() => rmRepo(repo));

  it('pulses a saved file without a dashboard request, and a clean stop leaves no watcher marker', async () => {
    const proc = spawn('node', [CLI, 'mirror', '--live'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
    });
    let buffer = '';
    proc.stdout.on('data', d => { buffer += String(d); });
    proc.stderr.on('data', d => { buffer += String(d); });
    const exited = new Promise<number | null>(r => proc.on('exit', code => r(code)));
    try {
      expect(await until(() => buffer, s => /Mirror is LIVE/.test(s))).toBe(true);
      // The graph load at startup must not keep the vault either, before any save happens.
      expect(runCli(['analyze', '--yes'], { cwd: repo, allowFail: true }).status).toBe(0);
      writeFile(repo, 'src/a.ts', 'export function foo() { return 2; }\nexport function bar() { return 3; }\n');
      expect(await until(() => buffer, s => /Change detected:.*a\.ts/.test(s) || /Pulse error/.test(s))).toBe(true);
      expect(clean(buffer)).not.toMatch(/Pulse error/);
      expect(fs.existsSync(path.join(repo, '.conducks', 'watcher.json'))).toBe(true);
      // The live mirror must not sit on the vault between turns: an open handle in this process
      // refuses a writer in another, so `analyze` in a second terminal failed as LOCKED for the
      // whole session (the graph load and the watcher's per-save query never closed it).
      const other = runCli(['analyze', '--yes'], { cwd: repo, allowFail: true });
      expect(other.combined).not.toMatch(/LOCKED/);
      expect(other.status).toBe(0);
    } finally {
      proc.kill('SIGINT');
      await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
      proc.kill('SIGKILL');
    }
    expect(fs.existsSync(path.join(repo, '.conducks', 'watcher.json'))).toBe(false);
  }, 180000);
});

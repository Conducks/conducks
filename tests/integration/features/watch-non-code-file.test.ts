import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A file no language provider reads must not kill the watcher (state-machine audit round 2, Q-02-1).
 *
 * MEASURED before the fix: the watcher pulses every changed file that is not ignored — README.md,
 * package.json, a config. The parse worker answers such a file `{ skipped: true }` with no `spectrum`,
 * and the live path read `res.spectrum.nodes` inside the worker's `message` handler: an uncaught
 * TypeError on the main thread, exit 1. One README save killed `watch` and `watch --pulse`; a README
 * changed since the last `analyze` killed `watch --pulse` at startup, from its own reconcile.
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

/** Starts `watch`, runs `probe`, and reports whether the process was still alive at the end. */
async function watchSurvives(cwd: string, args: string[], probe: (out: () => string) => Promise<void>): Promise<{ alive: boolean; log: string }> {
  const proc = spawn('node', [CLI, 'watch', ...args], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
  });
  let buffer = '';
  let exited = false;
  proc.stdout.on('data', d => { buffer += String(d); });
  proc.stderr.on('data', d => { buffer += String(d); });
  const done = new Promise<void>(r => proc.on('exit', () => { exited = true; r(); }));
  try {
    await until(() => buffer, s => /Watcher — .* active/.test(s) || exited);
    await probe(() => buffer);
    await new Promise(r => setTimeout(r, 3000));
    return { alive: !exited, log: clean(buffer) };
  } finally {
    proc.kill('SIGINT');
    await Promise.race([done, new Promise(r => setTimeout(r, 10000))]);
    proc.kill('SIGKILL');
  }
}

describe('watch survives files no language provider reads', () => {
  let repo: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('watch-non-code');
    writeFile(repo, 'src/a.ts', 'export function foo() { return 1; }\n');
    writeFile(repo, 'README.md', '# Intro\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => rmRepo(repo));

  for (const args of [[], ['--pulse']]) {
    it(`a README save under \`watch ${args.join(' ')}\` leaves it running, and a later code save still pulses`, async () => {
      const r = await watchSurvives(repo, args, async out => {
        writeFile(repo, 'README.md', '# Intro\n\nmore\n');
        await new Promise(res => setTimeout(res, 2500));
        writeFile(repo, 'src/a.ts', 'export function foo() { return 2; }\n');
        expect(await until(out, s => /Change detected:.*a\.ts/.test(s))).toBe(true);
      });
      expect(r.log).not.toMatch(/TypeError/);
      expect(r.log).not.toMatch(/Pulse error/);
      expect(r.alive).toBe(true);
    }, 120000);
  }

  it('a README changed before `watch --pulse` starts does not kill it at startup', async () => {
    writeFile(repo, 'README.md', '# Intro\n\nchanged while nobody watched\n');
    const r = await watchSurvives(repo, ['--pulse'], async () => { /* startup only */ });
    expect(r.log).not.toMatch(/TypeError/);
    expect(r.alive).toBe(true);
  }, 120000);
});

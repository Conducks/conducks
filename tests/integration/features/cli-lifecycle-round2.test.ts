import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * CLI lifecycle findings from the state-machine audit, ROUND 2 (2026-11-12,
 * round-2/08-cli-lifecycle.md): gaps the round-1 fixes left.
 */
const CLI = path.resolve('build/src/interfaces/cli/index.js');
const repos: string[] = [];
afterEach(() => { while (repos.length) rmRepo(repos.pop()!); });

const analyzed = (prefix: string, files: Record<string, string> = { 'src/a.ts': 'export function first() { return 1; }\n' }) => {
  ensureBuild();
  const repo = mkGitRepo(prefix);
  repos.push(repo);
  for (const [p, c] of Object.entries(files)) writeFile(repo, p, c);
  commit(repo, 'init');
  runCli(['analyze', '--yes'], { cwd: repo });
  return repo;
};
const leftovers = (repo: string) => fs.readdirSync(path.join(repo, '.conducks')).filter(f => f.includes('.reader'));

/** Spawns the CLI, hands its output to `drive`, and waits for it to exit. */
async function drive(cwd: string, args: string[], driveFn: (proc: ReturnType<typeof spawn>, out: () => string) => Promise<void>): Promise<string> {
  const proc = spawn('node', [CLI, ...args], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
  });
  let out = '';
  proc.stdout!.on('data', d => { out += String(d); });
  proc.stderr!.on('data', d => { out += String(d); });
  const exited = new Promise<void>(r => proc.on('exit', () => r()));
  try {
    await driveFn(proc, () => out);
    await Promise.race([exited, new Promise(r => setTimeout(r, 60000))]);
  } finally {
    proc.kill('SIGKILL');
  }
  return out.replace(/\x1b\[[0-9;]*m/g, '');
}
async function until(out: () => string, re: RegExp, ms = 40000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (re.test(out())) return true; await new Promise(r => setTimeout(r, 100)); }
  return false;
}

describe('CLI lifecycle state, round 2', () => {
  /**
   * Q-08-1: every outcome of `guard` ended in `process.exit` INSIDE its try, so neither its own
   * `finally` nor the dispatcher's ran. Harmless while guard was read-only; since round 1 (P-08-3)
   * `guard --force` opens the vault for write and publishes a reader snapshot that only `close()`
   * removes — so every `guard --force` left a full copy of the vault behind.
   */
  it('guard --force leaves no reader snapshot behind', () => {
    const repo = analyzed('guard-snapshot');
    writeFile(repo, 'src/a.ts', 'export function first() { return 1; }\nexport function second() { return 2; }\n');
    runCli(['guard', '--force'], { cwd: repo, allowFail: true });
    expect(leftovers(repo)).toEqual([]);
  }, 240000);

  /**
   * Q-08-2: `guard --force` ignored the result of its analysis and logged "Pulse recorded." for one
   * that found nothing to analyze — and its later reads created the vault that run never filled, the
   * state P-08-6 removed from `analyze` (`list`, `setup`, `doctor` read it as an analyzed project).
   */
  it('guard --force on a project with nothing to analyze fails, says so, and creates no vault', () => {
    ensureBuild();
    const repo = mkGitRepo('guard-empty');
    repos.push(repo);
    writeFile(repo, 'src/a.ts', 'export function first() { return 1; }\n');
    writeFile(repo, '.conducksignore', '*\n**/*\n');   // discovery returns nothing
    commit(repo, 'init');
    const r = runCli(['guard', '--force'], { cwd: repo, allowFail: true });
    expect(r.combined).not.toMatch(/Pulse recorded/);
    expect(r.combined).toMatch(/Pre-guard analysis failed/);
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(repo, '.conducks', 'conducks-synapse.db'))).toBe(false);
  }, 240000);

  /**
   * Q-08-3: the branch guard refused `guard --force` when the vault was built on another branch —
   * before the pre-guard analysis whose whole job is to bring the vault up to date could run.
   */
  it('guard --force on another branch re-analyzes instead of refusing', async () => {
    const repo = analyzed('guard-branch');
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: repo });
    writeFile(repo, 'src/a.ts', 'export function first() { return 1; }\nexport function onFeature() { return 2; }\n');
    commit(repo, 'feature work');
    const r = runCli(['guard', '--force'], { cwd: repo, allowFail: true });
    // The graph now holds the feature branch's symbol.
    const q = runCli(['query', 'onFeature'], { cwd: repo, allowFail: true });
    expect(q.combined).toMatch(/onFeature/);
  }, 240000);

  /**
   * Q-08-4: `watch` registered its signal handlers only after start-up finished (ready + the
   * catch-up reconcile), but the liveness marker is written by `start()`. A Ctrl-C in between took
   * the default action: the process died, the marker stayed, and `monitor` reported a deliberate
   * stop as a DEAD watcher.
   */
  it('a Ctrl-C during watch start-up stops cleanly and leaves no watcher marker', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++) files[`src/f${i}.ts`] = `export function f${i}() { return ${i}; }\n`;
    const repo = analyzed('watch-startup-signal', files);
    // Changed while nothing watched: the start-up reconcile has 40 files to catch up on.
    for (let i = 0; i < 40; i++) writeFile(repo, `src/f${i}.ts`, `export function f${i}() { return ${i + 100}; }\nexport function g${i}() { return 0; }\n`);
    const out = await drive(repo, ['watch', '--pulse'], async (proc, o) => {
      expect(await until(o, /Step 5/)).toBe(true);
      expect(o()).not.toMatch(/Watcher — .* active/);
      proc.kill('SIGINT');
    });
    expect(out).not.toMatch(/Watcher — .* active/);
    expect(fs.existsSync(path.join(repo, '.conducks', 'watcher.json'))).toBe(false);
    expect(leftovers(repo)).toEqual([]);
  }, 240000);

  /**
   * Q-08-7: `mirror` had one `once` listener per signal and no re-entry guard, so a SIGTERM arriving
   * during a SIGINT shutdown ran the whole shutdown again — the fault P-08-9 fixed for `watch` only.
   */
  it('mirror --live shuts down once on two signals', async () => {
    const repo = analyzed('mirror-two-signals');
    const out = await drive(repo, ['mirror', '--live'], async (proc, o) => {
      expect(await until(o, /Mirror is LIVE/)).toBe(true);
      proc.kill('SIGINT');
      proc.kill('SIGTERM');
    });
    expect((out.match(/Stopping mirror/g) ?? []).length).toBe(1);
    expect(fs.existsSync(path.join(repo, '.conducks', 'watcher.json'))).toBe(false);
  }, 240000);
});

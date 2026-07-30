// Shared plumbing for the domain integration suites in this folder.
//
// Pattern follows tests/integration/cli.test.ts: every suite drives the REAL, BUILT CLI
// (build/src/interfaces/cli/index.js) in a child process. This is deliberate, not just
// convenience — per docs/memory.md, the native tree-sitter addon serves one JS wrapper per
// process, so a second in-process grammar load in the same jest worker corrupts the first.
// Spawning a fresh `node` process per CLI call sidesteps that poisoning entirely, and is also
// the most honest "real component wiring" test: CLI entry -> registry -> graph -> vault -> back.
//
// Vault isolation (docs/conventions.md CONDUCKS-29 / memory.md "pulse locks the vault"): each
// suite gets its own mkdtemp'd fixture repo(s) under the OS temp dir, never shared, never reused
// across suites, cleaned up in afterAll.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const cliPath = path.resolve('build/src/interfaces/cli/index.js');

/**
 * Builds when `build/` is MISSING **or STALE** (todo25#P5).
 *
 * It used to check only for absence, so an integration test would happily run against a build
 * compiled before the fix it was written to prove. That happened twice in one session: a test
 * appeared to pass, and the code under it had never been compiled. A test proving nothing is worse
 * than no test, because it reports as coverage (CONDUCKS-34).
 *
 * Staleness is newest-source-mtime vs the built CLI. It costs one directory walk per suite and
 * removes an entire class of false green.
 */
export function ensureBuild(): void {
  if (!fs.existsSync(cliPath)) {
    execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
    return;
  }
  const builtAt = fs.statSync(cliPath).mtimeMs;
  const newestSource = (dir: string): number => {
    let newest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs);
    }
    return newest;
  };
  if (newestSource(path.resolve('src')) > builtAt) {
    execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
  }
}

/** Creates an isolated temp git repo. Returns its absolute path. */
export function mkGitRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `conducks-int-${prefix}-`));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@conducks.local'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Conducks Test'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

export function writeFile(repo: string, relPath: string, content: string): void {
  const full = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function commit(repo: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', message], { cwd: repo, stdio: 'ignore' });
}

/** Runs the built CLI. Returns combined stdout+stderr. Throws on non-zero exit unless allowFail. */
// Most Conducks CLI logging goes through Logger, which writes to stderr regardless of level
// (see docs/memory.md "Logging always hits stderr"). `--json` output and plain console.log
// output go to stdout. `combined` merges both for assertions on log banners; `stdout` isolates
// the machine-readable payload for JSON.parse.
export function runCli(
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; allowFail?: boolean } = { cwd: process.cwd() }
): { stdout: string; stderr: string; combined: string; status: number } {
  const res = spawnSync('node', [cliPath, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf-8',
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const status = res.status ?? 1;
  if (status !== 0 && !opts.allowFail) {
    throw new Error(`CLI failed (${args.join(' ')}): ${stderr || stdout}`);
  }
  return { stdout, stderr, combined: stdout + stderr, status };
}

export function rmRepo(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

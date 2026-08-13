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
// `timeout` is not a nicety. A command that enters a watch loop — or hangs on a vault lock — makes
// spawnSync wait forever, and the whole suite dies on jest's own timeout with no failing assertion
// to read. That happened writing the coverage suite: `coverage-view --out --watch` swallowed the
// flag as a filename and then watched, and the run had to be killed at ten minutes. A killed child
// returns status null, which reads here as a non-zero exit — which is what a hang deserves.
/**
 * Generous ON PURPOSE (todo65). At 90s this fired on commands that had SUCCEEDED — the analyze
 * printed its "Synapse Reflection" line and was then SIGKILLed because the machine was busy, which
 * reads as a test failure and is how todo60's flake came to look like four different suites.
 *
 * The guard it exists to provide is against a command that never returns — a watch loop, a vault
 * lock held forever — and those hang indefinitely, so a higher ceiling loses nothing. Slowness must
 * not be convertible into failure.
 */
const DEFAULT_CLI_TIMEOUT_MS = 240000;

export function runCli(
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; allowFail?: boolean; timeout?: number } = { cwd: process.cwd() }
): { stdout: string; stderr: string; combined: string; status: number } {
  const res = spawnSync('node', [cliPath, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: 'utf-8',
    timeout: opts.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const status = res.status ?? 1;
  if (status !== 0 && !opts.allowFail) {
    // SAY WHY IT DIED (todo65). A killed child returns status null with EMPTY stdout and stderr, so
    // this used to throw `CLI failed (analyze --yes): ` with nothing after the colon — which is how
    // the parallel failures looked like a mystery for an afternoon. `signal` distinguishes SIGKILL
    // (the OS or a timeout killed it) from a real non-zero exit, and `res.error` carries ENOENT,
    // EMFILE and the spawn-level failures that never reach stderr at all.
    const why = [
      res.signal ? `signal=${res.signal}` : `status=${status}`,
      res.error ? `error=${(res.error as NodeJS.ErrnoException).code ?? res.error.message}` : '',
    ].filter(Boolean).join(' ');
    throw new Error(`CLI failed (${args.join(' ')}) [${why}]: ${stderr || stdout || '(no output — the process was killed before it wrote anything)'}`);
  }
  // A command that FAILED but was allowed to is the harder case to diagnose: the test asserts on its
  // output, sees "", and reports a content mismatch — with no hint that the process never ran. Say
  // so on stderr, where it lands in the run log without changing what the test sees.
  if (status !== 0 && opts.allowFail && !stdout && !stderr) {
    const why = res.signal ? `signal=${res.signal}` : `status=${status}`;
    console.error(`[runCli] ${args.join(' ')} produced NO output [${why}] — the process died before writing`);
  }
  return { stdout, stderr, combined: stdout + stderr, status };
}

export function rmRepo(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

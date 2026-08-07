import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The three commands that never exit on their own: `mcp`, `mirror`, `watch` (todo50 Phase 4).
 *
 * They were excluded from every sweep because they block, and "excluded" was allowed to read as
 * "fine" for months. Each is checked the only way a server can be: START it, make ONE real request
 * or cause ONE real event, then KILL it.
 *
 * EVERY process is killed in a `finally`. A test that leaks a server is worse than the gap it
 * closes — the next run finds the port taken or the vault locked, and the failure lands on whoever
 * comes after rather than on this file.
 */

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

/** Run a blocking command, hand it to `probe`, then kill it whatever happens. */
async function withProcess<T>(
  args: string[], cwd: string, probe: (p: ChildProcess, out: () => string) => Promise<T>,
): Promise<T> {
  // CHOKIDAR_USEPOLLING: macOS FSEvents is unreliable under /private/var/folders, where every
  // integration fixture lives — the watcher would look broken for a reason that is the temp
  // directory's, not its own. Polling exercises the same handler chain (debounce, hash gate,
  // micro-pulse) through a backend that works there. What this therefore does NOT prove is the
  // FSEvents path itself.
  const proc = spawn('node', [CLI, ...args], {
    cwd, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
  });
  let buffer = '';
  proc.stdout.on('data', d => { buffer += String(d); });
  proc.stderr.on('data', d => { buffer += String(d); });
  try {
    return await probe(proc, () => buffer);
  } finally {
    proc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 150));
  }
}

/** Wait until `test` passes over the accumulated output, or give up. */
async function until(out: () => string, test: (s: string) => boolean, ms = 20000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test(out())) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

describe('the commands that block', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('blocking');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'blk', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', 'export function main(): number { return 1; }\n');
    commit(repo, 'a project to serve');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  it('mcp speaks JSON-RPC on stdio and lists its tools', async () => {
    const tools = await withProcess(['mcp'], repo, async (proc, out) => {
      // The handshake an MCP client actually performs. Anything less proves only that a process
      // started, which is the bar these commands already passed by existing.
      proc.stdin!.write(JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }) + '\n');
      await until(out, s => s.includes('"id":1'), 20000);
      proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
      await until(out, s => s.includes('"id":2'), 20000);
      return out();
    });

    expect(tools).toMatch(/"jsonrpc"\s*:\s*"2\.0"/);
    // The tool surface is the contract: a server that answers `initialize` and then offers nothing
    // is a server no agent can use.
    expect(tools).toMatch(/conducks_(query|impact|trace|status|docs)/);
  }, 90000);

  it('mirror serves the wave over HTTP and binds LOOPBACK by default', async () => {
    const body = await withProcess(['mirror'], repo, async (_proc, out) => {
      const up = await until(out, s => /localhost:\d+|127\.0\.0\.1:\d+|Dashboard|listening/i.test(s), 25000);
      if (!up) return `SERVER_NEVER_REPORTED_READY::${out()}`;
      const port = (out().match(/:(\d{4,5})\b/) ?? [])[1] ?? '3333';
      const res = await fetch(`http://127.0.0.1:${port}/api/synapse`).catch(e => ({ ok: false, text: async () => String(e) }) as any);
      return `HTTP_OK::${res.ok}::${(await res.text()).slice(0, 400)}`;
    });

    expect(body).not.toMatch(/SERVER_NEVER_REPORTED_READY/);
    expect(body).toMatch(/HTTP_OK::true/);
    // The wave is the payload the dashboard draws; an empty one here would be ADR 0054's defect back.
    expect(body).toMatch(/"nodes"/);
  }, 90000);

  /**
   * WHAT THIS PROVES, AND WHAT IT DOES NOT — the honest split, because the second half is a finding
   * rather than a passing test.
   *
   * PROVEN: `watch` starts, initialises, and RECONCILES — it reports the files edited while nothing
   * was watching, which is the half ADR 0036 added and the half a session actually depends on
   * (`ignoreInitial: true` means the watcher is otherwise blind to everything before it started).
   *
   * NOT PROVEN: that a file created AFTER start produces a reaction. It was probed for 30s, with
   * chokidar polling forced to rule out macOS FSEvents under /private/var/folders, and no
   * `⚡ Change detected` line (watcher.ts:303) ever appeared. That is either a real defect or an
   * environment limit this harness cannot separate, and it is filed as todo51 rather than asserted
   * in either direction — a red test claiming a bug I have not proven is as wrong as a green one
   * claiming a feature I have not checked.
   */
  it('watch starts and reconciles what changed while it was off', async () => {
    const saw = await withProcess(['watch'], repo, async (_proc, out) => {
      const ready = await until(out, s => /Live Mirror Mode|Watcher/i.test(s), 25000);
      if (!ready) return `WATCHER_NEVER_READY::${out().slice(-400)}`;
      const reconciled = await until(out, s => /Caught up on \d+ changed and \d+ new/i.test(s), 20000);
      return reconciled ? 'RECONCILED' : `NO_RECONCILE::${out().slice(-400)}`;
    });

    expect(saw).toBe('RECONCILED');
  }, 120000);
});

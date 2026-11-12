import { describe, it, expect, afterEach } from '@jest/globals';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The mirror shares ONE vault handle between its routes and its live-sync reload, and a held handle
 * locks the vault for every other process (state-machine audit, 2026-11-12, area B):
 *
 *   P-10-14 routes that load the graph (`/api/governance`, `/api/dead`, `/api/flows`) or read the
 *           wave never closed the handle, so a `conducks analyze` in a terminal hit a locked vault.
 *           MEASURED: a DuckDB handle held open in one process refuses a writer in another.
 *   P-10-13 live sync watched the vault FILE once, only if it existed at start: a mirror started
 *           before the first analyze never synced, and the inode `fs.watch` holds is gone after a
 *           compaction renames a new file over it.
 */
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/src/interfaces/cli/index.js');

const procs: ChildProcess[] = [];
const repos: string[] = [];
afterEach(async () => {
  while (procs.length) procs.pop()!.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 200));
  while (repos.length) rmRepo(repos.pop()!);
});

async function startMirror(cwd: string): Promise<{ port: number; out: () => string }> {
  const proc = spawn('node', [CLI, 'mirror'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(proc);
  let buf = '';
  proc.stdout.on('data', d => { buf += String(d); });
  proc.stderr.on('data', d => { buf += String(d); });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const m = buf.match(/Dashboard: http:\/\/localhost:(\d+)/);
    if (m) return { port: Number(m[1]), out: () => buf };
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`mirror never came up:\n${buf.slice(-600)}`);
}

const get = (port: number, p: string) => new Promise<number>((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, res => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); }).on('error', reject);
});

/** Count `data:` events on the live channel while `during` runs, plus a settle window. */
async function pulsesDuring(port: number, during: () => void, settleMs = 6000): Promise<number> {
  let count = 0;
  const req = http.get({ host: '127.0.0.1', port, path: '/api/pulse' }, res => {
    res.on('data', d => { count += (String(d).match(/^data:/gm) ?? []).length; });
  });
  await new Promise(r => setTimeout(r, 500));
  during();
  await new Promise(r => setTimeout(r, settleMs));
  req.destroy();
  return count;
}

const project = (name: string) => {
  const repo = mkGitRepo(name);
  repos.push(repo);
  writeFile(repo, 'package.json', JSON.stringify({ name, version: '1.0.0', type: 'module' }));
  writeFile(repo, 'src/a.ts', 'export function a(): number { return 1; }\nexport function b(): number { return a(); }\n');
  commit(repo, 'init');
  return repo;
};

describe('the mirror and the vault lock', () => {
  it('after graph-walking routes, a terminal analyze can still write the vault (P-10-14)', async () => {
    ensureBuild();
    const repo = project('mirror-lock');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { port } = await startMirror(repo);

    for (const route of ['/api/overview', '/api/governance', '/api/dead', '/api/flows', '/api/synapse']) {
      expect(`${route} ${await get(port, route)}`).toBe(`${route} 200`);
    }
    const res = runCli(['analyze', '--force', '--yes'], { cwd: repo, allowFail: true });
    expect(res.combined).not.toMatch(/LOCKED|Conflicting lock/);
    expect(res.status).toBe(0);
  }, 240000);

  it('live sync fires on every analyze while the mirror runs (regression guard)', async () => {
    ensureBuild();
    const repo = project('mirror-sync');
    // The vault must exist for `mirror` to start at all (a read never creates one): an empty vault.
    runCli(['analyze', '--yes'], { cwd: repo });
    const { port } = await startMirror(repo);

    const first = await pulsesDuring(port, () => {
      writeFile(repo, 'src/c.ts', 'export function c(): number { return 3; }\n');
      runCli(['analyze', '--yes'], { cwd: repo });
    });
    const second = await pulsesDuring(port, () => {
      writeFile(repo, 'src/d.ts', 'export function d(): number { return 4; }\n');
      runCli(['analyze', '--force', '--yes'], { cwd: repo });
    });
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  }, 240000);

  it('live sync survives the vault file being REPLACED, as a compaction does (P-10-13)', async () => {
    ensureBuild();
    const repo = project('mirror-inode');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { port } = await startMirror(repo);

    // What `compact()` does: write a fresh file and rename it over the vault. A watch bound to the
    // old inode sees nothing after this.
    const db = path.join(repo, '.conducks', 'conducks-synapse.db');
    fs.copyFileSync(db, db + '.swap');
    fs.renameSync(db + '.swap', db);
    await new Promise(r => setTimeout(r, 2500));

    const after = await pulsesDuring(port, () => {
      writeFile(repo, 'src/e.ts', 'export function e(): number { return 5; }\n');
      runCli(['analyze', '--yes'], { cwd: repo });
    });
    expect(after).toBeGreaterThan(0);
  }, 240000);
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { DriftEngine, EvolutionService } from "@/lib/domain/evolution/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Watcher saves must not cost the vault its history (state-machine audit round 2, Q-07-3).
 *
 * `watch --pulse` writes a `pulses` row on every save — that is what tells a long-lived reader (the
 * MCP server's staleness check) that the vault moved — but it writes no `node_history`: history is
 * the analyze pulse's snapshot. Every history reader took "the latest pulses by timestamp".
 *
 * MEASURED before the fix: after ONE watched save, `drift` said "No symbols were comparable between
 * these two pulses", `guard` said NOT ASSESSED and `audit --history` had nothing to compare — all
 * three compared watcher rows that hold no history. And `snapshotHistory` kept history only for the
 * latest KEEP_PULSES (20) pulses of ANY kind, so twenty watched saves made the next `analyze` delete
 * the history of every real pulse.
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

async function oneWatchedSave(repo: string): Promise<void> {
  const proc = spawn('node', [CLI, 'watch', '--pulse'], {
    cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
  });
  let buffer = '';
  proc.stdout.on('data', d => { buffer += String(d); });
  proc.stderr.on('data', d => { buffer += String(d); });
  const exited = new Promise<void>(r => proc.on('exit', () => r()));
  try {
    if (!(await until(() => buffer, s => /Watcher — .* active/.test(s)))) throw new Error(`watcher never ready:\n${buffer.slice(-600)}`);
    writeFile(repo, 'src/b.ts', 'export function other() { return 7; }\n');
    if (!(await until(() => buffer, s => /Persisting structural delta/.test(s)))) throw new Error(`no watched save:\n${buffer.slice(-600)}`);
    await new Promise(r => setTimeout(r, 1500));
  } finally {
    proc.kill('SIGINT');
    await Promise.race([exited, new Promise(r => setTimeout(r, 10000))]);
    proc.kill('SIGKILL');
  }
}

async function withVault<T>(repo: string, readOnly: boolean, fn: (p: SynapsePersistence) => Promise<T>): Promise<T> {
  const p = new SynapsePersistence(repo, readOnly);
  try { return await fn(p); } finally { await p.close(); }
}

const BRANCHY = `export function grow(x: number) {
  if (x > 1) { x++; } if (x > 2) { x++; } if (x > 3) { x++; } if (x > 4) { x++; }
  if (x > 5) { x++; } if (x > 6) { x++; } if (x > 7) { x++; } if (x > 8) { x++; }
  for (let i = 0; i < x; i++) { if (i % 2) { x--; } else if (i % 3) { x++; } }
  return x;
}
export function caller() { return grow(1) + grow(2); }
`;

describe('watcher saves keep drift, audit and guard answerable', () => {
  let repo: string;
  beforeEach(() => {
    ensureBuild();
    repo = mkGitRepo('watch-history');
    writeFile(repo, 'src/a.ts', 'export function grow(x: number) { return x; }\nexport function caller() { return grow(1); }\n');
    writeFile(repo, 'src/b.ts', 'export function other() { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    writeFile(repo, 'src/a.ts', BRANCHY);
    commit(repo, 'grow');
    runCli(['analyze', '--yes'], { cwd: repo });
  });
  afterEach(() => rmRepo(repo));

  it('after a watched save, drift and audit still compare the two analyze pulses', async () => {
    const before = await withVault(repo, true, p => new DriftEngine(p).compare());
    expect(before.deltas.length).toBeGreaterThan(0);

    await oneWatchedSave(repo);

    const drift = await withVault(repo, true, p => new DriftEngine(p).compare());
    expect(drift.message).not.toMatch(/No symbols were comparable/);
    expect(drift.deltas.length).toBe(before.deltas.length);
    const audit = await withVault(repo, true, p => new EvolutionService(null, p).auditService.audit(5));
    expect(audit.status).not.toBe('INSUFFICIENT_DATA');

    const guard = runCli(['guard'], { cwd: repo, allowFail: true });
    expect(clean(guard.combined)).not.toMatch(/No symbols were comparable/);

    // `diff --base` with no `--head` compares against the latest pulse WITH history, not a watcher
    // row that holds none (which read as "every symbol removed").
    const first = await withVault(repo, true, p => p.query<{ id: string }>(
      'SELECT id FROM pulses WHERE id IN (SELECT pulseId FROM node_history) ORDER BY timestamp ASC LIMIT 1'));
    const diff = runCli(['diff', '--base', String(first[0].id), '--json'], { cwd: repo, allowFail: true });
    const json = JSON.parse(diff.combined.slice(diff.combined.indexOf('{')));
    expect(json.headNodeCount).toBeGreaterThan(0);
  }, 240000);

  it('watcher pulses do not push the analyze pulses out of the history window', async () => {
    const real = await withVault(repo, true, p => p.query<{ pulseId: string }>('SELECT DISTINCT pulseId FROM node_history'));
    expect(real.length).toBe(2);

    await withVault(repo, false, async p => {
      // Twenty-five watcher-style pulses: a row each, no history — what a long watch session leaves.
      const base = Date.now();
      for (let i = 0; i < 25; i++) {
        await p.run('INSERT INTO pulses (id, timestamp, nodeCount, edgeCount, metadata, scoped) VALUES (?, ?, 0, 0, ?, false)', [`pulse_w${i}`, base + i, '{}']);
      }
      // Then the next analyze pulse snapshots its history and prunes the window.
      await p.run('INSERT INTO pulses (id, timestamp, nodeCount, edgeCount, metadata, scoped) VALUES (?, ?, 0, 0, ?, false)', ['pulse_next', base + 100, '{}']);
      await p.snapshotHistory('pulse_next');
    });

    const kept = await withVault(repo, true, p => p.query<{ pulseId: string }>('SELECT DISTINCT pulseId FROM node_history'));
    const ids = kept.map(r => String(r.pulseId));
    for (const r of real) expect(ids).toContain(String(r.pulseId));
    expect(ids).toContain('pulse_next');

    // A window of five is five pulses WITH history, not the five newest rows of any kind.
    const audit = await withVault(repo, true, p => new EvolutionService(null, p).auditService.audit(5));
    expect(audit.status).not.toBe('INSUFFICIENT_DATA');
  }, 240000);
});

import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Readers are served from a snapshot, so a pulse never fails a read (todo21#P6, ADR 0040).
 *
 * MEASURED BASELINE, before the fix, from two real processes:
 *
 *   IO Error: Could not set lock on file ".../conducks-synapse.db": Conflicting lock is held
 *   in /opt/homebrew/.../node (PID 77594) by user saidmustafasaid.
 *
 * — refused in 5 ms. DuckDB's file lock is exclusive for the whole file and a read-only open is
 * refused outright rather than queued.
 *
 * EVERY test here spans PROCESSES, and that is not incidental. MEASURED: a second READ_WRITE open
 * of the same path inside ONE process is GRANTED, because DuckDB answers it from its instance cache
 * and never reaches the file lock. An in-process version of these tests would pass on the broken
 * code and prove nothing.
 */

const PROBE = path.resolve(process.cwd(), 'tests/helpers/vault-probe.ts');
const TSX = path.resolve(process.cwd(), 'node_modules/.bin/tsx');

const roots: string[] = [];
const children: ChildProcess[] = [];

const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-snapshot-'));
  roots.push(r);
  return r;
};
const vaultFile = (root: string) => path.join(root, '.conducks', 'conducks-synapse.db');
const snapshotFile = (root: string) => `${vaultFile(root)}.reader`;

/** Run the probe to completion and hand back its printed facts. */
const probe = (mode: string, root: string, signal?: string): Record<string, string> => {
  const r = spawnSync(TSX, [PROBE, mode, root, ...(signal ? [signal] : [])], { encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const facts: Record<string, string> = { RAW: out, STATUS: String(r.status) };
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) facts[m[1]] = m[2];
  }
  return facts;
};

/** Start a pulse in another process and wait until it is actually holding the vault. */
const startPulse = async (root: string, signal: string): Promise<ChildProcess> => {
  const child = spawn(TSX, [PROBE, 'pulse', root, signal], { encoding: 'utf8' } as never);
  children.push(child);
  let log = '';
  child.stdout?.on('data', d => { log += d; });
  child.stderr?.on('data', d => { log += d; });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (fs.existsSync(`${signal}.holding`)) return child;
    if (child.exitCode !== null) throw new Error(`pulse process died early: ${log}`);
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`pulse process never took the lock: ${log}`);
};

const release = (signal: string) => fs.writeFileSync(signal, 'x');
const waitExit = (child: ChildProcess) => new Promise<void>(r => child.on('close', () => r()));

afterEach(async () => {
  for (const c of children.splice(0)) { if (c.exitCode === null) c.kill('SIGKILL'); }
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('reader snapshot — a pulse never fails a read', () => {
  it('answers a mid-pulse read from the PREVIOUS pulse instead of erroring', async () => {
    const root = mkRoot();
    expect(probe('seed', root).STATUS).toBe('0');
    const signal = path.join(root, 'go');

    const pulse = await startPulse(root, signal);

    // The vault is locked right now — this is the exact call that used to die in 5 ms with
    // "Could not set lock on file".
    const read = probe('read', root);
    release(signal);
    await waitExit(pulse);

    expect(read.STATUS).toBe('0');
    expect(read.ERROR).toBeUndefined();
    expect(read.FROM_SNAPSHOT).toBe('true');       // it fell back, i.e. the lock really was held
    expect(read.COUNT).toBe('500');                // the PREVIOUS pulse's answer, not the in-flight one
    expect(read.PULSE).toBe('pulse-seed');
  }, 180000);

  it('names the pulse it answered from, so "one pulse stale" is visible', async () => {
    const root = mkRoot();
    probe('seed', root);
    const signal = path.join(root, 'go');
    const pulse = await startPulse(root, signal);

    const during = probe('read', root);
    release(signal);
    await waitExit(pulse);

    const after = probe('read', root);

    // Same tool, two different pulses, and each says which one it is answering from. Without this
    // the staleness is real but invisible, which is the failure ADR 0040 calls out.
    expect(during.PULSE).toBe('pulse-seed');
    expect(during.FROM_SNAPSHOT).toBe('true');
    expect(after.PULSE).toBe('pulse-mid');
    expect(after.FROM_SNAPSHOT).toBe('false');
    expect(after.COUNT).toBe('511');
  }, 180000);

  it('a read with NO pulse running still comes from the vault, not a stale copy', async () => {
    const root = mkRoot();
    probe('seed', root);
    const read = probe('read', root);
    expect(read.FROM_SNAPSHOT).toBe('false');
    expect(read.COUNT).toBe('500');
  }, 180000);

  it('the snapshot is published as a sibling and swapped in by rename, leaving no temp file', async () => {
    const root = mkRoot();
    probe('seed', root);
    const signal = path.join(root, 'go');
    const pulse = await startPulse(root, signal);

    const dir = path.join(root, '.conducks');
    const during = fs.readdirSync(dir);
    // The snapshot exists while the pulse runs, and the temp file the rename consumed does not.
    expect(during).toContain('conducks-synapse.db.reader');
    expect(during.filter(f => f.includes('.reader.tmp-'))).toEqual([]);

    release(signal);
    await waitExit(pulse);
  }, 180000);

  it('removes a STALE write-ahead log beside the snapshot, so the snapshot can be OPENED', async () => {
    const root = mkRoot();
    probe('seed', root);

    // Plant a REAL write-ahead log under the snapshot's name, the way a crashed or older writer
    // would leave one. A fabricated file would only prove DuckDB rejects garbage; this is a log
    // DuckDB will genuinely try to replay.
    const donor = mkRoot();
    const dp = new SynapsePersistence(donor, false);
    await dp.query('SELECT 1');
    await dp.run(`INSERT INTO nodes (id, pulseId, name, file, canonicalKind)
                  SELECT 'd'||i, 'p', 'd'||i, '/d.ts', 'UNIT' FROM range(50) t(i)`);
    await dp.close();     // no CHECKPOINT: the rows are still in the log
    const donorWal = `${vaultFile(donor)}.wal`;
    expect(fs.existsSync(donorWal)).toBe(true);
    fs.copyFileSync(donorWal, `${snapshotFile(root)}.wal`);

    const signal = path.join(root, 'go');
    const pulse = await startPulse(root, signal);

    // DuckDB replays `<db>.wal` on the next open by FILENAME. A log left beside the file just
    // renamed into its place is replayed against a database that already has those tables, and the
    // reader's open dies with "Table with name nodes already exists" (ADR 0037's pinned trap).
    expect(fs.existsSync(`${snapshotFile(root)}.wal`)).toBe(false);

    // The assertion that proves it: a real reader, in another process, opens it and gets rows.
    const read = probe('read', root);
    expect(read.STATUS).toBe('0');
    expect(read.FROM_SNAPSHOT).toBe('true');
    expect(read.COUNT).toBe('500');

    release(signal);
    await waitExit(pulse);
  }, 180000);

  it('takes the snapshot away when the write session ends, so 2x disk lasts one pulse', async () => {
    const root = mkRoot();
    probe('seed', root);
    const signal = path.join(root, 'go');
    const pulse = await startPulse(root, signal);
    expect(fs.existsSync(snapshotFile(root))).toBe(true);

    release(signal);
    await waitExit(pulse);

    expect(fs.existsSync(snapshotFile(root))).toBe(false);
  }, 180000);

  it('a killed pulse leaves the OLD vault readable — never a half-written one', async () => {
    const root = mkRoot();
    probe('seed', root);
    const signal = path.join(root, 'go');
    const pulse = await startPulse(root, signal);

    // SIGKILL mid-pulse: no chance to roll back, no chance to clean up.
    pulse.kill('SIGKILL');
    await waitExit(pulse);

    const read = probe('read', root);
    expect(read.STATUS).toBe('0');
    expect(read.COUNT).toBe('500');   // the pulse's 11 rows never committed
  }, 180000);

  it('does not publish a snapshot of an EMPTY vault — a wrong answer is worse than the lock error', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');        // creates the schema, writes no rows
    expect(fs.existsSync(snapshotFile(root))).toBe(false);
    await p.close();
  }, 60000);
});

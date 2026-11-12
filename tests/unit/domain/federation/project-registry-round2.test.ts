import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, chmodSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';

/**
 * The project registry's lock and its reads/writes, as left by round 1 (state-machine audit round 2,
 * Q-05-1..Q-05-6, Q-08-5). Each case below failed on the round-1 code.
 */
describe('ProjectRegistry lock and write states (round 2)', () => {
  let home = '';
  let dir = '';
  let file = '';
  let lock = '';

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'conducks-home-r2-'));
    dir = path.join(home, '.conducks');
    file = path.join(dir, 'projects.json');
    lock = `${file}.lock`;
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    try { if (fs.statSync(file).isFile()) chmodSync(file, 0o644); } catch { /* not there */ }
    rmSync(home, { recursive: true, force: true });
  });

  const seed = (roots: string[]) => writeFileSync(file, JSON.stringify({ version: 1, projects: roots.map(r => ({ root: r, name: path.basename(r), registeredAt: 1, lastSetupAt: 1 })) }));
  const roots = () => (JSON.parse(readFileSync(file, 'utf8')).projects as any[]).map(p => p.root);

  it('Q-05-1: a stale-lock takeover does not delete a lock another process took over first', () => {
    // A crashed process left a stale lock. Between this process's stat ("stale") and its removal,
    // another process takes the lock over and holds a FRESH one. Round 1 then deleted that fresh lock
    // and both processes ran their read-modify-write at once.
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);

    const realStat = fs.statSync;
    let otherTookOver = false;
    jest.spyOn(fs, 'statSync').mockImplementation(((p: any, o?: any) => {
      const st = realStat(p, o);
      if (String(p) === lock && !otherTookOver) {
        otherTookOver = true;
        rmSync(lock, { force: true });
        writeFileSync(lock, 'OTHER');
      }
      return st;
    }) as any);
    // While this process waits, the other one finishes: it releases ITS lock, if it still has it.
    let otherLockIntact: boolean | null = null;
    jest.spyOn(Atomics, 'wait').mockImplementation((() => {
      if (otherLockIntact === null) {
        otherLockIntact = existsSync(lock) && readFileSync(lock, 'utf8') === 'OTHER';
        if (otherLockIntact) rmSync(lock, { force: true });
      }
      return 'timed-out';
    }) as any);

    const result = new ProjectRegistry(home).register('/repo/a');

    expect(otherLockIntact).toBe(true);
    expect(result.written).toBe(true);
    expect(roots()).toEqual(['/repo/a']);
  });

  it('Q-05-2: releasing the lock does not delete a lock that is no longer ours', () => {
    // While this process held the lock past the stale time, another took it over. Round 1's release
    // deleted whatever lock file was there — the other process's — and a third could then enter.
    const realWrite = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation(((p: any, d: any, o?: any) => {
      if (String(p).endsWith('.tmp')) realWrite(lock, 'TAKEN-OVER');
      return realWrite(p, d, o);
    }) as any);

    new ProjectRegistry(home).register('/repo/a');

    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(lock, 'utf8')).toBe('TAKEN-OVER');
  });

  it('Q-05-3: a lock still held when the wait runs out is not written past', () => {
    // Round 1 went ahead UNLOCKED after the wait, and reported written: true — the lost update the
    // lock exists to prevent, with nothing to show it happened.
    seed(['/repo/kept']);
    writeFileSync(lock, 'LIVE-HOLDER');

    const result = new ProjectRegistry(home, { waitMs: 300, staleMs: 60_000 }).register('/repo/a');

    expect(result.written).toBe(false);
    expect(roots()).toEqual(['/repo/kept']);
    expect(readFileSync(lock, 'utf8')).toBe('LIVE-HOLDER');
  });

  it('Q-05-4: a registry that exists but cannot be read is not replaced by a one-entry list', () => {
    if (process.getuid?.() === 0) return; // root reads a 000 file
    seed(['/repo/one', '/repo/two']);
    chmodSync(file, 0o000);

    const result = new ProjectRegistry(home).register('/repo/new');

    chmodSync(file, 0o644);
    expect(result.written).toBe(false);
    expect(roots()).toEqual(['/repo/one', '/repo/two']);
  });

  it('Q-05-4: a registry written by a newer conducks is not rewritten as version 1', () => {
    writeFileSync(file, JSON.stringify({ version: 2, projects: [{ root: '/repo/one' }], extra: 'kept' }));

    const result = new ProjectRegistry(home).register('/repo/new');

    expect(result.written).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 2, extra: 'kept' });
  });

  it('Q-05-5 / Q-08-5: forget says when the entry was found but the file could not be written', () => {
    seed(['/repo/a', '/repo/b']);
    // The temp file the write goes through cannot be created.
    mkdirSync(`${file}.${process.pid}.tmp`);

    const result = new ProjectRegistry(home).forget('/repo/a');

    expect(result).toEqual({ removed: true, written: false });
    expect(roots()).toEqual(['/repo/a', '/repo/b']);
  });

  it('Q-05-5: forget reports a real removal as written', () => {
    seed(['/repo/a', '/repo/b']);
    expect(new ProjectRegistry(home).forget('/repo/a')).toEqual({ removed: true, written: true });
    expect(new ProjectRegistry(home).forget('/repo/a')).toEqual({ removed: false, written: false });
    expect(roots()).toEqual(['/repo/b']);
  });

  it('Q-05-6: a failed rename does not leave its temp file behind', () => {
    // The rename target is a non-empty directory: the temp file is written, the rename fails.
    mkdirSync(path.join(file, 'x'), { recursive: true });

    const written = (new ProjectRegistry(home) as any).write([]);

    expect(written).toBe(false);
    expect(readdirSync(dir).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });
});

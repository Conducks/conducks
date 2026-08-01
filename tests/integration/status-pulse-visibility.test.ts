import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `conducks status` names WHICH pulse it answered from (todo21 Phase 6, ADR 0040).
 *
 * A read arriving while an `analyze` holds the vault is answered from the PREVIOUS pulse's
 * snapshot rather than refused. That is correct, but invisible unless `status` says so — one
 * pulse stale is acceptable, one pulse stale and SILENT is not. This spans two real OS
 * processes end to end: a real `conducks analyze --force` writer and a real `conducks status`
 * reader racing it, exactly the way an agent would hit it.
 *
 * MEASURED, a same-process second open of the same DuckDB file is GRANTED from DuckDB's
 * instance cache and never reaches the file lock (see reader-snapshot.test.ts) — an in-process
 * version of this test would pass on broken code and prove nothing. Every call here is a
 * `tsx` child process spawned fresh, the same shape `tests/integration/cli.test.ts` and
 * `tests/unit/core/persistence/reader-snapshot.test.ts` already use.
 */

const TSX = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
const CLI = path.resolve(process.cwd(), 'src/interfaces/cli/index.ts');

// Large enough that a real `analyze --force` holds the vault for several seconds — MEASURED
// locally: 1600 trivial files ≈ 5s wall clock, giving `status --json` (≈1.1s per call) several
// chances to land mid-pulse. A handful of files finishes before the first poll ever fires.
const FILE_COUNT = 1600;

describe('status names the pulse it answers from (todo21 Phase 6, ADR 0040)', () => {
  let root: string;
  let bgChild: ChildProcess | null = null;

  const statusJson = (): any => {
    const out = execFileSync(TSX, [CLI, 'status', '--json', root], { encoding: 'utf8' });
    return JSON.parse(out);
  };

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-status-pulse-'));
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir);
    for (let i = 1; i <= FILE_COUNT; i++) {
      fs.writeFileSync(path.join(srcDir, `mod${i}.ts`), `export function fn${i}() { return ${i} * 2; }\n`);
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: root });

    // Seed a first vault so the second write session has a PREVIOUS pulse to fall back to.
    execFileSync(TSX, [CLI, 'analyze', '--yes', root], { encoding: 'utf8' });
  }, 180000);

  afterAll(() => {
    if (bgChild && bgChild.exitCode === null) bgChild.kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('mid-write: names the previous pulse and says it was served from its snapshot; after: switches to the new pulse from the vault', async () => {
    const seeded = statusJson();
    const seededPulseId = seeded.staleness.pulseId;
    expect(seededPulseId).not.toBe('none');
    expect(seeded.staleness.servedFrom).toBe('vault');

    bgChild = spawn(TSX, [CLI, 'analyze', '--force', '--yes', root], { stdio: 'ignore' });

    // Poll status while the background analyze is still holding the vault, looking for a read
    // that landed mid-pulse.
    let sawSnapshotRead: any = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && bgChild.exitCode === null && !sawSnapshotRead) {
      try {
        const s = statusJson();
        if (s.staleness.servedFrom === 'previous-pulse-snapshot') {
          sawSnapshotRead = s;
        }
      } catch {
        // A read that lands before the vault directory even exists is not the case under test.
      }
    }

    await new Promise<void>((resolve) => {
      if (!bgChild || bgChild.exitCode !== null) return resolve();
      bgChild.once('close', () => resolve());
    });

    // The read caught mid-pulse names the PREVIOUS pulse and says where it came from — without
    // this, staleness is real but invisible, exactly what ADR 0040 calls out.
    expect(sawSnapshotRead).not.toBeNull();
    expect(sawSnapshotRead.staleness.pulseId).toBe(seededPulseId);
    expect(sawSnapshotRead.staleness.servedFrom).toBe('previous-pulse-snapshot');

    // Once the writer has closed, the snapshot is gone and the NEW pulse answers from the vault.
    const after = statusJson();
    expect(after.staleness.servedFrom).toBe('vault');
    expect(after.staleness.pulseId).not.toBe(seededPulseId);
  }, 120000);
});

/**
 * A vault reader/writer in a SEPARATE PROCESS, for the concurrency tests.
 *
 * In-process opens cannot prove anything about DuckDB's file lock: MEASURED, a second READ_WRITE
 * open of the same path inside one process is GRANTED, because DuckDB serves it from its instance
 * cache and never reaches the lock. Every assertion about "a reader arriving during a pulse" is
 * therefore only meaningful across processes, which is what this script exists for.
 *
 * Run with `npx tsx tests/helpers/vault-probe.ts <mode> <root> [signalFile]`. It prints one
 * `KEY=value` line per fact so the parent can parse it without a protocol.
 */
import fs from 'node:fs';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

const [, , mode, root, signal] = process.argv;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(file: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function main(): Promise<void> {
  if (mode === 'read') {
    // What an agent's read command does: open read-only and ask a question.
    const p = new SynapsePersistence(root, true);
    const rows = await p.query<{ c: number }>('SELECT count(*)::INT AS c FROM nodes');
    const pulse = await p.currentPulse();
    console.log(`COUNT=${rows[0].c}`);
    console.log(`FROM_SNAPSHOT=${p.servedFromSnapshot()}`);
    console.log(`PULSE=${pulse?.id ?? 'none'}`);
    await p.close();
    return;
  }

  if (mode === 'pulse') {
    // A write session that holds the vault for as long as a real analyze would, so the parent can
    // fire a read at it while the lock is held.
    const p = new SynapsePersistence(root, false);
    await p.beginPulse();
    await p.run(`INSERT INTO nodes (id, pulseId, name, file, canonicalKind)
                 SELECT 'mid'||i, 'pulse-mid', 'mid'||i, '/repo/mid.ts', 'UNIT' FROM range(11) t(i)`);
    fs.writeFileSync(`${signal}.holding`, 'x');   // the vault is now locked by this process
    await waitFor(signal);                        // parent has finished its read
    // The smallest thing save() reads off a graph: a target pulse id, a metadata map and stats.
    const meta = new Map<string, string>([['lastAnalyzedCommit', 'abc123']]);
    await p.save({
      getMetadata: (k: string) => (k === 'targetPulseId' ? 'pulse-mid' : meta.get(k)),
      getAllMetadata: () => meta,
      stats: { nodeCount: 511, edgeCount: 0 },
    });
    await p.close();
    console.log('PULSE_DONE');
    return;
  }

  if (mode === 'seed') {
    // Build a vault with rows, in its own process, so no in-process instance cache is left behind
    // to make a later lock test meaningless.
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    await p.run(`INSERT INTO nodes (id, pulseId, name, file, canonicalKind)
                 SELECT 'n'||i, 'pulse-seed', 'sym'||i, '/repo/f.ts', 'UNIT' FROM range(500) t(i)`);
    await p.run(`INSERT OR REPLACE INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
                 VALUES ('pulse-seed', 1000, 'abc123', 'main', 500, 0, '{}')`);
    await p.run('CHECKPOINT');
    await p.close();
    console.log('SEEDED');
    return;
  }

  throw new Error(`unknown mode ${mode}`);
}

main().catch((e) => { console.log(`ERROR=${String(e.message).split('\n')[0]}`); process.exit(9); });

import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { DuckDBInstance } from '@duckdb/node-api';

/**
 * Two callers reaching a CLOSED handle at once must share one open (state-machine audit P-01-1).
 *
 * `ensureVaultOpen` was check-then-act: both callers saw `db === null`, both created a DuckDB
 * instance, and the second assignment orphaned the first — whose file lock `close()` could then no
 * longer release, so every other process met a locked vault until this one exited. The MCP server
 * reaches exactly this state: it closes the vault after every call and pipelined calls reopen it.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

/** Can ANOTHER process open the vault for writing right now? */
function writableElsewhere(root: string): boolean {
  const db = path.join(root, '.conducks', 'conducks-synapse.db');
  const script = `import { DuckDBInstance } from '@duckdb/node-api';
    try { const i = await DuckDBInstance.create(${JSON.stringify(db)}); await i.connect(); console.log('OPEN'); } catch (e) { console.log('LOCKED'); }`;
  return execFileSync('node', ['--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8' }).includes('OPEN');
}

describe('a closed vault reopened by two callers at once', () => {
  it('opens once, so close() releases the file for other processes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-first-open-'));
    roots.push(root);
    const seed = new SynapsePersistence(root, false);
    await seed.query('SELECT 1');
    await seed.close();

    const p = new SynapsePersistence(root, false);
    const realCreate = DuckDBInstance.create.bind(DuckDBInstance);
    let creates = 0;
    (DuckDBInstance as any).create = (...a: any[]) => { creates++; return (realCreate as any)(...a); };
    const results = await Promise.allSettled([p.query('SELECT 1 AS x'), p.query('SELECT 2 AS x'), p.query('SELECT 3 AS x')]);
    await p.close();
    (DuckDBInstance as any).create = realCreate;

    expect(creates).toBe(1);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(writableElsewhere(root)).toBe(true);
  }, 60000);
});

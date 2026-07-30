import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * todo24#P3 — the pulse is checked by what it WROTE, not by what it ran.
 *
 * This is the test that would have caught the whole class. Three features — cross-service binding,
 * virtual library induction and pulse circuits — computed correct results and persisted none of
 * them, on every project, for as long as they existed. 660 tests passed throughout, because the
 * suite asserts that a stage RAN, and every one of those stages ran.
 *
 * So this runs one real analyze over a fixture that exercises every writer, and then counts rows
 * per table. A stage that silently stops writing fails here even if its own unit test still passes
 * and its log line still claims success — which is exactly what each of the three did.
 *
 * The fixture is deliberately small but broad: two files so there are imports and cross-file calls,
 * an external reference so induction has something to induce, a handover so bindPulseCircuits has
 * something to bind, and two commits so node_history has two pulses to compare.
 */
describe('a pulse writes to every table it claims to', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('pulsewrites');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/a.ts', `
import path from 'node:path';
export function where(p: string): string {
  return path.resolve(process.cwd(), p);
}
export function produce(): number { return 1; }
`);
    writeFile(repo, 'src/b.ts', `
import { where, produce } from './a.js';
export function consume(v: number): number { return v + 1; }
export function main(): string {
  const value = produce();
  consume(value);
  return where('x');
}
`);
    commit(repo, 'first');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    // A second pulse, so node_history has something to compare and drift can reach a verdict.
    writeFile(repo, 'src/c.ts', `export function extra(): number { return 2; }`);
    commit(repo, 'second');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  const count = async (sql: string): Promise<number> => {
    const [row] = await vault.query<{ c: number }>(`SELECT count(*)::INT AS c FROM ${sql}`);
    return Number(row.c);
  };

  it('writes rows to every table the pulse touches', async () => {
    expect(await count('nodes')).toBeGreaterThan(0);
    expect(await count('edges')).toBeGreaterThan(0);
    expect(await count('pulses')).toBe(2);
    expect(await count('file_hashes')).toBeGreaterThan(0);
    expect(await count('metadata')).toBeGreaterThan(0);
    // node_history is what makes drift answerable at all; it was empty on every vault written
    // before the table existed, and nothing would have noticed if it silently stopped filling.
    expect(await count('node_history')).toBeGreaterThan(0);
  });

  it('records a history snapshot for BOTH pulses, not just the last', async () => {
    const rows = await vault.query<{ pulseId: string }>(
      'SELECT DISTINCT pulseId FROM node_history');
    expect(rows.length).toBe(2);
  });

  it('persists what the binders build after the final flush', async () => {
    // Each of these was zero on every vault while its stage logged success.
    expect(await count("nodes WHERE id LIKE 'lib::%'")).toBeGreaterThan(0);
    expect(await count("edges WHERE type = 'PULSES_TO'")).toBeGreaterThan(0);
  });

  it('leaves no edge pointing at a node that does not exist', async () => {
    const dangling = await count(
      'edges e LEFT JOIN nodes n ON e.targetId = n.id WHERE n.id IS NULL');
    expect(dangling).toBe(0);
  });

  it('leaves no row from an earlier pulse behind', async () => {
    // ADR 0050. Two pulses ran in setup; after the second, every row must carry it. `pulseId` means
    // LAST seen, which is only true because induction re-stamps the virtual nodes it would otherwise
    // skip — without that, this sweep deletes every still-valid external symbol.
    const [{ c }] = await vault.query<{ c: number }>(
      'SELECT count(DISTINCT pulseId)::INT AS c FROM nodes');
    expect(Number(c)).toBe(1);
  });

  it('keeps the induced library nodes across a second pulse', async () => {
    // The regression this test caught while ADR 0050 was being built: a `lib::<namespace>` node is
    // never an edge TARGET, so a re-stamp driven by edge traversal never reaches it and the sweep
    // deleted both on pulse two.
    const [{ c }] = await vault.query<{ c: number }>(
      "SELECT count(*)::INT AS c FROM nodes WHERE id LIKE 'lib::%'");
    expect(Number(c)).toBeGreaterThan(0);
  });

  it('gives every handover edge two real endpoints', async () => {
    // ADR 0051. The source used to be the VARIABLE NAME, which is not a node id, so 199 of these
    // pointed from something the graph did not contain — invisible to `audit`, whose orphan check
    // reads targets only.
    const dangling = await count(
      `edges e LEFT JOIN nodes n ON e.sourceId = n.id WHERE e.type = 'PULSES_TO' AND n.id IS NULL`);
    expect(dangling).toBe(0);
  });

  it('prices its guesses — confidence spans more than one value', async () => {
    const [row] = await vault.query<{ c: number }>(
      'SELECT count(DISTINCT confidence)::INT AS c FROM edges');
    // A single distinct confidence across the whole table is the signature of the bug ADR 0046
    // fixed: a constant per edge type, recording which rule fired rather than how far to trust it.
    expect(Number(row.c)).toBeGreaterThan(1);
  });
});

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Virtual library induction (todo24#P4).
 *
 * `induceVirtualLibraries` walks every edge whose target has no node — calls into the standard
 * library, into npm packages, into globals — and materialises a node for each so the edge lands
 * somewhere. It ran on every pulse, logged "Resonated with 2,691 virtual ecosystem symbols", and
 * persisted NOTHING: it runs after the last wave flush, and the pulse's final `save()` writes no
 * node rows. `SELECT count(*) FROM nodes WHERE id LIKE 'lib::%'` returned 0 on every vault.
 *
 * The cost was measured: 6,808 of 13,418 edges in this project's own vault — 51% — pointed at a
 * target with no node, and the targets were exactly `global::process`, `path.resolve`, `db.all`.
 *
 * THIS TEST QUERIES THE VAULT DIRECTLY, and that is the point of it. A first version asserted
 * against `audit` and `query` output and passed against the unfixed build — the CLI surfaces were
 * not sensitive to whether the rows existed, which is the same blindness that let the bug live.
 * Counting rows is the only assertion that could have failed. Verified: against a build with the
 * persist call removed this reports 0 virtual nodes and 4 dangling edges, and both cases go red.
 */
describe('Virtual library induction', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('virtualinduction');
    // The external reference kinds the inducer recognises: a node builtin, a global, and a bare
    // unresolved symbol.
    writeFile(repo, 'src/a.ts', `
import path from 'node:path';
export function where(p: string): string {
  console.log('resolving');
  return path.resolve(process.cwd(), p);
}
`);
    writeFile(repo, 'src/b.ts', `
import { where } from './a.js';
export function run(): void { console.error(where('x')); }
`);
    commit(repo, 'external references');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  it('writes the induced library nodes to the vault, not just to memory', async () => {
    const [row] = await vault.query<{ c: number }>(
      "SELECT count(*)::INT AS c FROM nodes WHERE id LIKE 'lib::%'");
    expect(Number(row.c)).toBeGreaterThan(0);
  });

  it('leaves no edge pointing at a node that does not exist', async () => {
    // Sanity first: a graph was actually produced, so a zero below means "absorbed", not "empty".
    const [total] = await vault.query<{ c: number }>("SELECT count(*)::INT AS c FROM edges");
    expect(Number(total.c)).toBeGreaterThan(0);

    const [dangling] = await vault.query<{ c: number }>(
      `SELECT count(*)::INT AS c FROM edges e
       LEFT JOIN nodes n ON e.targetId = n.id
       WHERE n.id IS NULL`);
    expect(Number(dangling.c)).toBe(0);
  });
});

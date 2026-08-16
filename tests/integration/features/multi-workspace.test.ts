import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Multi-workspace domain: cross-project linking (FederatedLinker,
// src/lib/core/graph/linker-federated.ts). No MCP tool exists for this — MCP is read-only by
// design (CONDUCKS-8) and linking writes `.conducks/links.json`, so it was always meant to be
// CLI-only, same as `setup`.
//
// This suite was written against a production bug, now FIXED: `conducks link` was unreachable.
// index.ts imported `LinkCommand` and the `commands: ConducksCommand[]` array never instantiated
// it, so `commands.find(c => c.id === commandId)` never found "link" and every invocation exited
// with `Unknown command "link"`. `conducks help` omitted it for the same reason. The fix was the
// missing `new LinkCommand()`, landed 2026-07-27.
//
// The suite still proves two separate things, deliberately kept apart:
//  1. That the command REACHES the real CLI entry point (the first test below) — it pins the
//     wiring, so deleting the registration line makes it fail again.
//  2. That the underlying domain logic (FederatedLinker) works when driven directly in a child
//     process (same isolation pattern as tests/unit/core/languages/java-extraction.test.ts). That
//     separation is what proved the original defect was one missing line and not a deeper one.
describe('Multi-workspace domain integration (link)', () => {
  let host: string;
  let neighbor: string;
  let unanalyzed: string;

  beforeAll(() => {
    ensureBuild();
    host = mkGitRepo('mw-host');
    writeFile(host, 'src/index.ts', `export const hostMarker = 1;`);
    commit(host, 'init host');
    runCli(['analyze', '--yes'], { cwd: host });

    neighbor = mkGitRepo('mw-neighbor');
    writeFile(neighbor, 'src/index.ts', `export const neighborMarker = 1;`);
    commit(neighbor, 'init neighbor');
    runCli(['analyze', '--yes'], { cwd: neighbor });

    // A real repo that was never pulsed — no .conducks vault. Used for the failure-path proof below.
    unanalyzed = mkGitRepo('mw-unanalyzed');
    writeFile(unanalyzed, 'src/index.ts', `export const x = 1;`);
    commit(unanalyzed, 'init unanalyzed');
  });

  afterAll(() => {
    rmRepo(host);
    rmRepo(neighbor);
    rmRepo(unanalyzed);
  });

  // Written first as a bug pin: `LinkCommand` was imported and never instantiated, so the command
  // answered `Unknown command "link"` while FederatedLinker underneath worked. Now inverted to pin
  // the FIX. A test that asserts a bug still exists fails the moment someone repairs it, which
  // reads as a regression and is the opposite of what a regression test is for.
  it('conducks link reaches the real CLI entry point', () => {
    const { combined } = runCli(['link', neighbor], { cwd: host, allowFail: true });
    expect(combined).not.toContain('Unknown command "link"');
  });

  it('the underlying FederatedLinker DOES work when driven directly — proves this is a wiring bug, not a logic bug', () => {
    const CHILD = `
(async () => {
  const { FederatedLinker } = await import('./src/lib/core/graph/linker-federated.ts');
  const { ConducksAdjacencyList } = await import('./src/lib/core/graph/adjacency-list.ts');
  const { SynapsePersistence } = await import('./src/lib/core/persistence/persistence.ts');
  // The opener is INJECTED: the linker no longer imports persistence itself, because persistence
  // imports the graph door and the door re-exports this file (todo73, rule 5b). No backticks in
  // this comment on purpose -- it lives inside a template literal, and one would close it.
  const linker = new FederatedLinker(process.argv[1], undefined, (p) => new SynapsePersistence(p, true));
  const results = { errors: [] };

  // 1. Link a real, analyzed neighbor.
  await linker.link(process.argv[2]);
  results.linksAfterGood = await linker.getLinks();

  // 2. Reject a real repo with no vault.
  try {
    await linker.link(process.argv[3]);
    results.rejectedBadLink = false;
  } catch (err) {
    results.rejectedBadLink = true;
    results.rejectMessage = String(err.message || err);
  }

  // 3. Idempotent re-link.
  await linker.link(process.argv[2]);
  results.linksAfterDuplicate = await linker.getLinks();

  // 4. Hydrate a fresh graph from the linked neighbor's real persisted vault.
  const graph = new ConducksAdjacencyList();
  const before = graph.stats.nodeCount;
  await linker.hydrate(graph);
  results.nodeCountBefore = before;
  results.nodeCountAfter = graph.stats.nodeCount;

  console.log('__RESULT__' + JSON.stringify(results));
})().catch(err => { console.error(err); process.exit(1); });
`;
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, host, neighbor, unanalyzed], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find(l => l.includes('__RESULT__'));
    const result = JSON.parse(line!.replace('__RESULT__', ''));

    expect(result.linksAfterGood.some((l: string) => l === path.resolve(neighbor))).toBe(true);
    expect(result.rejectedBadLink).toBe(true);
    expect(result.rejectMessage.toLowerCase()).toContain('not a valid conducks project');
    // Idempotent: linking the same neighbor again must not duplicate the entry.
    expect(result.linksAfterDuplicate.filter((l: string) => l === path.resolve(neighbor)).length).toBe(1);
    // Hydration pulled real nodes from the neighbor's real persisted vault into a fresh graph.
    expect(result.nodeCountAfter).toBeGreaterThan(result.nodeCountBefore);

    // And the link file really is on disk, in the host's own .conducks/ dir.
    const linksPath = path.join(host, '.conducks', 'links.json');
    expect(fs.existsSync(linksPath)).toBe(true);
  });
});

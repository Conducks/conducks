import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * THE MIRROR RULE (ADR 0148): the CLI and the MCP tools answer the same question the same way,
 * differing only in rendering. A path is not rendering — it is the answer.
 *
 * The case repair landed on the CLI side alone, and that is precisely the drift the rule exists to
 * prevent. MEASURED against a live MCP server on the sofie subject: `conducks_prune` returned
 * `renderer/src/components/sessionhistorypanel.tsx` while `conducks prune --json` returned
 * `renderer/src/components/SessionHistoryPanel.tsx` — for the same finding, from the same vault. The
 * MCP surface is the one an agent acts on, so it was the half that mattered most.
 *
 * The rule now lives in `contracts/real-path.ts`, which is the only layer both interfaces may import.
 */
describe('the CLI and the MCP tools name the same file the same way', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('surface-parity');
    // A CamelCase file whose export nothing consumes — so `prune` has a finding to name, and the
    // name it uses must be a path that opens.
    writeFile(repo, 'src/UseWorkGraph.ts', `
export function neverConsumed(): number { return 1; }
export function usedHere(): number { return 2; }
`);
    writeFile(repo, 'src/Main.ts', `
import { usedHere } from './UseWorkGraph.js';
export function boot(): number { return usedHere(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('cli prune names a path that exists on disk, in its real case', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(fs.existsSync(f.file)).toBe(true);
    expect(findings.some((f: any) => String(f.file).includes('UseWorkGraph.ts'))).toBe(true);
  }, 180000);
});

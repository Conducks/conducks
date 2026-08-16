import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";

/**
 * Variable handover — PULSES_TO (todo24#P4).
 *
 * `bindPulseCircuits` links the producer of a value to the call that consumes it. The vault held
 * ZERO of these edges on every project, and there were two independent causes, either of which was
 * enough on its own:
 *
 *   1. The edges were only added to the in-memory graph. Like every binder it runs after the last
 *      wave flush, and the pulse's final save() writes no edge rows, so they were discarded on
 *      every pulse. `bindResonance` already collected its edges for the caller to persist;
 *      `bindPulseCircuits` did not.
 *   2. The TypeScript query captured assignments only from `assignment_expression` — a
 *      REassignment. A const declaration with a call value, which is how a handover is almost
 *      always written in TS/JS, produced no capture at all, so the binder had nothing to bind.
 *
 * The fixture uses the CONST form deliberately. A test written with a reassignment passes with
 * cause 2 still present, and that is the form real code rarely takes.
 */
describe('Variable handover binding', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('pulsehandover');
    writeFile(repo, 'src/flow.ts', `
export function produce(): number { return 1; }
export function consume(v: number): number { return v + 1; }
export function main(): number {
  const value = produce();
  return consume(value);
}
`);
    commit(repo, 'a handover');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  it('persists the handover edge, from a const declaration', async () => {
    const rows = await vault.query<{ targetId: string; properties: string }>(
      "SELECT targetId, properties FROM edges WHERE type = 'PULSES_TO'");
    expect(rows.length).toBeGreaterThan(0);
    // The edge must reach the CONSUMER, and name the variable it carried — an edge that exists but
    // points somewhere arbitrary would satisfy a bare count.
    expect(rows.some(r => r.targetId.endsWith('::consume'))).toBe(true);
    expect(rows.some(r => String(r.properties).includes('value'))).toBe(true);
  });
});

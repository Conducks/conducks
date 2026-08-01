import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * A handover belongs to the SCOPE it happens in — PULSES_TO scoping (todo25#P13, ADR 0059's open
 * question).
 *
 * `bindPulseCircuits` ran the edge from the producing call's target to the consuming call's target
 * (ADR 0051, unchanged and deliberately kept). What it never recorded was WHERE the handover
 * happened. On this repository 124 of 238 of these edges have a library symbol at both ends, so the
 * only readable form of the edge was the global claim "path.resolve feeds path.dirname" — a
 * statement about node's `path` module rather than about the code being analysed.
 *
 * The scope was in the id, but only by accident: the id was built from `call.id`, and a CALLS edge's
 * id happens to embed its source. Smuggled through another edge's id format, it was queryable by
 * nothing.
 *
 * The fixture is TWO functions performing the IDENTICAL handover — same producer, same consumer,
 * same variable name. Everything about them is the same EXCEPT the scope, so the only thing that can
 * tell the two edges apart is the thing this record adds. A fixture with one caller passes whether
 * or not the scope is recorded.
 */
describe('Handover scoping', () => {
  let repo: string;
  let vault: SynapsePersistence;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('pulsescope');
    // `const` form on purpose — a reassignment is not how a handover is written in real TS, and the
    // query capture for it was cause 2 in pulse-handover.test.ts.
    writeFile(repo, 'src/flow.ts', `
export function produce(): number { return 1; }
export function consume(v: number): number { return v + 1; }
export function alpha(): number {
  const value = produce();
  return consume(value);
}
export function beta(): number {
  const value = produce();
  return consume(value);
}
`);
    commit(repo, 'the same handover in two scopes');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    vault = new SynapsePersistence(repo, true);
  });

  afterAll(async () => {
    await vault.close();
    rmRepo(repo);
  });

  const handovers = async () => vault.query<{ id: string; sourceId: string; targetId: string; properties: string }>(
    `SELECT id, sourceId, targetId, properties FROM edges
     WHERE type = 'PULSES_TO' AND targetId LIKE '%::consume'`);

  it('records the enclosing scope, so the same handover in two functions is two edges', async () => {
    const rows = await handovers();
    // Endpoints first: ADR 0051's shape must survive this change untouched.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.sourceId.endsWith('::produce'))).toBe(true);

    const scopes = rows.map(r => JSON.parse(String(r.properties)).scope as string);
    // Not `toBeDefined()` on one row — the point is that the two edges disagree about the scope
    // while agreeing about everything else.
    expect(new Set(scopes).size).toBe(2);
    expect(scopes.some(s => typeof s === 'string' && s.endsWith('::alpha'))).toBe(true);
    expect(scopes.some(s => typeof s === 'string' && s.endsWith('::beta'))).toBe(true);
  });

  it('scopes to a real node id, not to a name', async () => {
    // ADR 0051 refused a handover endpoint that was a bare variable name because nothing in `nodes`
    // is keyed by it. The scope is not an endpoint, but it is an id, and an id that resolves to
    // nothing is the same lie in a different column.
    const rows = await handovers();
    const scopes = Array.from(new Set(rows.map(r => JSON.parse(String(r.properties)).scope as string)));
    expect(scopes.length).toBeGreaterThan(0);

    for (const scope of scopes) {
      const [hit] = await vault.query<{ n: number }>(
        `SELECT count(*)::INT AS n FROM nodes WHERE id = ?`, [scope]);
      expect({ scope, found: hit.n }).toEqual({ scope, found: 1 });
    }
  });

  it('states the scope in the edge id rather than inheriting it from another edge', async () => {
    // The id used to be `PULSE::<producer>-><CALLS edge id>`, which carried the scope only because
    // a CALLS edge id embeds its source. Building it from `node.id` directly is what stops the
    // scoping from depending on another edge type's id format — and drops a real defect with it:
    // the linkers rebind a call's TARGET without rewriting its ID, so the borrowed segment could
    // name a symbol the call no longer pointed at.
    const rows = await handovers();
    for (const r of rows) {
      const scope = JSON.parse(String(r.properties)).scope as string;
      expect(r.id.includes(scope)).toBe(true);
      // The consumer segment is the LIVE target, not a segment copied from the call's id.
      expect(r.id.endsWith(r.targetId)).toBe(true);
    }
  });
});

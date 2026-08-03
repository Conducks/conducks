import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Evolution domain. STALE NAME: the todo names `conducks_evolution` — no MCP tool by that name
// exists (grep of src/interfaces/tools/tools/*.ts confirms it). The real evolution capability is
// registry.evolution (EvolutionService: rename/GVR, compare/drift, audit/archeology), reachable via
// the MCP surface split across `conducks_diff` (mode="drift") and `conducks_audit`
// (mode="archeology"), and via the CLI `drift`/`audit --history`/`rename` commands directly. This
// suite drives the CLI form of all three.
//
// PRODUCTION BUG FOUND (reported, not fixed — src/ is out of this agent's scope):
// `conducks drift` and `conducks audit --history` are BOTH structurally incapable of ever
// detecting real drift, on the current persistence schema.
//   - src/lib/core/persistence/persistence.ts:128 declares `nodes.id VARCHAR PRIMARY KEY`, and
//     saveNodes() (:268, `INSERT OR REPLACE INTO nodes`) upserts by id — the table holds exactly
//     ONE row per node id at all times: the row from whichever pulse touched it LAST. No historical
//     per-pulse snapshot survives a later pulse.
//   - DriftEngine.compare() (src/lib/domain/evolution/drift-engine.ts:39-48) self-joins that same
//     table: `nodes c JOIN nodes p ON c.id = p.id AND c.pulseId != p.pulseId`. Since every id has
//     exactly one row, no row can ever join to a "previous version of itself with a different
//     pulseId" — the join is structurally unsatisfiable. `exactRows` is always empty, so `drift`
//     always reports "Structural resonance stable across 0 symbols" no matter what changed.
//   - AuditService.audit() (src/lib/domain/evolution/audit-service.ts:27-34) has the identical root
//     cause: `node_history` joins `nodes n` (one row per id) to `pulse_history`, then computes
//     `LAG(...) OVER (PARTITION BY n.id ORDER BY p.timestamp)` — each partition has exactly one row,
//     so LAG is always NULL, `WHERE prev_gravity IS NOT NULL` drops every row, and `audit --history`
//     always reports "Insufficient historical data" regardless of real decay.
// Verified live below: 2 real, genuinely distinct pulses (added branching + a brand-new function)
// still produce "Total Symbols: 0" from `drift` and zero hotspots from `audit --history`. Both
// features are dead on arrival for any project using this schema. Secondary bug: AuditService
// never returns status:'INSUFFICIENT_DATA' (only 'STABLE') even though its own AuditResult type
// declares that status, so the CLI's dedicated branch for it (audit.ts:30) is unreachable.
describe('Evolution domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('evolution');
    writeFile(repo, 'src/calc.ts', `
export function add(a: number, b: number): number {
  return a + b;
}
`);
    commit(repo, 'init');
  });

  afterAll(() => rmRepo(repo));

  /**
   * `allowFail` and the status assertion are NEW (ADR 0127). This case exits non-zero now: a single
   * pulse means no comparison was made, and "no verdict reached" at exit 0 is indistinguishable from
   * "stable" to anything reading the status. The MESSAGE assertion is unchanged, which is what this
   * test was always about — the exit code is an added claim, not a replaced one.
   */
  it('drift reports insufficient data before a second pulse exists', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const { combined, status } = runCli(['drift'], { cwd: repo, allowFail: true });
    expect(combined).toContain('Insufficient historical data');
    expect(status).not.toBe(0);
  });

  it('drift compares two real pulses and names the symbol that decayed', () => {
    writeFile(repo, 'src/calc.ts', `
export function add(a: number, b: number): number {
  if (a < 0) { if (b < 0) { return -(a + b); } else { return b - a; } }
  return a + b;
}
export function subtract(a: number, b: number): number { return add(a, -b); }
`);
    commit(repo, 'add branching + new symbol');
    runCli(['analyze', '--yes'], { cwd: repo });

    const { combined } = runCli(['drift'], { cwd: repo });
    // Symbols are actually COMPARED now — `node_history` records one row per symbol per pulse, so
    // the join has something to match. This used to be 0 for every project forever, because both
    // queries read `nodes`, which holds exactly one row per id.
    const totalSymbolsLine = combined.match(/Total Symbols:\s*(\d+)/);
    expect(totalSymbolsLine).not.toBeNull();
    expect(Number(totalSymbolsLine![1])).toBeGreaterThan(0);
    // `add` gained nested branching between the two pulses, so it must be the one reported as
    // decaying — a count alone would pass on any noise. The count is colour-wrapped in the CLI
    // output, so the escape sequence has to be skipped; `Total Symbols` above is not.
    const decaying = combined.match(/Decaying:\s*(?:\u001b\[[0-9;]*m)?(\d+)/);
    expect(decaying).not.toBeNull();
    expect(Number(decaying![1])).toBeGreaterThan(0);
    expect(combined).toContain('add');
    // And the wording must agree with the finding: it used to print "resonance stable" beside a
    // list of decay hotspots.
    expect(combined).toContain('Structural decay in');
    expect(combined).not.toContain('resonance stable');
  });

  it('audit --history finds the decaying symbol across pulses', () => {
    // The LAG window used to partition `nodes` by id, and `nodes.id` is a PRIMARY KEY — one row per
    // partition, so LAG was always NULL and every row was dropped. It reads `node_history` now.
    const { combined } = runCli(['audit', '--history=5'], { cwd: repo });
    expect(combined).toContain('Longitudinal Hotspots');
    expect(combined).toContain('add');
    expect(combined).not.toContain('No consistent structural decay patterns found');
  });

  it('rename (GVR) dry-run reports the real file that would change, without writing it', () => {
    const rows = JSON.parse(
      runCli(['query', 'add', '--mode', 'template', '--template', 'find_by_name', '--json'], { cwd: repo }).stdout
    );
    const addId = rows.find((r: any) => r.name === 'add').id;

    const before = readFileSync(`${repo}/src/calc.ts`, 'utf-8');
    const { combined, status } = runCli(['rename', addId, 'addNumbers'], { cwd: repo });
    const after = readFileSync(`${repo}/src/calc.ts`, 'utf-8');

    expect(status).toBe(0);
    expect(combined).toContain('DRY RUN');
    expect(combined).toContain('calc.ts');
    // Dry run must not touch the file on disk — this is the assertion that can fail.
    expect(after).toBe(before);
  });

  it('rename with --confirm actually writes the new name to disk (proves dry-run vs confirm are different code paths)', () => {
    const rows = JSON.parse(
      runCli(['query', 'add', '--mode', 'template', '--template', 'find_by_name', '--json'], { cwd: repo }).stdout
    );
    const addId = rows.find((r: any) => r.name === 'add').id;

    runCli(['rename', addId, 'plusNumbers', '--confirm'], { cwd: repo, allowFail: true });
    const after = readFileSync(`${repo}/src/calc.ts`, 'utf-8');
    expect(after).toContain('plusNumbers');
  });
});

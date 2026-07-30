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

  it('drift reports insufficient data before a second pulse exists', () => {
    runCli(['analyze', '--yes'], { cwd: repo });
    const { combined } = runCli(['drift'], { cwd: repo });
    expect(combined).toContain('Insufficient historical data');
  });

  it('BUG: drift still reports zero symbols after a real, distinct second pulse with genuine structural change', () => {
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
    // The count is still 0 — the schema genuinely records no per-symbol history — but the command
    // must no longer present that as a clean result. It used to print
    // `STABLE — Structural resonance stable across 0 symbols`, which reads as "checked everything,
    // nothing drifted" when nothing was checked. It now says the data does not exist.
    expect(combined).toContain('Drift cannot be computed');
    expect(combined).not.toContain('resonance stable');
    const totalSymbolsLine = combined.match(/Total Symbols:\s*(\d+)/);
    expect(Number(totalSymbolsLine![1])).toBe(0);
  });

  it('audit --history says the history is missing rather than reporting a clean bill of health', () => {
    // `AuditService` used to return status 'STABLE' when its LAG query yielded no rows, so the CLI's
    // dedicated insufficient-data branch (src/interfaces/cli/commands/audit.ts:30) was unreachable
    // and users saw "no consistent structural decay" — a clean bill of health from a check that
    // examined nothing. It now returns the INSUFFICIENT_DATA its own type always declared.
    const { combined } = runCli(['audit', '--history=5'], { cwd: repo });
    expect(combined).toContain('Historical audit cannot be computed');
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

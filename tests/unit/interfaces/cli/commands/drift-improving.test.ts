/**
 * F-06b: `drift` printed `Improving: N` (142 on scraper, 393 on sofie) with no per-symbol listing
 * anywhere — the only listing branch was decay-only (`velocity > 0.01`). The count was real but
 * unfalsifiable.
 *
 * Fix: a mirrored "Top Improving Symbols" block (`velocity < -0.01`, most-improving first), and an
 * explicit `improving` array on `--json` derived from the FULL delta list rather than the
 * already-truncated `deltas` field (which is capped to 10 in arrival order).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { DriftCommand } from '@/interfaces/cli/commands/drift.js';

function fakeRegistry(result: any): any {
  return {
    evolution: { compare: async () => result },
    infrastructure: { persistence: { close: async () => {} } },
  };
}

function delta(name: string, velocity: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `src/${name}.ts::${name}`,
    name,
    file: `src/${name}.ts`,
    gravity_delta: velocity,
    complexity_delta: 0,
    isModified: false,
    identityGap: false,
    velocity,
    ...overrides,
  };
}

describe('drift: Top Improving Symbols', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('lists improving symbols by name, most-improving first — not just a count', async () => {
    const result = {
      status: 'STABLE',
      message: 'Structural resonance stable across 3 symbols.',
      summary: { total_symbols: 3, decay_count: 0, improvement_count: 2, move_count: 0 },
      deltas: [delta('barelyImproving', -0.02), delta('bigImprover', -0.5), delta('unchanged', 0.001)],
      moves: [],
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await new DriftCommand().execute([], fakeRegistry(result));

    const printed = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(printed).toContain('Top Improving Symbols');
    const bigIdx = printed.indexOf('bigImprover');
    const barelyIdx = printed.indexOf('barelyImproving');
    expect(bigIdx).toBeGreaterThan(-1);
    expect(barelyIdx).toBeGreaterThan(-1);
    expect(bigIdx).toBeLessThan(barelyIdx); // most negative velocity (most improving) printed first
    expect(printed).not.toContain('unchanged'); // below the |0.01| threshold, not listed anywhere
  });

  it('prints NO "Top Improving Symbols" heading when nothing improved (no fabricated empty section)', async () => {
    const result = {
      status: 'DECAYING',
      message: 'Structural decay in 1 of 2 symbols compared.',
      summary: { total_symbols: 2, decay_count: 1, improvement_count: 0, move_count: 0 },
      deltas: [delta('decayer', 0.5), delta('flat', 0.002)],
      moves: [],
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await new DriftCommand().execute([], fakeRegistry(result));

    const printed = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(printed).not.toContain('Top Improving Symbols');
    expect(printed).toContain('Top Structural Decay Hotspots');
  });

  it('--json: `improving` is derived from the full delta list, not the LIMIT-truncated `deltas` field', async () => {
    // 12 improving symbols in ARRIVAL order such that the biggest improver is NOT in the first 10 —
    // if `improving` were sliced from the already-truncated `deltas` (LIMIT=10, arrival order) it
    // would miss the true top improver entirely.
    const arrivalOrderDeltas = Array.from({ length: 12 }, (_, i) => delta(`sym${i}`, -0.02));
    arrivalOrderDeltas.push(delta('trueTopImprover', -0.9));
    const result = {
      status: 'STABLE',
      message: 'Structural resonance stable across 13 symbols.',
      summary: { total_symbols: 13, decay_count: 0, improvement_count: 13, move_count: 0 },
      deltas: arrivalOrderDeltas,
      moves: [],
    };

    let written = '';
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      written += chunk;
      return true;
    });

    await new DriftCommand().execute(['--json'], fakeRegistry(result));
    writeSpy.mockRestore();

    const parsed = JSON.parse(written);
    expect(Array.isArray(parsed.improving)).toBe(true);
    expect(parsed.improving[0].name).toBe('trueTopImprover');
    // `deltas` stays LIMIT-truncated as before; `improving` is the new, separately-derived field.
    expect(parsed.deltas.length).toBe(10);
    expect(parsed.truncated).toBe(true);
  });
});

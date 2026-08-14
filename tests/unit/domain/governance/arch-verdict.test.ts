import { describe, it, expect } from '@jest/globals';
import { decide } from '@/lib/domain/governance/arch-verdict.js';
import type { ArchMeasurements } from '@/lib/domain/governance/arch-detect.js';

/**
 * todo41#P3 — the decision table. Names come FROM measurements, never around them.
 *
 * The honesty cases are the point: a repository matching nothing gets "no pattern, here is the
 * shape" rather than the nearest label, and a shape matching two patterns reports both. Electron's
 * main/preload/renderer (the frozen subject-c subject) is exactly the input where forcing "hexagonal"
 * would be the confident-wrong answer this project keeps removing.
 */
const base = (over: Partial<ArchMeasurements>): ArchMeasurements => ({
  adapters: [],
  compositionRoot: null,
  layerEdges: [],
  shape: { perCluster: [], hubShare: 0, busiest: null, density: 0 },
  bidirectional: [],
  unitCount: 100,
  ...over,
});

const door = (file: string) => ({ id: file, file, role: 'driving' as const, reason: 'test' });

describe('the architecture decision table', () => {
  it('names hexagonal at HIGH only with direct convergence and one-way flow', () => {
    const r = decide(base({
      adapters: [door('/r/src/interfaces/cli/index.ts'), door('/r/src/interfaces/web/mirror.ts')],
      compositionRoot: { id: '/r/src/registry/index.ts', file: '/r/src/registry/index.ts', worstDistance: 1, reachedBy: 2 },
      layerEdges: [{ from: 'src/interfaces', to: 'src/registry', count: 5 }],
    }));
    expect(r.verdicts.map(v => v.pattern)).toEqual(['hexagonal (ports and adapters)']);
    expect(r.verdicts[0].confidence).toBe('HIGH');
    // Every verdict prints its evidence, or it is not printed.
    expect(r.verdicts[0].evidence.join('\n')).toContain('/r/src/registry/index.ts');
  });

  it('downgrades hexagonal when the direction is dirty', () => {
    const r = decide(base({
      adapters: [door('/r/a.ts'), door('/r/b.ts')],
      compositionRoot: { id: '/r/root.ts', file: '/r/root.ts', worstDistance: 1, reachedBy: 2 },
      bidirectional: [{ a: 'src/core', b: 'src/types' }],
    }));
    expect(r.verdicts[0].confidence).toBe('MEDIUM');
    expect(r.verdicts[0].caveats.join(' ')).toMatch(/bidirectional/i);
  });

  it('names disjoint cones plugin/multi-service, never hexagonal', () => {
    const r = decide(base({
      adapters: [door('/r/apps/web/main.ts'), door('/r/apps/admin/main.ts')],
      compositionRoot: null,
    }));
    expect(r.verdicts.map(v => v.pattern)).toEqual(['plugin or multi-service (disjoint entry cones)']);
  });

  it('names one door over a one-way layer graph a layered monolith', () => {
    const r = decide(base({
      adapters: [door('/r/src/main.ts')],
      layerEdges: [{ from: 'src', to: 'src/core', count: 9 }],
    }));
    expect(r.verdicts.map(v => v.pattern)).toEqual(['layered monolith']);
  });

  /** The subject-c shape: no adapter convention matched — the shape IS the answer. */
  it('matches nothing and says so, with the shape still reported', () => {
    const r = decide(base({ layerEdges: [{ from: 'electron/main', to: 'src', count: 4 }] }));
    expect(r.verdicts).toEqual([]);
    expect(r.shape.join('\n')).toContain('0 driving adapter(s)');
    expect(r.shape.join('\n')).toContain('1 directory-level dependency edge(s)');
  });
});

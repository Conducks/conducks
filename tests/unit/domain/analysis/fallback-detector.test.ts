import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';
import { FallbackDetector } from '@/lib/domain/analysis/index.js';

/**
 * `conducks fallback` — 272 lines at 0% coverage behind a live command.
 *
 * It CLASSIFIES a symbol: "this looks like a fallback". That is a claim about someone's design, made
 * from five weak structural signals and a majority vote, and a wrong one is not obviously wrong to
 * the reader — it is a plausible sentence about their code.
 *
 * The rule is `totalScore >= 3` of five indicators, so the case worth pinning hardest is the one
 * where TWO fire. A detector that reported on two would call half a codebase a fallback, and nothing
 * downstream would contradict it.
 */
const node = (id: string, name: string) => ({
  id, label: 'BEHAVIOR' as any,
  properties: { name, filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR' } as any,
});

const edge = (from: string, to: string, type = 'CALLS', confidence = 1) => ({
  id: `${from}->${to}-${type}`, sourceId: from, targetId: to,
  type: type as any, confidence, properties: {} as any,
});

const build = (nodes: any[], edges: any[] = []) => {
  const g = new ConducksAdjacencyList();
  nodes.forEach(n => g.addNode(n));
  edges.forEach(e => g.addEdge(e));
  return g;
};

const detect = (g: ConducksAdjacencyList, id: string) =>
  new FallbackDetector().detectFallbackPatterns(g.getNode(id)! as any, g);

describe('the naming signal', () => {
  it('scores a name that IS the keyword', () => {
    const g = build([node('/p/a.ts::fallback', 'fallback')]);
    expect(detect(g, '/p/a.ts::fallback').patterns.namingPatterns.score).toBeGreaterThan(0);
  });

  it('scores NOTHING for camelCase or snake_case — the signal barely fires in real code', () => {
    // MEASURED while writing this file, and recorded rather than fixed (rule 16). The patterns use
    // `\bfallback\b`, and `\b` needs a non-word character on BOTH sides: `fallbackHandler` has a
    // letter after it and `fallback_handler` has an underscore, which JavaScript counts as a word
    // character. So the signal fires only for a symbol named EXACTLY `fallback`, `legacy` or `try`.
    //
    // That matters because the verdict needs three of five indicators. One of the five is, in
    // practice, almost never available — so the bar is effectively three of four, and nothing said
    // so. Pinned at the real behaviour so a fix has a red test to turn green.
    const g = build([
      node('/p/a.ts::fallbackHandler', 'fallbackHandler'),
      node('/p/a.ts::fallback_handler', 'fallback_handler'),
      node('/p/a.ts::handleFallback', 'handleFallback'),
    ]);
    expect(detect(g, '/p/a.ts::fallbackHandler').patterns.namingPatterns.score).toBe(0);
    expect(detect(g, '/p/a.ts::fallback_handler').patterns.namingPatterns.score).toBe(0);
    expect(detect(g, '/p/a.ts::handleFallback').patterns.namingPatterns.score).toBe(0);
  });

  it('scores an ordinary name at zero', () => {
    const g = build([node('/p/a.ts::computeTotal', 'computeTotal')]);
    expect(detect(g, '/p/a.ts::computeTotal').patterns.namingPatterns.score).toBe(0);
  });

  it('matches whole WORDS, not substrings', () => {
    // `\btry\b` and not `try` — otherwise `retryPolicy`, `country` and `entry` all read as fallbacks,
    // and the false positives land on the commonest names in a codebase.
    const g = build([node('/p/a.ts::retryPolicy', 'retryPolicy'), node('/p/a.ts::entry', 'entry')]);
    expect(detect(g, '/p/a.ts::retryPolicy').patterns.namingPatterns.score).toBe(0);
    expect(detect(g, '/p/a.ts::entry').patterns.namingPatterns.score).toBe(0);
  });
});

describe('the verdict needs THREE indicators, not two', () => {
  it('a suggestive NAME alone is not a fallback', () => {
    // One indicator. The name is the weakest signal — it is what a person wrote, not what the code
    // does — and it carries the smallest confidence weight for that reason.
    const g = build([node('/p/a.ts::legacy', 'legacy')]);
    expect(detect(g, '/p/a.ts::legacy').isFallback).toBe(false);
  });

  it('an isolated symbol with an ordinary name is not a fallback', () => {
    const g = build([node('/p/a.ts::run', 'run')]);
    const r = detect(g, '/p/a.ts::run');
    expect(r.isFallback).toBe(false);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('reports every signal it used, so a verdict can be argued with', () => {
    // The patterns come back beside the verdict. A boolean with no evidence is a claim a reader
    // cannot check, which is the shape this whole project exists to avoid.
    const r = detect(build([node('/p/a.ts::run', 'run')]), '/p/a.ts::run');
    for (const k of ['pipelinePosition', 'conditionalUsage', 'errorHandling', 'namingPatterns', 'usageRatio']) {
      expect(r.patterns).toHaveProperty(k);
    }
  });
});

describe('confidence is bounded and ordered', () => {
  it('never exceeds 1', () => {
    const g = build([node('/p/a.ts::legacy', 'legacy')]);
    expect(detect(g, '/p/a.ts::legacy').confidence).toBeLessThanOrEqual(1);
  });

  it('a name that IS the keyword scores above an ordinary one', () => {
    const g = build([
      node('/p/a.ts::legacy', 'legacy'),
      node('/p/a.ts::computeTotal', 'computeTotal'),
    ]);
    expect(detect(g, '/p/a.ts::legacy').confidence)
      .toBeGreaterThan(detect(g, '/p/a.ts::computeTotal').confidence);
  });

  it('is never negative, even for a symbol with no edges at all', () => {
    expect(detect(build([node('/p/a.ts::x', 'x')]), '/p/a.ts::x').confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('it survives the graph shapes a real project has', () => {
  it('a symbol with many callers', () => {
    const callers = ['a', 'b', 'c'].map(n => node(`/p/${n}.ts::${n}`, n));
    const g = build([node('/p/t.ts::target', 'target'), ...callers],
      callers.map(c => edge(c.id, '/p/t.ts::target')));
    expect(() => detect(g, '/p/t.ts::target')).not.toThrow();
  });

  it('a call CYCLE', () => {
    const g = build([node('/p/a.ts::a', 'a'), node('/p/b.ts::b', 'b')],
      [edge('/p/a.ts::a', '/p/b.ts::b'), edge('/p/b.ts::b', '/p/a.ts::a')]);
    expect(() => detect(g, '/p/a.ts::a')).not.toThrow();
  });

  it('an edge pointing at a node the graph does not hold', () => {
    // Dangling targets are normal — an unresolved specifier leaves one on purpose.
    const g = build([node('/p/a.ts::a', 'a')], [edge('/p/a.ts::a', '/p/gone.ts::gone')]);
    expect(() => detect(g, '/p/a.ts::a')).not.toThrow();
  });
});

/**
 * THE DETECTOR CANNOT RETURN TRUE, and this is a proof rather than a suspicion.
 *
 * The verdict needs THREE of five indicators. Each of the other four reads a field the parser never
 * writes — grepped across all of `core/parsing`, and confirmed against the vault:
 *
 *   pipelinePosition   needs `edge.properties.pipelineOrder`   · 0 occurrences in parsing
 *   conditionalUsage   needs `edge.properties.isConditional`   · 0
 *   errorHandling      needs `node.properties.dna.catchBlocks` · 0, and 0 nodes carry it
 *   usageRatio         needs any of the three above            · so its ratio is always 0
 *
 * That leaves NAMING, which the case above shows fires only for a symbol named exactly `fallback`,
 * `legacy` or `try`. One indicator, maximum. Three required.
 *
 * Measured end to end: `conducks audit --fallback` examines 1,900 functions on this repository and
 * reports none. That is not a clean bill of health — it is a detector whose inputs do not exist.
 *
 * RECORDED, NOT FIXED (rule 16). Making it work means emitting three new edge/DNA fields from the
 * parser, which is a feature; deleting it removes a user-facing command. Either is a decision, and
 * a decision is not something to take inside a clean. This test is what stops the situation being
 * rediscovered from scratch, and it goes red the day any of those fields starts being produced —
 * which is exactly when someone should look again.
 */
describe('the three signals the parser never produces', () => {
  const parsingEmits = (field: string): boolean => {
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f, out);
        else if (e.name.endsWith('.ts')) out.push(f);
      }
      return out;
    };
    return walk(path.resolve('src/lib/core/parsing'))
      .some(f => fs.readFileSync(f, 'utf8').includes(field));
  };

  for (const field of ['isConditional', 'isInCatch', 'pipelineOrder', 'catchBlocks']) {
    it(`parsing does not emit \`${field}\`, so the signal reading it cannot fire`, () => {
      expect(parsingEmits(field)).toBe(false);
    });
  }

  it('so no symbol reaches the three indicators the verdict requires', () => {
    // Every shape a real graph can hold: callers, a name that scores, ordinary edges. One indicator.
    const g = build([
      node('/p/a.ts::legacy', 'legacy'),
      node('/p/b.ts::caller', 'caller'),
      node('/p/c.ts::other', 'other'),
    ], [edge('/p/b.ts::caller', '/p/a.ts::legacy'), edge('/p/c.ts::other', '/p/a.ts::legacy')]);

    const r = detect(g, '/p/a.ts::legacy');
    const fired = [
      r.patterns.pipelinePosition.position === 'late',
      r.patterns.conditionalUsage.isConditional,
      r.patterns.errorHandling.isInErrorHandling,
      r.patterns.namingPatterns.score > 0.3,
      r.patterns.usageRatio.ratio > 0.5,
    ].filter(Boolean).length;

    expect(fired).toBeLessThan(3);
    expect(r.isFallback).toBe(false);
  });
});

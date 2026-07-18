import { describe, it, expect } from '@jest/globals';
import { inferType, parseBody, shape, lint } from '@/lib/domain/analysis/docs-grammar.js';

// Gate 2 (conducks-docs): the parser must classify EVERY file/folder the standard defines —
// no part of the format reads as "unknown". "unknown" is reserved for files not in the standard.
describe('docs-grammar — full-format classification', () => {
  it('classifies handover.md as a governed record', () => {
    expect(inferType('docs/handover.md')).toBe('handover');
  });

  it('classifies the free-form category folders as prose', () => {
    for (const dir of ['product', 'business', 'brand', 'design', 'process']) {
      expect(inferType(`docs/${dir}/anything.md`)).toBe('prose');
    }
  });

  it('classifies README as prose, not unknown', () => {
    expect(inferType('docs/README.md')).toBe('prose');
  });

  it('still classifies the six governed types + derived', () => {
    expect(inferType('docs/todos/todo01.md')).toBe('todo');
    expect(inferType('docs/decisions/0001-x.md')).toBe('decision');
    expect(inferType('docs/features.md')).toBe('features');
    expect(inferType('docs/memory.md')).toBe('memory');
    expect(inferType('docs/conventions.md')).toBe('conventions');
    expect(inferType('docs/progress.md')).toBe('progress');
    expect(inferType('docs/architecture.md')).toBe('derived');
  });

  it('a flat misplaced file stays unknown (the move-me signal)', () => {
    expect(inferType('docs/business_plan.md')).toBe('unknown');
  });

  it('lints handover for a missing Status and shapes it when present', () => {
    expect(lint('handover', parseBody('# Handover — 2026-07-18\n'))).toContain('missing `Status:` (current | stale)');
    const shaped = shape('handover', parseBody('# Handover — 2026-07-18\nStatus: current\n\n## Where it stands\n'), 'docs/handover.md');
    expect(shaped.status).toBe('current');
    expect(shaped.sections).toContain('Where it stands');
  });
});

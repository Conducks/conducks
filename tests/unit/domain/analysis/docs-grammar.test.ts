import { describe, it, expect } from '@jest/globals';
import { inferType, parseBody, shape, lint } from '@/lib/domain/analysis/docs-grammar.js';

// Gate 2 (conducks-docs): the parser must classify EVERY file/folder the standard defines —
// no part of the format reads as "unknown". "unknown" is reserved for files not in the standard.
describe('docs-grammar — full-format classification', () => {
  it('classifies handover.md as a governed record', () => {
    expect(inferType('docs/handover.md')).toBe('handover');
  });

  it('classifies any non-governed doc as soft prose — no whitelist, never unknown', () => {
    for (const fp of [
      'docs/product/x.md', 'docs/business/x.md', 'docs/design/x.md', 'docs/process/x.md',
      'docs/parity-audit/x.md', 'docs/hypothesis/x.md', 'docs/research/x.md',
      'docs/README.md', 'docs/business_plan.md', 'docs/coverage.md',
    ]) {
      expect(inferType(fp)).toBe('prose');
    }
  });

  it('treats architecture as file OR folder — both are the derived tier', () => {
    expect(inferType('docs/architecture.md')).toBe('derived');       // overview file
    expect(inferType('docs/architecture/auth.md')).toBe('derived');  // per-subsystem detail
    expect(inferType('docs/map.md')).toBe('derived');
    expect(inferType('docs/drift.md')).toBe('derived');
  });

  it('still classifies the six governed types', () => {
    expect(inferType('docs/todos/todo01.md')).toBe('todo');
    expect(inferType('docs/decisions/0001-x.md')).toBe('decision');
    expect(inferType('docs/features.md')).toBe('features');
    expect(inferType('docs/memory.md')).toBe('memory');
    expect(inferType('docs/conventions.md')).toBe('conventions');
    expect(inferType('docs/progress.md')).toBe('progress');
  });

  it('lints handover for a missing Status and shapes it when present', () => {
    expect(lint('handover', parseBody('# Handover — 2026-07-18\n'))).toContain('missing `Status:` (current | stale)');
    const shaped = shape('handover', parseBody('# Handover — 2026-07-18\nStatus: current\n\n## Where it stands\n'), 'docs/handover.md');
    expect(shaped.status).toBe('current');
    expect(shaped.sections).toContain('Where it stands');
  });
});

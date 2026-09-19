import { describe, it, expect } from '@jest/globals';
import { buildGlossaryReport, normaliseTerm } from '@/lib/domain/docs/glossary.js';
import { sectionOf, isEmptyBody } from '@/lib/domain/docs/module-notes.js';
import type { ModuleNote } from '@/lib/domain/docs/module-notes.js';

// ADR 0193: a term defined in two or more features' `## Glossary` IS the collision, derived rather
// than maintained. ADR 0124: a clean collision count must never mean "nobody wrote a glossary".

const note = (feature: string, glossaryBody: string | null): ModuleNote => ({
  feature,
  path: `docs/visuals/modules/${feature}.md`,
  text: glossaryBody === null
    ? `# ${feature} — a note\n\n**Layer:** x\n**Responsibility:** x\n**Boundaries:** x\n**Uses:** x\n\n## Features\nnone\n`
    : `# ${feature} — a note\n\n**Layer:** x\n**Responsibility:** x\n**Boundaries:** x\n**Uses:** x\n\n## Glossary\n${glossaryBody}\n\n## Features\nnone\n`,
});

describe('buildGlossaryReport — collision detection', () => {
  it('reports no collision when every term is unique to its feature', () => {
    const notes = [
      note('a', '- **widget** — a thing feature a owns'),
      note('b', '- **gadget** — a different thing'),
    ];
    const report = buildGlossaryReport(notes);
    expect(report.collisions).toEqual([]);
    expect(report.notesWithNoSection).toBe(0);
  });

  it('collides two features defining the same term, case-insensitively', () => {
    // The exact case ADR 0193 names: `node` and `Node` failing to collide is the bug this tool exists
    // to catch.
    const notes = [
      note('graph', '- **Node** — a vertex in the dependency graph'),
      note('core/utils', '- **node** — an OS process, unrelated to the graph'),
    ];
    const report = buildGlossaryReport(notes);
    expect(report.collisions).toHaveLength(1);
    expect(report.collisions[0].entries.map(e => e.feature).sort()).toEqual(['core/utils', 'graph']);
  });

  it('folds a simple hyphen/space phrase variant together', () => {
    const notes = [
      note('a', '- **dead-code** — unreachable'),
      note('b', '- **dead code** — same idea, different spelling'),
    ];
    expect(buildGlossaryReport(notes).collisions).toHaveLength(1);
  });

  it('does not collide the same term defined twice within ONE feature', () => {
    const notes = [note('a', '- **widget** — first\n- **widget** — restated')];
    expect(buildGlossaryReport(notes).collisions).toEqual([]);
  });

  it('counts a note with no `## Glossary` heading at all, separately from the collision count', () => {
    const notes = [note('a', null), note('b', '- **widget** — a thing')];
    const report = buildGlossaryReport(notes);
    expect(report.collisions).toEqual([]);
    expect(report.notesWithNoSection).toBe(1);
    expect(report.totalNotes).toBe(2);
  });

  it('an explicit `none` body counts as a present, empty section — not a missing one', () => {
    const notes = [note('a', 'none')];
    const report = buildGlossaryReport(notes);
    expect(report.notesWithNoSection).toBe(0);
    expect(report.entries).toEqual([]);
  });

  it('the honesty count is not fooled by a clean-looking zero: no notes at all is still reportable', () => {
    const report = buildGlossaryReport([]);
    expect(report.collisions).toEqual([]);
    expect(report.notesWithNoSection).toBe(0);
    expect(report.totalNotes).toBe(0);
  });
});

describe('normaliseTerm', () => {
  it('folds case and hyphen/underscore/space variants to the same key', () => {
    expect(normaliseTerm('Node')).toBe(normaliseTerm('node'));
    expect(normaliseTerm('dead-code')).toBe(normaliseTerm('dead code'));
    expect(normaliseTerm('dead_code')).toBe(normaliseTerm('dead code'));
  });
});

describe('sectionOf / isEmptyBody — the missing-vs-empty primitive both commands rest on', () => {
  it('returns null when the heading is absent', () => {
    expect(sectionOf('# x\n\n## Other\nsome text\n', 'Glossary')).toBeNull();
  });

  it('returns an array, not null, when the heading is present with `none`', () => {
    const lines = sectionOf('# x\n\n## Glossary\nnone\n', 'Glossary');
    expect(lines).not.toBeNull();
    expect(isEmptyBody(lines!)).toBe(true);
  });

  it('stops a section at the next heading, never swallowing what follows', () => {
    const lines = sectionOf('## Glossary\n- **a** — b\n## Traps\n- a trap\n', 'Glossary');
    expect(lines!.join('\n')).not.toMatch(/a trap/);
  });
});

import { describe, it, expect } from '@jest/globals';
import { buildFeaturesReport } from '@/lib/domain/docs/features.js';
import type { ModuleNote } from '@/lib/domain/docs/module-notes.js';

// ADR 0193: `conducks features` walks every note's `## Features` and prints the tree `features.md`
// used to hold by hand. ADR 0124: the tree and "nobody wrote any features" must never look the same.

const note = (feature: string, featuresBody: string | null): ModuleNote => ({
  feature,
  path: `docs/visuals/modules/${feature}.md`,
  text: featuresBody === null
    ? `# ${feature} — a note\n\n**Layer:** x\n**Responsibility:** x\n**Boundaries:** x\n**Uses:** x\n\n## Glossary\nnone\n`
    : `# ${feature} — a note\n\n**Layer:** x\n**Responsibility:** x\n**Boundaries:** x\n**Uses:** x\n\n## Features\n${featuresBody}\n\n## Glossary\nnone\n`,
});

describe('buildFeaturesReport — the tree', () => {
  it('walks a linked feature bullet into a tree node', () => {
    const notes = [note('core/graph', '- [linkers](./graph/linkers.md) — resolves symbol edges')];
    const report = buildFeaturesReport(notes);
    expect(report.tree).toEqual([
      { feature: 'core/graph', note: 'docs/visuals/modules/core/graph.md', features: [{ name: 'linkers', description: 'resolves symbol edges' }] },
    ]);
    expect(report.notesWithNoSection).toBe(0);
  });

  it('walks a plain (non-linked) feature bullet too', () => {
    const notes = [note('contracts', '- vocabulary — the shared kind ladder')];
    const report = buildFeaturesReport(notes);
    expect(report.tree[0].features).toEqual([{ name: 'vocabulary', description: 'the shared kind ladder' }]);
  });

  it('a `none` body is a present, empty section — the note appears with zero features, never dropped', () => {
    const notes = [note('registry', 'none')];
    const report = buildFeaturesReport(notes);
    expect(report.tree).toEqual([{ feature: 'registry', note: 'docs/visuals/modules/registry.md', features: [] }]);
    expect(report.notesWithNoSection).toBe(0);
  });

  it('a missing `## Features` heading is counted, and the note is left OUT of the tree', () => {
    const notes = [note('a', null), note('b', '- x — y')];
    const report = buildFeaturesReport(notes);
    expect(report.tree.map(n => n.feature)).toEqual(['b']);
    expect(report.notesWithNoSection).toBe(1);
    expect(report.totalNotes).toBe(2);
  });

  it('orders the tree by feature path', () => {
    const notes = [note('registry', 'none'), note('contracts', 'none'), note('core/utils', 'none')];
    expect(buildFeaturesReport(notes).tree.map(n => n.feature)).toEqual(['contracts', 'core/utils', 'registry']);
  });
});

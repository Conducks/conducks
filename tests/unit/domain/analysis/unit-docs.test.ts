import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findUnitDocs, unitDocsNotice } from '@/lib/domain/analysis/unit-docs.js';

/**
 * The docs tools resolve exactly ONE `docs/` — the one under the path they were given — and never walk
 * below it. In a monorepo that means `conducks docs-lint` at the root reports "clean" while every
 * unit's docs go unopened. Measured on a real repo: 43 governed docs clean at root, 20 more across four
 * unit folders never read.
 *
 * This finds those folders so a command can NAME them. It must not lint them: silently widening a root
 * run to four other trees is its own surprise.
 */
describe('unit docs discovery', () => {
  let root = '';

  const write = (rel: string, body = '# doc\n') => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-units-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds a docs/ inside each unit', () => {
    write('docs/features.md');
    write('app/docs/features.md');
    write('admin/docs/memory.md');

    expect(findUnitDocs(root).map(u => u.unit).sort()).toEqual(['admin', 'app']);
  });

  it('never reports the root docs/ as a unit — that is the tree already scanned', () => {
    write('docs/features.md');
    expect(findUnitDocs(root)).toEqual([]);
  });

  it('finds a docs/ nested a package deep', () => {
    write('packages/core/docs/memory.md');
    expect(findUnitDocs(root).map(u => u.unit)).toEqual([path.join('packages', 'core')]);
  });

  it('counts governed files, excluding README and archived material', () => {
    write('app/docs/README.md');
    write('app/docs/features.md');
    write('app/docs/memory.md');
    write('app/docs/completed/todo01.md');
    write('app/docs/legacy/old.md');

    expect(findUnitDocs(root)[0].files).toBe(2);
  });

  it('skips a unit whose docs/ holds nothing governed', () => {
    write('app/docs/README.md');
    expect(findUnitDocs(root)).toEqual([]);
  });

  it('never descends into node_modules or a build output', () => {
    write('node_modules/pkg/docs/features.md');
    write('dist/docs/features.md');
    write('.next/docs/features.md');

    expect(findUnitDocs(root)).toEqual([]);
  });

  it('does not walk INTO a docs tree looking for more docs folders', () => {
    write('app/docs/features.md');
    write('app/docs/architecture/docs/nested.md');   // pathological, must not be reported as a unit

    expect(findUnitDocs(root).map(u => u.unit)).toEqual(['app']);
  });

  describe('the notice', () => {
    it('is empty when there are no unit docs — a single-unit repo sees nothing', () => {
      write('docs/features.md');
      expect(unitDocsNotice(root)).toEqual([]);
    });

    it('states the totals and gives the exact command per unit', () => {
      write('app/docs/features.md');
      write('app/docs/memory.md');
      write('admin/docs/features.md');

      const lines = unitDocsNotice(root);

      expect(lines[0]).toMatch(/2 unit docs\/ folder\(s\) hold 3 more governed file\(s\)/);
      expect(lines.join('\n')).toMatch(/conducks docs-lint admin/);
      expect(lines.join('\n')).toMatch(/conducks docs-lint app/);
    });
  });
});

/**
 * `docs-lint --units` is the monorepo CI gate: it must FAIL when any single unit fails, not just the
 * root. A gate that silently checks less than it appears to is the failure mode the whole notice
 * exists to prevent — measured on a real repo, root exited 0 with a broken phase in `app/docs/`.
 */
describe('--units aggregation', () => {
  let root = '';

  const write = (rel: string, body: string) => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  const GOOD_TODO = '# todo01 — a thing\n\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\n- [ ] the open task\n';
  const BAD_TODO = '# todo01 — a thing\n\nStatus: doing\n- Acceptance: it works\n\n## Phase 1 — p\nprose, no tasks\n';

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-agg-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('sees every unit that the root run would skip', () => {
    write('docs/todos/todo01.md', GOOD_TODO);
    write('app/docs/todos/todo01.md', BAD_TODO);
    write('admin/docs/todos/todo01.md', GOOD_TODO);

    // The command lints root + each of these. The discovery is what makes that possible at all.
    expect(findUnitDocs(root).map(u => u.unit).sort()).toEqual(['admin', 'app']);
  });

  it('the notice names the unit holding the break, so a root-only run is not misleading', () => {
    write('docs/todos/todo01.md', GOOD_TODO);
    write('app/docs/todos/todo01.md', BAD_TODO);

    expect(unitDocsNotice(root).join('\n')).toMatch(/conducks docs-lint app/);
  });
});

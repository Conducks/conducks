import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findServiceDocs, serviceDocsNotice } from '@/lib/domain/docs/service-docs.js';

/**
 * The docs tools resolve exactly ONE `docs/` — the one under the path they were given — and never walk
 * below it. In a monorepo that means `conducks docs-lint` at the root reports "clean" while every
 * service's docs go unopened. Measured on a real repo: 43 governed docs clean at root, 20 more across four
 * service folders never read.
 *
 * This finds those folders so a command can NAME them. It must not lint them: silently widening a root
 * run to four other trees is its own surprise.
 */
describe('service docs discovery', () => {
  let root = '';

  const write = (rel: string, body = '# doc\n') => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-services-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds a docs/ inside each service', () => {
    write('docs/features.md');
    write('app/docs/features.md');
    write('admin/docs/memory.md');

    expect(findServiceDocs(root).map(s => s.service).sort()).toEqual(['admin', 'app']);
  });

  it('never reports the root docs/ as a service — that is the tree already scanned', () => {
    write('docs/features.md');
    expect(findServiceDocs(root)).toEqual([]);
  });

  it('finds a docs/ nested a package deep', () => {
    write('packages/core/docs/memory.md');
    expect(findServiceDocs(root).map(s => s.service)).toEqual([path.join('packages', 'core')]);
  });

  it('counts governed files, excluding README and archived material', () => {
    write('app/docs/README.md');
    write('app/docs/features.md');
    write('app/docs/memory.md');
    write('app/docs/completed/todo01.md');
    write('app/docs/legacy/old.md');

    expect(findServiceDocs(root)[0].files).toBe(2);
  });

  it('skips a service whose docs/ holds nothing governed', () => {
    write('app/docs/README.md');
    expect(findServiceDocs(root)).toEqual([]);
  });

  it('never descends into node_modules or a build output', () => {
    write('node_modules/pkg/docs/features.md');
    write('dist/docs/features.md');
    write('.next/docs/features.md');

    expect(findServiceDocs(root)).toEqual([]);
  });

  it('does not walk INTO a docs tree looking for more docs folders', () => {
    write('app/docs/features.md');
    write('app/docs/architecture/docs/nested.md');   // pathological, must not be reported as a service

    expect(findServiceDocs(root).map(s => s.service)).toEqual(['app']);
  });

  describe('the notice', () => {
    it('is empty when there are no service docs — a single-service repo sees nothing', () => {
      write('docs/features.md');
      expect(serviceDocsNotice(root)).toEqual([]);
    });

    it('states the totals and gives the exact command per service', () => {
      write('app/docs/features.md');
      write('app/docs/memory.md');
      write('admin/docs/features.md');

      const lines = serviceDocsNotice(root);

      expect(lines[0]).toMatch(/2 service docs\/ folder\(s\) hold 3 more governed file\(s\)/);
      expect(lines.join('\n')).toMatch(/conducks docs-lint admin/);
      expect(lines.join('\n')).toMatch(/conducks docs-lint app/);
    });
  });
});

/**
 * `docs-lint` is the monorepo CI gate: it must FAIL when any single service fails, not just the
 * root. A gate that silently checks less than it appears to is the failure mode the whole notice
 * exists to prevent — measured on a real repo, root exited 0 with a broken phase in `app/docs/`.
 */
describe('multi-tree aggregation', () => {
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

  it('sees every service that the root run would skip', () => {
    write('docs/todos/todo01.md', GOOD_TODO);
    write('app/docs/todos/todo01.md', BAD_TODO);
    write('admin/docs/todos/todo01.md', GOOD_TODO);

    // The command lints root + each of these. The discovery is what makes that possible at all.
    expect(findServiceDocs(root).map(s => s.service).sort()).toEqual(['admin', 'app']);
  });

  it('the notice names the service holding the break, so a root-only run is not misleading', () => {
    write('docs/todos/todo01.md', GOOD_TODO);
    write('app/docs/todos/todo01.md', BAD_TODO);

    expect(serviceDocsNotice(root).join('\n')).toMatch(/conducks docs-lint app/);
  });
});

/**
 * Discovery can only ask "does this folder hold a `docs/`?" — which cannot tell a real service from a
 * folder that happens to hold documentation, and misses a service whose docs have not been written
 * yet. `conducks.json` lets the repo say which parts have owners; discovery stays the fallback.
 */
describe('declared services', () => {
  let root = '';

  const write = (rel: string, body = '# doc\n') => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-declared-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('uses the declaration instead of walking the tree', () => {
    write('conducks.json', JSON.stringify({ services: ['app', 'packages/core'] }));
    write('app/docs/features.md');
    write('packages/core/docs/features.md');
    write('scratch/docs/notes.md');            // holds a docs/, but nobody owns it

    expect(findServiceDocs(root).map(s => s.service)).toEqual(['app', path.join('packages', 'core')]);
  });

  it('reports a declared service whose docs are not written yet — that is when the reminder matters', () => {
    write('conducks.json', JSON.stringify({ services: ['admin'] }));
    write('admin/src/index.ts', 'export {}');

    expect(findServiceDocs(root)).toEqual([{ service: 'admin', files: 0 }]);
  });

  it('skips a declared service that is no longer on disk, rather than failing every docs command', () => {
    write('conducks.json', JSON.stringify({ services: ['app', 'deleted'] }));
    write('app/docs/features.md');

    expect(findServiceDocs(root).map(s => s.service)).toEqual(['app']);
  });

  it('falls back to discovery when conducks.json is malformed', () => {
    write('conducks.json', '{ not json');
    write('app/docs/features.md');

    expect(findServiceDocs(root).map(s => s.service)).toEqual(['app']);
  });
});

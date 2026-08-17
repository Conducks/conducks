import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { ManifestEngine } from '@/lib/domain/manifest/index.js';

/**
 * `ManifestEngine` decides what `conducks bootstrap-docs` and `conducks record` WRITE, and nothing
 * named it in a test. It is pure — no filesystem, by design, so the service beside it owns all I/O —
 * which makes it the easiest thing in domain to check and the least excusable to leave unchecked.
 *
 * What it gets wrong is not visible at the call site. A file written without its `# Title` still
 * writes, still exits 0, and fails `conducks docs-lint` LATER, in a different command, against a
 * file the user did not hand-write. That happened: `record`'s initial-content branch was unreachable
 * for its whole life because `appendFile` creates a missing file rather than throwing, so every file
 * the command ever created started without its title (ADR 0122).
 */
describe('computeBootstrap — where the grammar files land', () => {
  const engine = new ManifestEngine();

  it('puts every file flat under docs/', () => {
    const plan = engine.computeBootstrap('/p', 'demo');

    expect(plan.files.length).toBeGreaterThan(0);
    for (const f of plan.files) {
      expect(f.filePath.startsWith(path.join('/p', 'docs'))).toBe(true);
    }
  });

  it('creates decisions/ and todos/completed/ even though they hold no file', () => {
    // A tree with no `decisions/` gives the next ADR nowhere obvious to land, so it gets written
    // somewhere else — and the docs standard's whole premise is that location carries meaning.
    const plan = engine.computeBootstrap('/p', 'demo');

    expect(plan.dirs).toContain(path.join('/p', 'docs', 'decisions'));
    expect(plan.dirs).toContain(path.join('/p', 'docs', 'todos', 'completed'));
  });

  it('gives every file a `# Title`, which is what docs-lint requires', () => {
    for (const f of engine.computeBootstrap('/p', 'demo').files) {
      expect(f.content.trimStart().startsWith('# ')).toBe(true);
    }
  });

  it('names the project in the content rather than emitting a template', () => {
    const plan = engine.computeBootstrap('/p', 'my-service');
    expect(plan.files.some(f => f.content.includes('my-service'))).toBe(true);
  });

  it('a SERVICE tree is not the same set as a root tree', () => {
    // Two kinds exist; if they produced identical output the parameter would be decoration.
    const root = engine.computeBootstrap('/p', 'demo', 'root').files.map(f => f.name).sort();
    const service = engine.computeBootstrap('/p', 'demo', 'service').files.map(f => f.name).sort();
    expect(service).not.toEqual(root);
  });
});

describe('computeRecord — what an appended entry looks like', () => {
  const engine = new ManifestEngine();

  it('writes a `## ` section heading, which is what the docs grammar parses', () => {
    // Not `### Entry:`. The grammar reads `##` sections, so the wrong level makes the entry
    // invisible to `docs-status` while still appearing in the file.
    const r = engine.computeRecord('/p', 'demo', 'memory', 'something learned');

    expect(r.appendContent).toMatch(/\n## \d{4}-\d{2}-\d{2} · recorded\n/);
    expect(r.appendContent).toContain('something learned');
  });

  it('the INITIAL content carries the title and the entry — the branch that was dead', () => {
    // `appendFile` creates a missing file rather than throwing, so this branch never ran and every
    // file `record` created started without its `# Title`. Pinned so it cannot go quiet again.
    const r = engine.computeRecord('/p', 'demo', 'memory', 'first entry');

    expect(r.initialContent.startsWith('# Memory — demo\n')).toBe(true);
    expect(r.initialContent).toContain('first entry');
    expect(r.initialContent).toContain(r.appendContent);
  });

  it('lowercases the file name and capitalises the title', () => {
    const r = engine.computeRecord('/p', 'demo', 'Memory', 'x');
    expect(r.filePath).toBe(path.join('/p', 'docs', 'memory.md'));
    expect(r.initialContent.startsWith('# Memory —')).toBe(true);
  });

  it('reports the docs dir the caller must create', () => {
    expect(engine.computeRecord('/p', 'demo', 'memory', 'x').docsDir).toBe(path.join('/p', 'docs'));
  });
});

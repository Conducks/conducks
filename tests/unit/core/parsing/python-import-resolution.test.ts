import { describe, it, expect } from '@jest/globals';
import { PythonResolver } from '@/lib/core/parsing/languages/python/resolver.js';

/**
 * EVERY PYTHON IMPORT ON THIS MACHINE RESOLVED TO NOTHING, and the vs-grep benchmark is what said
 * so: `impact resolve_project_path` reported 0 callers against 10 measured call sites, because every
 * caller reaches it through `from foundation import paths` — and that import, like every other
 * in-repo Python import on the frozen subject, was recorded as `DEPENDS_ON ecosystem::foundation`,
 * an EXTERNAL dependency.
 *
 * The resolver lowercased its candidate and then asked `allFiles.includes(...)` — one side
 * canonicalized, the other not. On a repository whose absolute path contains an uppercase letter
 * (`/Users/.../Documents/...` — every macOS home directory), no candidate can ever match, so the
 * resolver's answer is not "sometimes wrong" but ALWAYS undefined, and nothing reported it: the
 * imports fell through to the ecosystem bucket and looked like ordinary external dependencies.
 */
describe('Python import resolution', () => {
  const resolver = new PythonResolver();
  const FILES = [
    '/Users/Dev/Project_X/src/foundation/paths.py',
    '/Users/Dev/Project_X/src/foundation/__init__.py',
    '/Users/Dev/Project_X/src/core/logging_setup.py',
    '/Users/Dev/Project_X/src/core/errors/classifier.py',
  ];

  it('resolves a bare package.module import despite uppercase in the repository path', () => {
    const hit = resolver.resolve('foundation.paths', '/Users/Dev/Project_X/src/core/logging_setup.py', FILES);
    expect(hit?.toLowerCase()).toBe('/users/dev/project_x/src/foundation/paths.py');
  });

  it('resolves a bare package import to its __init__', () => {
    const hit = resolver.resolve('foundation', '/Users/Dev/Project_X/src/core/logging_setup.py', FILES);
    expect(hit?.toLowerCase()).toBe('/users/dev/project_x/src/foundation/__init__.py');
  });

  it('resolves a relative import', () => {
    const hit = resolver.resolve('.classifier', '/Users/Dev/Project_X/src/core/errors/__init__.py', FILES);
    expect(hit?.toLowerCase()).toBe('/users/dev/project_x/src/core/errors/classifier.py');
  });

  it('still refuses what does not exist', () => {
    expect(resolver.resolve('requests', '/Users/Dev/Project_X/src/core/logging_setup.py', FILES)).toBeUndefined();
  });

  /**
   * `import logging` IS THE STANDARD LIBRARY, even when the repo owns a `core/logging/` package.
   *
   * The proximity walk found `src/core/logging/__init__.py` from `src/core/` and bound the stdlib
   * import to it — a WRONG edge, minted the moment resolution started working at all. The code that
   * wants the in-repo package writes `core.logging` or a relative import; a bare stdlib name stays a
   * boundary.
   */
  it('refuses to bind a stdlib module name to an in-repo package', () => {
    const files = [...FILES, '/Users/Dev/Project_X/src/core/logging/__init__.py'];
    expect(resolver.resolve('logging', '/Users/Dev/Project_X/src/core/logging_setup.py', files)).toBeUndefined();
    expect(resolver.resolve('logging.handlers', '/Users/Dev/Project_X/src/core/logging_setup.py', files)).toBeUndefined();
    // The qualified form still reaches the in-repo package.
    expect(resolver.resolve('core.logging', '/Users/Dev/Project_X/src/core/logging_setup.py', files)?.toLowerCase())
      .toBe('/users/dev/project_x/src/core/logging/__init__.py');
  });

  /**
   * F-07b — the upward walk in `resolveAbsolute` stopped BEFORE ever trying the project root
   * ('.') as a candidate, because both loops shared the guard
   * `while (currentDir !== '/' && currentDir !== '.')`. Any importer whose own path is not already
   * nested under a literal `src` directory (e.g. a top-level `tests/` or `main.py`) could never
   * resolve a src-layout absolute import and fell through to being classified as third-party.
   *
   * MEASURED against the compiled resolver directly (orchestrator repro): `tests/debug_x.py`,
   * `main.py` and `deep/a/b/c.py` all resolved `specialists.google_maps.specialist` to `undefined`,
   * while a file already nested under `src` (the control) resolved correctly.
   */
  describe('src-layout absolute import resolves from the project root', () => {
    // Project-relative paths (no leading slash), matching how `allFiles` is actually populated by
    // the pipeline. A '/repo/...'-style absolute path masks this bug entirely: '/repo' itself acts
    // as a filesystem root the walk reaches before ever needing '.', so the missing candidate never
    // gets exercised. Verified live: with the root candidate reverted out, a '/repo'-prefixed fixture
    // still passed (false green); this project-relative form is the one that actually reproduces it.
    const ROOT_FILES = [
      'src/specialists/google_maps/specialist.py',
      'src/specialists/__init__.py',
      'src/x/y.py',
    ];

    it('resolves from a top-level test file with no src ancestor', () => {
      const hit = resolver.resolve('specialists.google_maps.specialist', 'tests/debug_x.py', ROOT_FILES);
      expect(hit).toBe('src/specialists/google_maps/specialist.py');
    });

    it('resolves from a root-level main.py', () => {
      const hit = resolver.resolve('specialists.google_maps.specialist', 'main.py', ROOT_FILES);
      expect(hit).toBe('src/specialists/google_maps/specialist.py');
    });

    it('resolves from a file nested several directories deep with no src ancestor', () => {
      const hit = resolver.resolve('specialists.google_maps.specialist', 'deep/a/b/c.py', ROOT_FILES);
      expect(hit).toBe('src/specialists/google_maps/specialist.py');
    });

    it('control: still resolves from a file already nested under src', () => {
      const hit = resolver.resolve('specialists.google_maps.specialist', 'src/x/y.py', ROOT_FILES);
      expect(hit).toBe('src/specialists/google_maps/specialist.py');
    });

    it('counter-test: a nearer match still wins over the root match', () => {
      // A same-named module sits both near the importer AND at the project root under src/.
      // The nearer one must win — the root candidate is a last resort, not a shadow.
      const files = [
        'pkg/sub/target.py',
        'src/target.py',
      ];
      const hit = resolver.resolve('target', 'pkg/sub/importer.py', files);
      expect(hit).toBe('pkg/sub/target.py');
    });

    it('counter-test: a genuinely external import still resolves to undefined', () => {
      expect(resolver.resolve('requests', 'tests/debug_x.py', ROOT_FILES)).toBeUndefined();
    });
  });
});

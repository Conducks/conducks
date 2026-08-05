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
});

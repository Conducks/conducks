import path from "node:path";

/**
 * Conducks — Python Import Resolver (PEP 328 & 451) 🐍
 *
 * Resolves Python import paths to absolute file paths.
 */

/**
 * Python standard-library MODULES (the importable names, not the builtins vocabulary — that lives in
 * `built-ins.ts` and is a different set: `print` is a builtin and not importable, `logging` is
 * importable and not a builtin).
 *
 * A name on this list never resolves in-repo. Without the refusal, the proximity walk bound
 * `import logging` to the subject's own `src/core/logging/__init__.py` — a WRONG edge minted the
 * moment bare-import resolution started working at all. Code that wants an in-repo package that
 * shares a stdlib name writes the qualified form (`core.logging`) or a relative import, and both of
 * those still resolve; only the bare stdlib head is refused.
 */
const PYTHON_STDLIB = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'bisect', 'builtins', 'bz2', 'calendar',
  'collections', 'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy', 'csv', 'ctypes',
  'dataclasses', 'datetime', 'decimal', 'difflib', 'dis', 'email', 'enum', 'errno', 'fnmatch',
  'fractions', 'functools', 'gc', 'getpass', 'glob', 'gzip', 'hashlib', 'heapq', 'hmac', 'html',
  'http', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'linecache',
  'locale', 'logging', 'lzma', 'math', 'mimetypes', 'multiprocessing', 'numbers', 'operator', 'os',
  'pathlib', 'pickle', 'platform', 'pprint', 'queue', 'random', 're', 'secrets', 'select', 'shlex',
  'shutil', 'signal', 'site', 'socket', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'struct',
  'subprocess', 'sys', 'sysconfig', 'tarfile', 'tempfile', 'textwrap', 'threading', 'time',
  'timeit', 'tkinter', 'token', 'tokenize', 'traceback', 'types', 'typing', 'unicodedata',
  'unittest', 'urllib', 'uuid', 'venv', 'warnings', 'weakref', 'xml', 'zipfile', 'zlib', 'zoneinfo',
]);

/**
 * Python's import rules, which are namespace-shaped rather than path-shaped: `from foundation import
 * paths` binds a MODULE, and until that resolved to a file every call through it dangled (todo44#P6).
 */
export class PythonResolver {

  /**
   * A bare specifier whose head is a standard-library module. Public because a REFUSAL has to be
   * expressible to the caller: `resolve` returning undefined means "not found here" and lets the
   * generic basename fallback try, which is how a repo's own `typing.py` swallowed every
   * `from typing import ...` (todo48#P3).
   */
  public isStdlib(specifier: string): boolean {
    return !specifier.startsWith('.') && PYTHON_STDLIB.has(specifier.split('.')[0]);
  }
  /**
   * Resolves a Python import relative to the current file.
   */
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 0. The standard library is a boundary, never an in-repo file — see PYTHON_STDLIB.
    if (this.isStdlib(rawImportPath)) return undefined;

    // 1. Absolute Resolution (Bare Imports)
    // import x.y -> x/y.py or x/y/__init__.py
    const absolutePath = this.resolveAbsolute(rawImportPath, currentFile, allFiles);
    if (absolutePath) return absolutePath;

    // 2. PEP 328 Relative Resolution (Dots)
    // from .module import X or from ..package import Y
    if (rawImportPath.startsWith('.')) {
      return this.resolveRelative(rawImportPath, currentFile, allFiles);
    }

    return undefined;
  }

  /**
   * Resolves a bare import by walking up the sys.path (project root).
   */
  private resolveAbsolute(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const segments = rawPath.replace(/\./g, '/').split('/');
    const pathLike = segments.join('/');

    // Proximity check: Try current directory first
    const dir = path.dirname(currentFile);
    const progeny = this.tryExtensions(path.join(dir, pathLike), allFiles);
    if (progeny) return progeny;

    // Walk up to simulate sys.path root finder
    let currentDir = dir;
    while (currentDir !== '/' && currentDir !== '.') {
      const target = path.join(currentDir, pathLike);
      const res = this.tryExtensions(target, allFiles);
      if (res) return res;
      currentDir = path.dirname(currentDir);
    }

    return undefined;
  }

  /**
   * PEP 328: Relative Import resolution.
   */
  private resolveRelative(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const dotMatch = rawPath.match(/^(\.+)(.*)/);
    if (!dotMatch) return undefined;

    const dotCount = dotMatch[1].length;
    const modulePart = dotMatch[2];

    let currentDir = path.dirname(currentFile);
    // 1 dot = current dir, 2 dots = parent, etc.
    for (let i = 1; i < dotCount; i++) {
      currentDir = path.dirname(currentDir);
    }

    const target = path.join(currentDir, modulePart.replace(/\./g, '/'));
    return this.tryExtensions(target, allFiles);
  }

  /** Case-insensitive index of `allFiles`, rebuilt only when the list identity changes. */
  private fileIndexSource: string[] | null = null;
  private fileIndex: Map<string, string> = new Map();

  /**
   * Checks for .py or __init__.py files.
   *
   * BOTH sides are lowercased. This used to lowercase only the candidate and then ask
   * `allFiles.includes(...)` — so on any repository whose absolute path contains an uppercase
   * letter (every macOS home directory: `/Users/...`), NO candidate could ever match and every
   * bare and relative import in every Python file resolved to nothing. The failure was invisible
   * because an unresolved import falls through to the ecosystem bucket and reads as an ordinary
   * external dependency — measured on the frozen scraper subject, all of `foundation.*` sat in
   * `DEPENDS_ON ecosystem::` and `impact` answered 0 callers for a function with 10 (todo44#P6).
   * Returns the path as `allFiles` spells it, so callers downstream see a real path.
   */
  private tryExtensions(target: string, allFiles: string[]): string | undefined {
    if (this.fileIndexSource !== allFiles) {
      this.fileIndex = new Map(allFiles.map(f => [f.toLowerCase(), f]));
      this.fileIndexSource = allFiles;
    }
    // PEP 451: package (__init__.py) before module (.py)
    const init = this.fileIndex.get(path.join(target, "__init__.py").toLowerCase());
    if (init) return init;
    return this.fileIndex.get((target + ".py").toLowerCase());
  }
}

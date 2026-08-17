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

// ---------------------------------------------------------------------------
// Python MRO-Aware Scope Resolver
// ---------------------------------------------------------------------------

/**
 * Builds the Method Resolution Order for a Python class using simplified
 * C3 linearization: left-to-right depth-first traversal with deduplication.
 *
 * For `class Foo(A, B, C)` the result is `[Foo, A, <A bases…>, B, <B bases…>, C, object]`.
 *
 * @param className  - The class whose MRO to compute.
 * @param baseClasses - Direct base classes of `className`, in declaration order.
 * @param classMap   - Map from class name → its direct base classes.
 * @returns Ordered MRO list starting with `className` and ending with `'object'`.
 */
function buildMRO(
  className: string,
  baseClasses: string[],
  classMap: Map<string, string[]>
): string[] {
  const result: string[] = [className];
  const seen = new Set<string>([className]);

  // Walks the base-class chain, because Python inheritance is transitive and a method may be
  // declared several classes up from the one the call names.
  function walk(bases: string[]): void {
    for (const base of bases) {
      if (!seen.has(base)) {
        seen.add(base);
        result.push(base);
        const subBases = classMap.get(base) ?? [];
        walk(subBases);
      }
    }
  }

  walk(baseClasses);
  result.push('object'); // Python's implicit root is always last
  return result;
}

/**
 * Resolves which class in the MRO actually defines a given method name.
 *
 * @param methodName  - Method to look up (e.g. `"__init__"`, `"save"`).
 * @param mro         - MRO list produced by `buildMRO`.
 * @param methodIndex - Map from class name → set of method names it defines.
 * @returns The first class in MRO order that defines the method, or `undefined`.
 */
function resolveMethodInMRO(
  methodName: string,
  mro: string[],
  methodIndex: Map<string, Set<string>>
): string | undefined {
  for (const cls of mro) {
    const methods = methodIndex.get(cls);
    if (methods?.has(methodName)) {
      return cls;
    }
  }
  return undefined;
}

/**
 * Conducks — Python MRO-Aware Scope Resolver
 *
 * NOT WIRED, deliberately carried, and the distinction matters. `conducks prune` reports this as an
 * ORPHAN, and the question its own message asks — "was this disconnected, or never connected?" — was
 * answered by measurement: it has the same zero references today that it had at the campaign base,
 * so nothing here disconnected it. It was written and never connected.
 *
 * It is kept rather than deleted because it is a working CAPABILITY, not a leftover. Python heritage
 * now produces real EXTENDS edges (2026-08-17), which is the input this needs, so wiring it would
 * let a call to an inherited method resolve to the class that defines it instead of dangling. That
 * is a behaviour change with its own measurement and its own oracle run — a feature, not a clean
 * (ADR 0150 rule 16) — so it is recorded as owed instead of being done at the end of a sweep.
 *
 * Deleting six lines an accepted design relies on needs its own decision; the same call was made for
 * `isRepository` in `core/git`.
 *
 * Builds a class-hierarchy map from tree-sitter AST heritage captures and
 * resolves method calls to their defining class via Python's MRO.
 *
 * Usage:
 *   const mroResolver = new PythonMROResolver();
 *   mroResolver.addClassHeritage('Foo', ['A', 'B']);
 *   mroResolver.addClassMethods('A', ['save', '__init__']);
 *   const mro = mroResolver.getMRO('Foo');
 *   const definer = mroResolver.resolveMethod('Foo', 'save');
 */
export class PythonMROResolver {
  /** class name → direct base class list (in declaration order) */
  private classMap: Map<string, string[]> = new Map();

  /** class name → set of method/attribute names it directly defines */
  private methodIndex: Map<string, Set<string>> = new Map();

  /**
   * Registers the direct base classes for a class definition.
   * Typically called when processing a `@heritage` capture from the query.
   *
   * @param className   - Name of the class being defined.
   * @param baseClasses - Base class names in left-to-right declaration order.
   */
  public addClassHeritage(className: string, baseClasses: string[]): void {
    this.classMap.set(className, baseClasses);
  }

  /**
   * Registers the set of methods/attributes directly defined on a class.
   *
   * @param className - The class that owns these definitions.
   * @param methods   - Method/attribute names defined in the class body.
   */
  public addClassMethods(className: string, methods: string[]): void {
    this.methodIndex.set(className, new Set(methods));
  }

  /**
   * Returns the full MRO for the given class.
   * Returns `[className, 'object']` if the class has no registered bases.
   */
  public getMRO(className: string): string[] {
    const bases = this.classMap.get(className) ?? [];
    return buildMRO(className, bases, this.classMap);
  }

  /**
   * Resolves which class in the MRO defines `methodName` for instances of
   * `className`. Returns `undefined` if no class in the MRO defines it.
   */
  public resolveMethod(className: string, methodName: string): string | undefined {
    const mro = this.getMRO(className);
    return resolveMethodInMRO(methodName, mro, this.methodIndex);
  }
}

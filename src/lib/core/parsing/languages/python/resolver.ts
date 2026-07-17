import path from "node:path";

/**
 * Conducks — Python Import Resolver (PEP 328 & 451) 🐍
 *
 * Resolves Python import paths to absolute file paths.
 */

export class PythonResolver {
  /**
   * Resolves a Python import relative to the current file.
   */
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
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

  /**
   * Checks for .py or __init__.py files.
   */
  private tryExtensions(target: string, allFiles: string[]): string | undefined {
    // PEP 451: package (__init__.py) before module (.py)
    const init = path.join(target, "__init__.py").toLowerCase();
    if (allFiles.includes(init)) return init;

    const py = (target + ".py").toLowerCase();
    if (allFiles.includes(py)) return py;

    return undefined;
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
export function buildMRO(
  className: string,
  baseClasses: string[],
  classMap: Map<string, string[]>
): string[] {
  const result: string[] = [className];
  const seen = new Set<string>([className]);

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
export function resolveMethodInMRO(
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
